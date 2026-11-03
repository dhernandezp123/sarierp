import { MANUAL_INVOICE_MAX_BYTES, manualInvoiceMime, validateManualInvoice, type ManualInvoiceDateOrder } from '../manual-invoice'
import type { OcrProgress } from './manual-invoice-ocr'

export async function readInvoiceWithAi(file: File, dateFormat: ManualInvoiceDateOrder,
  onProgress: (progress: OcrProgress) => void, signal: AbortSignal) {
  if (file.size <= 0 || file.size > MANUAL_INVOICE_MAX_BYTES) throw new Error('Carga un solo archivo de hasta 3 MB.')
  signal.throwIfAborted()
  const mime = manualInvoiceMime(new Uint8Array(await file.arrayBuffer()))
  signal.throwIfAborted()
  if (!mime || (file.type && file.type !== mime)) throw new Error('El archivo debe ser un PDF, JPG, PNG o WEBP válido.')
  onProgress({ message: 'Enviando documento para lectura con IA…', percent: 10 })
  const form = new FormData()
  form.set('file', file); form.set('date_format', dateFormat)
  let response: Response
  try {
    response = await fetch('/api/manual-invoices/ocr', {
      method: 'POST', body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(85_000)]), cache: 'no-store',
    })
  } catch (error) {
    signal.throwIfAborted()
    throw new Error(error instanceof Error && error.name === 'TimeoutError'
      ? 'La lectura con IA tardó demasiado. Puedes reintentar o usar la lectura local.'
      : 'No se pudo conectar con la lectura con IA. Reintenta o usa la lectura local.')
  }
  signal.throwIfAborted()
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'No se pudo leer con IA. Puedes usar la lectura local.')
  signal.throwIfAborted()
  const data = validateManualInvoice(body.data, false)
  onProgress({ message: 'Lectura lista para revisión.', percent: 100 })
  return { data, text: '', warnings: Array.isArray(body.warnings) ? body.warnings as string[] : [],
    source_total: typeof body.source_total === 'string' ? body.source_total : '' }
}
