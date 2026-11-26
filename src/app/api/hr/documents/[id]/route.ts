import { NextResponse } from 'next/server'
import { requireHrSession } from '@/src/lib/server/hr-access'
import { HR_DOCUMENT_BUCKET, isHrUuid } from '@/src/lib/hr-documents'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireHrSession()
  if (!session.ok) return session.response
  const { id } = await params
  if (!isHrUuid(id)) return Response.json({ error: 'Documento no disponible.' }, { status: 404 })
  const record = await session.client.from('hr_signed_documents').select('storage_path,file_name').eq('id', id).maybeSingle()
  if (record.error) return Response.json({ error: 'No se pudo consultar el documento.' }, { status: 503 })
  if (!record.data) return Response.json({ error: 'Documento no disponible.' }, { status: 404 })
  const signed = await session.client.storage.from(HR_DOCUMENT_BUCKET).createSignedUrl(record.data.storage_path, 60, { download: record.data.file_name })
  if (signed.error || !signed.data?.signedUrl) return Response.json({ error: 'No se pudo abrir el documento.' }, { status: 503 })
  return NextResponse.redirect(signed.data.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
