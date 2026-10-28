import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const invoice = loadTs('src/lib/manual-invoice.ts')
const complete = () => ({ ...invoice.blankManualInvoice(), invoice_number: '131326', bill_to_name: 'M&D IMPORT S DE RL',
  issue_date: '2026-09-28', due_date: '2026-09-28', items: [
    { description: 'OCEAN FREIGHT FROM BILL OF LADING HBL-87574', amount: '3,300.00' },
    { description: 'LOADING/UNLOADING FROM BILL OF LADING HBL-87574', amount: '470.00' },
    { description: 'DOCUMENTATION FEE FROM BILL OF LADING HBL-87574', amount: '75.00' },
  ], warehouse_receipts: ['456308', '456800', '457319', '458029', '458428', '459221'] })

test('SARI sample total is derived from charges and ignores a supplied total', () => {
  const data = invoice.validateManualInvoice({ ...complete(), total: 1 })
  assert.equal(invoice.manualInvoiceTotal(data), 3845)
  assert.equal('total' in data, false)
  data.items[0].amount = '0.10'; data.items[1].amount = '0.20'; data.items[2].amount = '0'
  assert.equal(invoice.manualInvoiceTotal(data), 0.3)
})

test('USD parser preserves zero and rejects negative, ambiguous, scientific and excessive amounts', () => {
  for (const [text, cents] of [['0', 0], ['USD 3,300.00', 330000], ['$75.05', 7505], ['0.1', 10]]) assert.equal(invoice.manualInvoiceCents(text), cents)
  for (const text of ['', '-10', '1e3', '3.300,00', '3,30', '1.234', 'Infinity', '1000000000']) assert.equal(invoice.manualInvoiceCents(text), null)
})

test('OCR can return missing data, but incomplete documents cannot be saved or printed', () => {
  const data = { ...complete(), invoice_number: '', due_date: '', items: [{ description: 'Freight', amount: '' }] }
  assert.equal(invoice.validateManualInvoice(data, false).items[0].amount, '')
  assert.throws(() => invoice.validateManualInvoice(data), /Completa/)
  assert.throws(() => invoice.validateManualInvoice({ ...complete(), items: [] }), /cargos/)
})

test('strict fields and calendar dates reject malformed provider or direct request data', () => {
  for (const change of [{ issue_date: '2026-02-30' }, { issue_date: '09/28/2026' }, { carrier: 23 }, { bill_to_name: 'A'.repeat(101) }, { hbl: 'HBL\n123' }, { warehouse_receipts: [null] }, { items: Array(101).fill({ description: 'a', amount: '0' }) }]) {
    assert.throws(() => invoice.validateManualInvoice({ ...complete(), ...change }))
  }
  assert.equal(invoice.validateManualInvoice({ ...complete(), issue_date: '2028-02-29' }).issue_date, '2028-02-29')
})

test('invoice date format survives validation while old versions preserve DD/MM', () => {
  assert.equal(invoice.blankManualInvoice().date_format, 'mdy')
  for (const date_format of ['mdy', 'dmy']) {
    const restored = invoice.validateManualInvoice(JSON.parse(JSON.stringify({ ...complete(), date_format })))
    assert.equal(restored.date_format, date_format)
    assert.equal(restored.issue_date, '2026-09-28')
    assert.equal(invoice.formatManualInvoiceDate(restored.issue_date, date_format), date_format === 'mdy' ? '09/28/2026' : '28/09/2026')
  }
  const legacy = complete(); delete legacy.date_format
  assert.equal(invoice.validateManualInvoice(legacy).date_format, 'dmy')
  for (const date_format of ['YYYY/MM/DD', '', null, 12, {}]) {
    assert.throws(() => invoice.validateManualInvoice({ ...complete(), date_format }), /Selecciona/)
  }
  assert.equal(invoice.formatManualInvoiceDate('2028-02-29', 'mdy'), '02/29/2028')
  assert.equal(invoice.formatManualInvoiceDate('2026-02-30', 'mdy'), '')
})

test('large documents paginate all charges and WR references without dropping data', () => {
  const data = { ...complete(), items: Array.from({ length: 40 }, (_, i) => ({ description: `${i}-` + 'W'.repeat(170), amount: '12.00' })), warehouse_receipts: Array.from({ length: 200 }, (_, i) => String(i)) }
  const pages = invoice.manualInvoicePrintPages(data)
  assert.ok(pages.length > 1)
  assert.ok(pages.every((page) => page.length <= 30))
  const rows = pages.flat()
  assert.equal(rows.filter((row) => row.amount !== '').length, 40)
  assert.deepEqual(rows.filter((row) => row.wr).map((row) => row.description), data.warehouse_receipts.map((wr) => `WR #: ${wr}`))
  assert.equal(rows.filter((row) => !row.wr).map((row) => row.description).join(''), data.items.map((item) => item.description).join(''))
})

