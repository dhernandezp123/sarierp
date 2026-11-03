import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { validateInvoicePdf } = loadTs('src/lib/server/manual-invoice-pdf.ts', { '@/src/lib/supabase/server': {} })
function pdfWithPages(count) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, n) => `${n + 3} 0 R`).join(' ')}] >>`,
    ...Array.from({ length: count }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>')]
  let text = '%PDF-1.7\n'
  const offsets = [0]
  objects.forEach((value, n) => { offsets.push(Buffer.byteLength(text)); text += `${n + 1} 0 obj\n${value}\nendobj\n` })
  const start = Buffer.byteLength(text)
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return Buffer.from(text)
}

test('paid OCR inspects real PDFs and rejects corrupt files or more than five pages before provider upload', async () => {
  const signal = new AbortController().signal
  for (const count of [1, 5]) await validateInvoicePdf(pdfWithPages(count), signal)
  await assert.rejects(() => validateInvoicePdf(pdfWithPages(6), signal), error => error.status === 400 && /5 páginas/.test(error.message))
  await assert.rejects(() => validateInvoicePdf(Buffer.from('%PDF-1.7 broken'), signal), error => error.status === 400 && /no es válido/.test(error.message))
})

test('a missing PDF runtime dependency gives an actionable error instead of a generic 500', async (t) => {
  t.mock.method(console, 'error', () => {})
  const { validateInvoicePdf: unavailableReader } = loadTs('src/lib/server/manual-invoice-pdf.ts', {
    '@/src/lib/supabase/server': {},
    'pdfjs-dist/legacy/build/pdf.mjs': { get GlobalWorkerOptions() { throw new ReferenceError('DOMMatrix is not defined') } },
  })
  await assert.rejects(() => unavailableReader(pdfWithPages(1), new AbortController().signal), error => {
    assert.equal(error.status, 503)
    assert.match(error.message, /lector PDF del servidor/)
    assert.doesNotMatch(error.message, /DOMMatrix|node_modules/)
    return true
  })
})
