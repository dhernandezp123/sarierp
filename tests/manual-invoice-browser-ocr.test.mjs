import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import nextTesting from 'next/experimental/testing/server.js'
// Next 16.2.6 still exports this test helper under its previous name.
const doesProxyMatch = nextTesting.unstable_doesMiddlewareMatch

const { parseInvoiceOcr, invoiceOcrDate } = loadTs('src/lib/manual-invoice-ocr-parser.ts')
const { waitForOcr, readInvoiceInBrowser } = loadTs('src/lib/browser/manual-invoice-ocr.ts')
const { manualInvoiceTotal } = loadTs('src/lib/manual-invoice.ts')
const word = (text, x, y) => ({ text, x, y, width: text.length * 5, height: 10, confidence: 95 })
function example(number = '131326', amounts = ['3,300.00', '470.00', '75.00']) {
  return { width: 1000, height: 1300, words: [
    word('SARI EXPRESS FORWARDERS, INC', 300, 40), word('INVOICE', 750, 100),
    word('Bill to:', 40, 150), word('Invoice #:', 680, 150), word(number, 790, 150),
    word('M&D IMPORT S DE RL', 40, 170), word('Date:', 680, 170), word('09/28/2026', 790, 170),
    word('COMPLEJO IND. COSTA DEL ESTE', 40, 190), word('File #:', 680, 190),
    word('SAN PEDRO SULA, HONDURAS', 40, 210), word('Cust. Ref.:', 680, 210),
    word('Due date:', 680, 230), word('09/28/2026', 790, 230),
    word('Shipper:', 40, 270), word('SARI EXPRESS CONSOLIDATORS', 150, 270),
    word('HAWB/HBL', 500, 270), word('HBL-87574', 620, 270), word('Charges:', 790, 270), word('COLLECT', 870, 270),
    word('Consignee:', 40, 290), word('M&D IMPORT S DE RL', 150, 290), word('MAWB/MBL:', 500, 290), word('MBL-31706', 620, 290),
    word('Carrier:', 40, 310), word('SERVIPORT MARINE SOLUTIONS, LLC', 150, 310),
    word('Origin:', 500, 310), word('PORT EVERGLADES, FL', 590, 310), word('Weight:', 790, 310), word('44,984 Lb', 870, 310),
    word('Desc of goods:', 40, 330), word('40NOR CONTAINER NO.HLJU0032531', 150, 330), word('Dest:', 500, 330), word('PUERTO CORTES/HONDURAS', 590, 330),
    word('Booking #:', 40, 365), word('Cont Size:', 275, 365), word('Container #:', 510, 365), word('Consol #:', 745, 365),
    word('HDR7948', 745, 382),
    word('Description of Charges', 250, 410), word('Amount', 880, 410),
    word('OCEAN FREIGHT FROM BILL OF LADING HBL-87574', 40, 440), word(amounts[0], 890, 440),
    word('LOADING/UNLOADING FROM BILL OF LADING HBL-87574', 40, 460), word(amounts[1], 890, 460),
    word('DOCUMENTATION FEE FROM BILL OF LADING HBL-87574', 40, 480), word(amounts[2], 890, 480),
    word('WR #:456308', 40, 500), word('WR #:456800', 40, 520),
    word('Total Amount:', 620, 1150), word('USD 3,845.00', 880, 1150),
    word('Remarks:', 40, 1200), word('PAYMENTS INFORMATION', 40, 1220),
  ] }
}

test('browser parser separates SARI columns, WR and totals without a provider', () => {
  const result = parseInvoiceOcr([example()])
  assert.equal(result.data.invoice_number, '131326')
  assert.equal(result.data.bill_to_name, 'M&D IMPORT S DE RL')
  assert.equal(result.data.bill_to_city, 'SAN PEDRO SULA, HONDURAS')
  assert.equal(result.data.issue_date, '2026-09-28')
  assert.equal(result.data.due_date, '2026-09-28')
  assert.equal(result.data.hbl, 'HBL-87574')
  assert.equal(result.data.carrier, 'SERVIPORT MARINE SOLUTIONS, LLC')
  assert.equal(result.data.weight_lb, '44,984')
  assert.equal(result.data.consol_number, 'HDR7948')
  assert.equal(result.data.items.length, 3)
  assert.equal(manualInvoiceTotal(result.data), 3845)
  assert.equal(result.source_total, '3,845.00')
  assert.deepEqual(result.data.warehouse_receipts, ['456308', '456800'])
})

