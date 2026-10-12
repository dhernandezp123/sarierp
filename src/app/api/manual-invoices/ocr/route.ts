import { authorizeManualInvoices, manualInvoiceErrorResponse, ManualInvoiceError, readLimitedInvoiceBody } from '@/src/lib/server/manual-invoices'
import { extractManualInvoice } from '@/src/lib/server/manual-invoice-ocr'
import { MANUAL_INVOICE_MAX_BYTES, manualInvoiceMime } from '@/src/lib/manual-invoice'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function GET(request: Request) {
  try {
    await authorizeManualInvoices(request)
    return Response.json({ enabled: process.env.MANUAL_INVOICE_OCR_ENABLED === 'true' && Boolean(process.env.OPENAI_API_KEY) },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return manualInvoiceErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await authorizeManualInvoices(request)
    const key = process.env.OPENAI_API_KEY
    if (process.env.MANUAL_INVOICE_OCR_ENABLED !== 'true' || !key) {
      throw new ManualInvoiceError('El OCR todavía no está habilitado. Puedes completar los campos manualmente.', 503)
    }
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.startsWith('multipart/form-data;')) throw new ManualInvoiceError('Carga un PDF o una foto.', 400)
    const body = await readLimitedInvoiceBody(request, MANUAL_INVOICE_MAX_BYTES + 64 * 1024)
    let form: FormData
    try { form = await new Response(new Uint8Array(body), { headers: { 'Content-Type': contentType } }).formData() }
    catch { throw new ManualInvoiceError('El formulario de carga no es válido.', 400) }
    const file = form.get('file')
    if (!(file instanceof File) || file.size <= 0 || file.size > MANUAL_INVOICE_MAX_BYTES || form.getAll('file').length !== 1) {
      throw new ManualInvoiceError('Carga un solo archivo de hasta 3 MB.', 400)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const mime = manualInvoiceMime(bytes)
    if (!mime || (file.type && file.type !== mime)) throw new ManualInvoiceError('Solo se aceptan PDF, JPG, PNG o WEBP válidos.', 415)
    // Atomic per-user daily quota is enforced in PostgreSQL across server instances.
    const { data: allowed, error: quotaError } = await supabase.rpc('claim_manual_invoice_ocr')
    if (quotaError) throw new ManualInvoiceError('No se pudo validar el cupo OCR. Verifica la migración del módulo.', 503)
    if (allowed !== true) throw new ManualInvoiceError('Alcanzaste el cupo de 20 lecturas OCR de hoy. Puedes continuar manualmente.', 429)
    const result = await extractManualInvoice(bytes, mime, key, process.env.MANUAL_INVOICE_OCR_MODEL || 'gpt-4.1-mini')
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return manualInvoiceErrorResponse(new ManualInvoiceError('El OCR tardó demasiado. Intenta nuevamente o continúa manualmente.', 504))
    }
    return manualInvoiceErrorResponse(error)
  }
}
