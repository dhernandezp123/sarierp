import { MANUAL_INVOICE_MAX_BYTES, manualInvoiceMime, validateManualInvoice, type ManualInvoiceDateOrder } from '../manual-invoice'
import type { OcrProgress } from './manual-invoice-ocr'

export async function readInvoiceWithAi(file: File, dateFormat: ManualInvoiceDateOrder,
  onProgress: (progress: OcrProgress) => void, signal: AbortSignal) {
  if (file.size <= 0 || file.size > MANUAL_INVOICE_MAX_BYTES) throw new Error('Carga un solo archivo de hasta 3 MB.')
  signal.throwIfAborted()
  const mime = manualInvoiceMime(new Uint8Array(await file.arrayBuffer()))
  signal.throwIfAborted()
  if (!mime || (file.type && file.type !== mime)) throw new Error('El archivo debe ser un PDF, JPG, PNG o WEBP válido.')
  // The OCR gateway does not forward PDF documents reliably; images always reach the model.
  const uploads = mime === 'application/pdf' ? await pdfToPageJpegs(file, onProgress, signal) : [file]
  onProgress({ message: 'Enviando documento para lectura con IA…', percent: 30 })
  const form = new FormData()
  uploads.forEach((upload) => form.append('file', upload)); form.set('date_format', dateFormat)
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

const PDF_ASSETS = '/ocr-assets/runtime'
const MAX_PAGES = 5
const TARGET_WIDTH = 1500
/** Renders each PDF page to a JPEG; all pages together stay under the upload limit. */
export async function pdfToPageJpegs(file: File, onProgress: (progress: OcrProgress) => void, signal: AbortSignal): Promise<File[]> {
  onProgress({ message: 'Preparando las páginas del PDF…', percent: 5 })
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDF_ASSETS}/pdf-worker.mjs`
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), enableXfa: false, stopAtErrors: true,
    cMapUrl: `${PDF_ASSETS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDF_ASSETS}/standard_fonts/`, wasmUrl: `${PDF_ASSETS}/wasm/` })
  const pages: HTMLCanvasElement[] = []
  const unsupported = 'Este navegador no puede preparar el PDF. Usa una foto o la lectura local.'
  try {
    const doc = await task.promise
    if (doc.numPages > MAX_PAGES) throw new Error('La lectura con IA admite hasta 5 páginas de una sola factura.')
    for (let number = 1; number <= doc.numPages; number++) {
      signal.throwIfAborted()
      const page = await doc.getPage(number)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error(unsupported)
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, viewport }).promise
      pages.push(canvas)
    }
  } catch (error) {
    if (signal.aborted || (error instanceof Error && (error.message === unsupported || error.message.startsWith('La lectura con IA')))) throw error
    throw new Error('El PDF no es válido o está protegido. Usa un PDF sin contraseña o una foto.')
  } finally { await task.destroy().catch(() => {}) }
  try {
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blobs = await Promise.all(pages.map((page) => new Promise<Blob | null>((resolve) => page.toBlob(resolve, 'image/jpeg', quality))))
      if (blobs.every(Boolean) && blobs.reduce((sum, blob) => sum + (blob?.size ?? 0), 0) <= MANUAL_INVOICE_MAX_BYTES) {
        const name = file.name.replace(/\.pdf$/i, '')
        return blobs.map((blob, index) => new File([blob as Blob], `${name}-p${index + 1}.jpg`, { type: 'image/jpeg' }))
      }
    }
  } finally { for (const page of pages) page.width = page.height = 1 }
  throw new Error('El PDF es demasiado grande para la lectura con IA. Usa una foto o la lectura local.')
}
