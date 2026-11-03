import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { ManualInvoiceError } from './manual-invoices'

/** Inspect the PDF before sending it to a paid provider; never render or execute PDF actions. */
export async function validateInvoicePdf(bytes: Buffer, signal: AbortSignal) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const requireFromProject = createRequire(`${process.cwd()}/package.json`)
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(requireFromProject.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), enableXfa: false,
    stopAtErrors: true, useSystemFonts: false, maxImageSize: 8_000_000 })
  const stop = () => { void task.destroy().catch(() => {}) }
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  boundedSignal.addEventListener('abort', stop, { once: true })
  try {
    boundedSignal.throwIfAborted()
    const document = await task.promise
    boundedSignal.throwIfAborted()
    if (document.numPages > 5) throw new ManualInvoiceError('Carga una sola factura de hasta 5 páginas.', 400)
  } catch (error) {
    if (error instanceof ManualInvoiceError) throw error
    if (boundedSignal.aborted) throw new ManualInvoiceError('No se pudo revisar el PDF a tiempo. Usa otro archivo o la lectura local.', 422)
    throw new ManualInvoiceError('El PDF no es válido o está protegido. Usa un PDF sin contraseña o una foto.', 400)
  } finally {
    boundedSignal.removeEventListener('abort', stop)
    await task.destroy().catch(() => {})
  }
}
