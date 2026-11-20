import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { requireHrSession } from '@/src/lib/server/hr-access'
import { HR_DOCUMENT_BUCKET, HR_DOCUMENT_MAX_BYTES, hrDocumentMime, isHrUuid, hrSameOrigin } from '@/src/lib/hr-documents'

export const runtime = 'nodejs'
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const session = await requireHrSession(true)
  if (!session.ok) return session.response
  // Proxy.ts validates Host against the tenant. request.url may use an internal Next hostname.
  if (!hrSameOrigin(request.headers.get('origin'), request.headers.get('host'))) return error('Origen no autorizado.', 403)
  if (Number(request.headers.get('content-length') || 0) > HR_DOCUMENT_MAX_BYTES + 1024 * 1024) return error('El archivo excede 10 MB.', 413)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY, url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) return error('La carga privada de documentos no está configurada.', 503)
  let form: FormData
  try { form = await request.formData() } catch { return error('Carga inválida.', 400) }
  const file = form.get('file'), certificate = String(form.get('certificate_id') || ''), requestId = String(form.get('request_id') || ''), signedOn = String(form.get('signed_on') || '')
  if (!(file instanceof File) || file.size < 1 || file.size > HR_DOCUMENT_MAX_BYTES || !isHrUuid(certificate) || !isHrUuid(requestId) || !/^\d{4}-\d{2}-\d{2}$/.test(signedOn) || form.get('attested') !== 'true') return error('Selecciona una constancia, archivo y fecha de firma válidos; confirma que contiene las firmas.', 400)
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = hrDocumentMime(bytes)
  if (!mime) return error('Usa un PDF, PNG o JPEG válido.', 400)
  const sha = createHash('sha256').update(bytes).digest('hex'), service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const prepared = await service.rpc('hr_prepare_document_upload', { p_request_id: requestId, p_certificate_id: certificate, p_file_name: file.name.slice(0, 180), p_mime: mime, p_size: bytes.length, p_sha256: sha, p_signed_on: signedOn, p_actor: session.user.id })
  if (prepared.error) return error(prepared.error.code === '42501' ? 'Constancia no disponible.' : 'No se pudo preparar la carga. Verifica la fecha o vuelve a seleccionar el archivo.', prepared.error.code === '42501' ? 404 : 409)
  const intent = prepared.data?.[0] as { upload_id: string; storage_path: string; document_id: string | null } | undefined
  if (!intent) return error('No se pudo preparar la carga.', 503)
  if (intent.document_id) return Response.json({ id: intent.document_id }, { headers: { 'Cache-Control': 'no-store' } })
  const upload = await service.storage.from(HR_DOCUMENT_BUCKET).upload(intent.storage_path, bytes, { contentType: mime, upsert: false })
  if (upload.error) {
    // A retry may find the previous upload after a lost HTTP response. Verify its actual bytes.
    const existing = await service.storage.from(HR_DOCUMENT_BUCKET).download(intent.storage_path)
    if (existing.error || !existing.data || createHash('sha256').update(new Uint8Array(await existing.data.arrayBuffer())).digest('hex') !== sha) return error('No se pudo cargar el archivo. Puedes reintentar con el mismo documento.', 503)
  }
  const finalized = await service.rpc('hr_finalize_document_upload', { p_upload_id: intent.upload_id, p_actor: session.user.id })
  if (finalized.error) return error('El archivo sigue pendiente de registro. Reintenta con el mismo documento.', 503)
  return Response.json({ id: finalized.data }, { headers: { 'Cache-Control': 'no-store' } })
}
