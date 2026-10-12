import type { Worker as OcrWorker } from 'tesseract.js'
import { MANUAL_INVOICE_MAX_BYTES, manualInvoiceMime } from '../manual-invoice'
import { parseInvoiceOcr, type InvoiceDateOrder, type InvoiceOcrPage } from '../manual-invoice-ocr-parser'

export type OcrProgress = { message: string; percent: number }
const MAX_PAGES = 5
const MAX_PIXELS = 8_000_000
const ASSETS = '/ocr-assets/runtime'

export function waitForOcr<T>(operation: Promise<T>, signal: AbortSignal, releaseLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Lectura cancelada.', 'AbortError'))
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    operation.then((value) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) releaseLate?.(value)
      else resolve(value)
    }, (error) => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

function canvasFor(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('El navegador no permite procesar imágenes. Usa otro navegador o la captura manual.')
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

export async function readInvoiceInBrowser(file: File, order: InvoiceDateOrder, onProgress: (progress: OcrProgress) => void, externalSignal: AbortSignal) {
  const controller = new AbortController()
  const cancel = () => controller.abort(externalSignal.reason)
  if (externalSignal.aborted) cancel()
  else externalSignal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => controller.abort(new Error('La lectura tardó demasiado. Prueba una foto más clara o continúa manualmente.')), 180_000)
  const signal = controller.signal
  let worker: OcrWorker | undefined
  let pdfTask: import('pdfjs-dist').PDFDocumentLoadingTask | undefined
  let bitmap: ImageBitmap | undefined
  const canvases: HTMLCanvasElement[] = []
  let currentPage = 1
  let pageCount = 1
  const abortWorker = () => { void worker?.terminate(); void pdfTask?.destroy().catch(() => {}) }
  signal.addEventListener('abort', abortWorker, { once: true })
  const progress = (message: string, percent: number) => { if (!signal.aborted) onProgress({ message, percent: Math.round(percent) }) }
  const recognize = async (canvas: HTMLCanvasElement, page: number, count: number): Promise<InvoiceOcrPage> => {
    currentPage = page; pageCount = count
    if (!worker) {
      progress('Preparando el lector gratuito…', 5)
      const { default: tesseract } = await waitForOcr(import('tesseract.js'), signal)
      const { createWorker, PSM } = tesseract
      let failWorker: (error: Error) => void = () => {}
      const failure = new Promise<never>((_, reject) => { failWorker = reject })
      const initialization = createWorker('eng', 1, {
        workerPath: `${window.location.origin}${ASSETS}/tesseract-worker.js`,
        corePath: `${window.location.origin}${ASSETS}`,
        langPath: `${window.location.origin}/ocr-assets/lang`,
        workerBlobURL: false, gzip: true,
        errorHandler: () => failWorker(new Error('No se pudo iniciar el lector. Recarga la página y vuelve a intentar.')),
        logger: (message) => {
          if (message.status === 'recognizing text') progress(`Leyendo página ${currentPage} de ${pageCount}…`, 20 + 75 * ((currentPage - 1 + message.progress) / pageCount))
        },
      })
      // A worker that finishes initializing after cancellation is immediately released.
      initialization.then((late) => { if (signal.aborted) void late.terminate() }, () => {})
      worker = await waitForOcr(Promise.race([initialization, failure]), signal, (late) => { void late.terminate() })
      await waitForOcr(worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1', user_defined_dpi: '300' }), signal)
    }
    const { data } = await waitForOcr(worker.recognize(canvas, { rotateAuto: true }, { text: true, blocks: true }), signal)
    const words = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words)))
      .map((word) => ({ text: word.text.trim(), x: word.bbox.x0, y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0, confidence: word.confidence }))
    return { width: canvas.width, height: canvas.height, words }
  }
  try {
    if (file.size <= 0 || file.size > MANUAL_INVOICE_MAX_BYTES) throw new Error('Carga un solo archivo de hasta 3 MB.')
    progress('Abriendo documento en este dispositivo…', 0)
    const bytes = new Uint8Array(await waitForOcr(file.arrayBuffer(), signal))
    const mime = manualInvoiceMime(bytes)
    if (!mime || (file.type && file.type !== mime)) throw new Error('El archivo debe ser un PDF, JPG, PNG o WEBP válido.')
    const pages: InvoiceOcrPage[] = []
    if (mime === 'application/pdf') {
      const pdfjs = await waitForOcr(import('pdfjs-dist'), signal)
      pdfjs.GlobalWorkerOptions.workerSrc = `${ASSETS}/pdf-worker.mjs`
      pdfTask = pdfjs.getDocument({ data: bytes, enableXfa: false, stopAtErrors: true,
        maxImageSize: MAX_PIXELS, canvasMaxAreaInBytes: MAX_PIXELS * 4,
        cMapUrl: `${ASSETS}/cmaps/`, cMapPacked: true,
        standardFontDataUrl: `${ASSETS}/standard_fonts/`, wasmUrl: `${ASSETS}/wasm/` })
      const doc = await waitForOcr(pdfTask.promise, signal)
      if (doc.numPages > MAX_PAGES) throw new Error('El lector admite hasta 5 páginas de una sola factura. Divide el PDF o completa la factura manualmente.')
      for (let number = 1; number <= doc.numPages; number++) {
        const page = await waitForOcr(doc.getPage(number), signal)
        const viewport = page.getViewport({ scale: 1 })
        const content = await waitForOcr(page.getTextContent(), signal)
        if (content.items.length > 20_000) throw new Error('El lector encontró demasiados elementos en una página. Usa una copia más simple del PDF.')
        const words = content.items.flatMap((item) => {
          if (!('str' in item) || !item.str.trim()) return []
          const [, , c, d, x, baseline] = pdfjs.Util.transform(viewport.transform, item.transform)
          const height = Math.hypot(c, d)
          return [{ text: item.str.trim(), x, y: baseline - height, width: item.width, height }]
        })
        const existingText = words.map((word) => word.text).join(' ')
        // A few header glyphs do not prove a scanned PDF has a complete text layer.
        if (/Invoice\s*[#№:]/i.test(existingText) && /Description\s+of\s+Charges/i.test(existingText) && words.length >= 25) {
          pages.push({ width: viewport.width, height: viewport.height, words })
          progress(`Leyendo texto de página ${number} de ${doc.numPages}…`, 20 + 75 * number / doc.numPages)
        } else {
          const scale = Math.min(3, 2600 / Math.max(viewport.width, viewport.height), Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)))
          const renderViewport = page.getViewport({ scale })
          const { canvas } = canvasFor(renderViewport.width, renderViewport.height)
          canvases.push(canvas)
          const render = page.render({ canvas, viewport: renderViewport })
          await waitForOcr(render.promise, signal)
          pages.push(await recognize(canvas, number, doc.numPages))
          canvas.width = canvas.height = 1
        }
        page.cleanup()
      }
    } else {
      bitmap = await waitForOcr(createImageBitmap(file), signal, (late) => late.close())
      const scale = Math.min(2800 / Math.max(bitmap.width, bitmap.height), Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)))
      const { canvas, context } = canvasFor(bitmap.width * scale, bitmap.height * scale)
      canvases.push(canvas)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      for (let i = 0; i < pixels.data.length; i += 4) {
        const gray = Math.min(255, Math.max(0, (0.299 * pixels.data[i] + 0.587 * pixels.data[i + 1] + 0.114 * pixels.data[i + 2] - 128) * 1.2 + 128))
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray
      }
      context.putImageData(pixels, 0, 0)
      pages.push(await recognize(canvas, 1, 1))
    }
    progress('Ordenando campos y cargos…', 98)
    const result = parseInvoiceOcr(pages, order)
    progress('Lectura terminada. Revisa los resultados.', 100)
    return result
  } catch (error) {
    if (signal.aborted) throw signal.reason ?? new DOMException('Lectura cancelada.', 'AbortError')
    if (error instanceof Error && /Password/i.test(error.name)) throw new Error('El PDF tiene contraseña. Carga una copia desbloqueada.')
    throw new Error(error instanceof Error && error.message.startsWith('El lector') ? error.message
      : error instanceof Error && /hasta 3 MB|archivo debe|navegador|iniciar el lector/.test(error.message) ? error.message
      : 'No se pudo leer el documento en este dispositivo. Intenta una imagen más clara o completa los campos manualmente.')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abortWorker)
    externalSignal.removeEventListener('abort', cancel)
    await worker?.terminate()
    await pdfTask?.destroy().catch(() => {})
    bitmap?.close()
    canvases.forEach((canvas) => { canvas.width = canvas.height = 1 })
  }
}