test('date order is explicit and impossible or OCR-corrupted dates stay empty', () => {
  assert.equal(invoiceOcrDate('09/10/2026', 'mdy'), '2026-09-10')
  assert.equal(invoiceOcrDate('09/10/2026', 'dmy'), '2026-10-09')
  assert.equal(invoiceOcrDate('02/30/2026', 'mdy'), '')
  assert.equal(invoiceOcrDate('O9/28/2026', 'mdy'), '')
  assert.equal(parseInvoiceOcr([example()], 'dmy').data.issue_date, '')
})

test('frame punctuation does not pollute totals and charges cannot overwrite header fields', () => {
  const page = example()
  page.words.find((w) => w.text === 'Total Amount:').text = '( Total Amount:'
  page.words.find((w) => w.text === 'HBL-87574').text = '! HBL-87574'
  page.words.find((w) => w.text.startsWith('OCEAN FREIGHT')).text += ' Invoice #:9999'
  const result = parseInvoiceOcr([page])
  assert.equal(result.source_total, '3,845.00')
  assert.equal(result.data.hbl, 'HBL-87574')
  assert.equal(result.data.invoice_number, '131326')
})

test('OCR keeps zero, flags unreadable amounts and never guesses manual defaults', () => {
  const result = parseInvoiceOcr([example('131326', ['0.00', '47O.OO', ''])])
  assert.deepEqual(result.data.items.map((item) => item.amount), ['0.00', '', ''])
  assert.equal(result.data.pieces, '')
  const empty = parseInvoiceOcr([{ width: 100, height: 100, words: [word('SARI INVOICE', 0, 0)] }])
  assert.equal(empty.data.issue_date, '')
  assert.equal(empty.data.shipper, '')
  assert.equal(empty.data.origin, '')
  assert.ok(result.warnings.some((warning) => warning.includes('importe')))
})

test('different invoice numbers are refused instead of merging documents', () => {
  const result = parseInvoiceOcr([example('131326'), example('OTHER-INVOICE')])
  assert.equal(result.data.invoice_number, '')
  assert.deepEqual(result.data.items, [])
  assert.equal(result.source_total, '')
  assert.ok(result.warnings.some((warning) => warning.includes('diferentes')))
  assert.equal(parseInvoiceOcr([example(), example()]).data.items.length, 6)
  const sideBySide = example(); sideBySide.words.push(word('Invoice #:OTHER', 910, 150))
  assert.equal(parseInvoiceOcr([sideBySide]).data.items.length, 0)
})

test('unrecognized documents and overlong fields do not fabricate usable invoices', () => {
  const other = example(); other.words[0].text = 'OTHER COMPANY'
  assert.equal(parseInvoiceOcr([other]).data.invoice_number, '')
  const long = example(); long.words.find((w) => w.text === 'M&D IMPORT S DE RL').text = 'A'.repeat(101)
  assert.equal(parseInvoiceOcr([long]).data.bill_to_name, '')
})

test('cancelling a read releases a worker that initializes late', async () => {
  const controller = new AbortController()
  let finish
  let released = false
  const operation = new Promise((resolve) => { finish = resolve })
  const waiting = waitForOcr(operation, controller.signal, () => { released = true })
  controller.abort()
  await assert.rejects(waiting, (error) => error.name === 'AbortError')
  finish({ worker: true })
  await Promise.resolve()
  assert.equal(released, true)
})

test('browser reader rejects disguised uploads before loading an OCR engine', async () => {
  const file = new File(['<html>fake PDF</html>'], 'scan.pdf', { type: 'application/pdf' })
  await assert.rejects(() => readInvoiceInBrowser(file, 'mdy', () => {}, new AbortController().signal), /archivo debe/)
})

test('only public OCR runtime files bypass the proxy; invoice routes retain access checks', () => {
  const { config } = loadTs('src/proxy.ts')
  for (const url of ['/ocr-assets/runtime/pdf-worker.mjs', '/ocr-assets/runtime/tesseract-core.wasm', '/ocr-assets/lang/eng.traineddata.gz']) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), false)
  }
  for (const url of ['/manual-invoices', '/api/manual-invoices', '/api/manual-invoices/ocr', '/ocr-assets-private/document']) {
    assert.equal(doesProxyMatch({ config, nextConfig: {}, url }), true)
  }
})