test('file signatures reject disguised uploads, and download names cannot contain paths', () => {
  assert.equal(invoice.manualInvoiceMime(Buffer.from('%PDF-1.7')), 'application/pdf')
  assert.equal(invoice.manualInvoiceMime(Uint8Array.from([137,80,78,71,13,10,26,10])), 'image/png')
  assert.equal(invoice.manualInvoiceMime(Uint8Array.from([255,216,255])), 'image/jpeg')
  assert.equal(invoice.manualInvoiceMime(Buffer.from('RIFF0000WEBP')), 'image/webp')
  assert.equal(invoice.manualInvoiceMime(Buffer.from('<html>fake.png</html>')), null)
  assert.equal(invoice.manualInvoiceFileName({ invoice_number: '../../evil/name' }), 'SARI-USA-Invoice-______evil_name.pdf')
})

test('access is limited to internal invoice roles, including Operations', () => {
  const { canAccessPath } = loadTs('src/lib/permissions.ts')
  for (const role of invoice.MANUAL_INVOICE_ROLES) assert.equal(canAccessPath(role, '/manual-invoices'), true)
  for (const role of ['Cliente', 'Ventas', 'Pricing', null]) assert.equal(canAccessPath(role, '/manual-invoices'), false)
})

test('bounded body reader rejects oversized streaming uploads without content-length', async () => {
  const { readLimitedInvoiceBody, ManualInvoiceError } = loadTs('src/lib/server/manual-invoices.ts', { '@/src/lib/supabase/server': {} })
  const request = new Request('https://example.local', { method: 'POST', body: 'abcde' })
  await assert.rejects(() => readLimitedInvoiceBody(request, 4), (error) => error instanceof ManualInvoiceError && error.status === 413)
  assert.equal((await readLimitedInvoiceBody(new Request('https://example.local', { method: 'POST', body: 'abc' }), 4)).toString(), 'abc')
})

test('OCR provider submits PDFs with schema, no retention, and parses output messages', async () => {
  const previousFetch = globalThis.fetch
  let request
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    request = JSON.parse(options.body)
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ...complete(), source_total: '3,845.00', warnings: ['Revisar carrier'] }) }] }] })
  }
  try {
    const { extractManualInvoice } = loadTs('src/lib/server/manual-invoice-ocr.ts', { '@/src/lib/supabase/server': {} })
    const result = await extractManualInvoice(Buffer.from('%PDF-1.7'), 'application/pdf', 'test-key', 'configured-model')
    assert.equal(request.model, 'configured-model'); assert.equal(request.store, false)
    assert.equal(request.input[0].content[1].type, 'input_file')
    assert.match(request.input[0].content[1].file_data, /^data:application\/pdf;base64,/)
    assert.equal(request.text.format.strict, true)
    assert.deepEqual(result.warnings, ['Revisar carrier']); assert.equal(result.source_total, '3,845.00')
    assert.equal(invoice.manualInvoiceTotal(result.data), 3845)
  } finally { globalThis.fetch = previousFetch }
})

test('OCR never accepts incomplete responses, refusals or invalid fields', async () => {
  const previousFetch = globalThis.fetch
  try {
    const { extractManualInvoice } = loadTs('src/lib/server/manual-invoice-ocr.ts', { '@/src/lib/supabase/server': {} })
    for (const output of [{ status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ ...complete(), issue_date: '2026-02-30' }) }] }] }]) {
      globalThis.fetch = async () => Response.json(output)
      await assert.rejects(() => extractManualInvoice(Buffer.from('fake'), 'image/jpeg', 'test', 'model'), (error) => error.status === 422)
    }
  } finally { globalThis.fetch = previousFetch }
})

test('OCR distinguishes exhausted credits from rate limits and hides provider error details', async () => {
  const previousFetch = globalThis.fetch
  try {
    const { extractManualInvoice } = loadTs('src/lib/server/manual-invoice-ocr.ts', { '@/src/lib/supabase/server': {} })
    for (const [response, expected] of [
      [Response.json({ error: { code: 'credit_balance_exhausted', message: 'private provider detail' } }, { status: 429 }), /agregar créditos/],
      [Response.json({ error: { code: 'rate_limit_exceeded', message: 'private provider detail' } }, { status: 429 }), /Intenta más tarde/],
      [new Response('private provider detail', { status: 500 }), /no pudo leer/],
    ]) {
      globalThis.fetch = async () => response
      await assert.rejects(() => extractManualInvoice(Buffer.from('synthetic'), 'image/jpeg', 'test', 'model'), (error) => {
        assert.equal(error.status, 502)
        assert.match(error.message, expected)
        assert.doesNotMatch(error.message, /private provider detail/)
        return true
      })
    }
  } finally { globalThis.fetch = previousFetch }
})
