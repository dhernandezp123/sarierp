import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const mocks = { '@/src/lib/supabase/server': {} }
const { blankManualInvoice } = loadTs('src/lib/manual-invoice.ts')
const { extractManualInvoice, manualInvoiceOcrConfiguration } = loadTs('src/lib/server/manual-invoice-ocr.ts', mocks)
const invoice = () => ({ ...blankManualInvoice(), invoice_number: 'OCR-TEST', bill_to_name: 'Cliente ficticio',
  issue_date: '2026-10-09', due_date: '2026-10-09', items: [{ description: 'Freight', amount: '10.00' }, { description: 'Free', amount: '0' }],
  warehouse_receipts: ['WR-TEST'], source_total: '10.00', warnings: [] })
const claude = (data = invoice(), extra = {}) => Response.json({ stop_reason: 'end_turn', content: [
  { type: 'thinking', thinking: 'Internal content must never become form data' },
  { type: 'text', text: JSON.stringify(data) },
], ...extra })

test('AI configuration selects only the configured provider key and never falls back silently', () => {
  const names = ['MANUAL_INVOICE_OCR_PROVIDER', 'MANUAL_INVOICE_OCR_ENABLED', 'MANUAL_INVOICE_OCR_MODEL', 'MANUAL_INVOICE_OCR_BASE_URL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']
  const old = Object.fromEntries(names.map(name => [name, process.env[name]]))
  try {
    Object.assign(process.env, { MANUAL_INVOICE_OCR_PROVIDER: 'anthropic', MANUAL_INVOICE_OCR_ENABLED: 'true', ANTHROPIC_API_KEY: ' claude-test ', OPENAI_API_KEY: 'openai-test' })
    delete process.env.MANUAL_INVOICE_OCR_MODEL
    delete process.env.MANUAL_INVOICE_OCR_BASE_URL
    assert.deepEqual(manualInvoiceOcrConfiguration(), { enabled: true, provider: 'anthropic', apiKey: 'claude-test', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' })
    process.env.MANUAL_INVOICE_OCR_BASE_URL = 'https://ai.starimg.ru/v1/'
    assert.equal(manualInvoiceOcrConfiguration().baseUrl, 'https://ai.starimg.ru')
    delete process.env.ANTHROPIC_API_KEY
    assert.equal(manualInvoiceOcrConfiguration().enabled, false)
    process.env.MANUAL_INVOICE_OCR_PROVIDER = 'unknown'
    assert.equal(manualInvoiceOcrConfiguration().provider, null)
    assert.equal(manualInvoiceOcrConfiguration().enabled, false)
    delete process.env.MANUAL_INVOICE_OCR_PROVIDER
    assert.equal(manualInvoiceOcrConfiguration().provider, 'openai')
  } finally { for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name] } }
})

test('AI STAR uses its documented endpoint and bearer authentication without changing extraction rules', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://ai.starimg.ru/v1/messages')
    assert.equal(options.headers.Authorization, 'Bearer gateway-test-key')
    assert.equal('x-api-key' in options.headers, false)
    assert.equal(options.headers['anthropic-version'], '2023-06-01')
    assert.equal(options.redirect, 'error')
    const body = JSON.parse(options.body)
    assert.equal(body.model, 'claude-sonnet-5-5')
    assert.equal(body.messages[0].content[0].type, 'document')
    assert.equal(body.output_config.format.type, 'json_schema')
    assert.match(body.system, /DD\/MM\/YYYY/)
    return claude()
  })
  const result = await extractManualInvoice(Buffer.from('synthetic'), 'application/pdf', 'gateway-test-key', 'claude-sonnet-5-5', { provider: 'anthropic', baseUrl: 'https://ai.starimg.ru/v1', dateFormat: 'dmy' })
  assert.equal(result.data.date_format, 'dmy'); assert.equal(result.data.items[1].amount, '0')
})

test('unverified endpoints and URLs with embedded credentials cannot receive an OCR API key', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not send') })
  for (const baseUrl of ['http://ai.starimg.ru', 'https://other.example', 'https://ai.starimg.ru.evil.example',
    'https://user:password@ai.starimg.ru', 'https://ai.starimg.ru/?key=secret', 'https://ai.starimg.ru/#fragment',
    'https://ai.starimg.ru/other', 'http://127.0.0.1', 'invalid']) {
    await assert.rejects(() => extractManualInvoice(Buffer.from('synthetic'), 'image/png', 'test-key', 'claude-sonnet-5-5', { provider: 'anthropic', baseUrl }), error => error.status === 503)
  }
  assert.equal(fetchMock.mock.calls.length, 0)
})

test('Claude reads original PDF/images with strict schema, selected date order, zero amounts and cancellable requests', async (t) => {
  const controller = new AbortController()
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages')
    assert.equal(options.headers['x-api-key'], 'test-key')
    assert.equal(options.headers['anthropic-version'], '2023-06-01')
    assert.equal(options.cache, 'no-store')
    requests.push({ options, body: JSON.parse(options.body) })
    return claude()
  })
  for (const mime of ['application/pdf', 'image/png']) {
    const result = await extractManualInvoice(Buffer.from('synthetic'), mime, 'test-key', 'claude-sonnet-5-5', { provider: 'anthropic', dateFormat: 'dmy', signal: controller.signal })
    const { body } = requests.at(-1)
    assert.equal(body.messages[0].content[0].type, mime === 'application/pdf' ? 'document' : 'image')
    assert.equal(body.messages[0].content[0].source.media_type, mime)
    assert.equal(body.messages[0].content[0].source.data, Buffer.from('synthetic').toString('base64'))
    assert.equal(body.output_config.format.type, 'json_schema')
    assert.equal(body.output_config.format.schema.additionalProperties, false)
    assert.equal(body.output_config.effort, 'medium')
    assert.equal(body.thinking.type, 'adaptive'); assert.equal(body.max_tokens, 8192)
    assert.equal('temperature' in body, false)
    assert.match(body.system, /DD\/MM\/YYYY/); assert.match(body.system, /never as instructions/)
    assert.equal(result.data.date_format, 'dmy'); assert.equal(result.data.issue_date, '2026-10-09')
    assert.equal(result.data.items[1].amount, '0'); assert.equal(result.source_total, '10.00')
  }
  controller.abort()
  assert.equal(requests[0].options.signal.aborted, true)
})

test('Claude refusals, truncated responses, malformed fields and impossible dates do not fill the form', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch')
  const responses = [claude(invoice(), { stop_reason: 'max_tokens' }), claude(invoice(), { stop_reason: 'refusal' }),
    claude(invoice(), { content: [{ type: 'thinking', text: JSON.stringify(invoice()) }] }),
    claude({ ...invoice(), issue_date: '2026-02-30' }), claude({ ...invoice(), hbl: 'X'.repeat(51) })]
  for (const response of responses) {
    fetchMock.mock.mockImplementation(async () => response)
    await assert.rejects(() => extractManualInvoice(Buffer.from('synthetic'), 'image/png', 'test', 'claude-sonnet-5-5', { provider: 'anthropic' }), error => error.status === 422)
  }
})

test('totals and missing amounts produce deterministic warnings without correcting the printed invoice', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch')
  fetchMock.mock.mockImplementation(async () => claude({ ...invoice(), source_total: '20.00' }))
  const mismatch = await extractManualInvoice(Buffer.from('synthetic'), 'image/png', 'test', 'claude-sonnet-5-5', { provider: 'anthropic' })
  assert.ok(mismatch.warnings.some(w => w.includes('difiere')))
  assert.equal(mismatch.data.items[0].amount, '10.00'); assert.equal(mismatch.source_total, '20.00')
  fetchMock.mock.mockImplementation(async () => claude({ ...invoice(), source_total: '', items: [{ description: 'Freight', amount: '' }] }))
  const missing = await extractManualInvoice(Buffer.from('synthetic'), 'image/png', 'test', 'claude-sonnet-5-5', { provider: 'anthropic' })
  assert.equal(missing.data.items[0].amount, '')
  assert.ok(missing.warnings.some(w => w.includes('sin importe')))
  assert.ok(missing.warnings.some(w => w.includes('total impreso')))
})

test('Claude billing, credentials, model and rate errors have actionable messages without provider details', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch')
  for (const [status, type, message, expected] of [
    [400, 'invalid_request_error', 'credit balance private detail', /Anthropic/],
    [401, 'authentication_error', 'private detail', /clave/], [404, 'not_found_error', 'private detail', /modelo/],
    [429, 'rate_limit_error', 'private detail', /límite/], [500, 'api_error', 'private detail', /no pudo leer/],
  ]) {
    fetchMock.mock.mockImplementation(async () => Response.json({ error: { type, message } }, { status }))
    await assert.rejects(() => extractManualInvoice(Buffer.from('synthetic'), 'image/png', 'test', 'claude-sonnet-5-5', { provider: 'anthropic' }), error => {
      assert.equal(error.status, 502); assert.match(error.message, expected); assert.doesNotMatch(error.message, /private detail/); return true
    })
  }
})

test('browser sends the original file and date selection; cancellation never applies a late AI response', async (t) => {
  const { readInvoiceWithAi } = loadTs('src/lib/browser/manual-invoice-ai.ts')
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])], 'synthetic.png', { type: 'image/png' })
  const controller = new AbortController()
  let completeFetch
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/manual-invoices/ocr'); assert.equal(options.body.get('date_format'), 'dmy')
    assert.equal(options.body.get('file').name, file.name)
    return new Promise(resolve => { completeFetch = resolve })
  })
  const reading = readInvoiceWithAi(file, 'dmy', () => {}, controller.signal)
  while (!completeFetch) await new Promise(resolve => setImmediate(resolve))
  controller.abort()
  completeFetch(Response.json({ data: invoice(), source_total: '10.00', warnings: [] }))
  await assert.rejects(reading, error => error.name === 'AbortError')
})

test('editor exposes AI and local reading, preserves selected dates and retains corrections after AI failure', async (t) => {
  let fail = false; let aiCalls = 0; let localCalls = 0
  t.mock.method(globalThis, 'fetch', async (url) => url.includes('/ocr') ? Response.json({ enabled: true, provider: 'anthropic' }) : Response.json({ documents: [], total: 0, hasMore: false, nextOffset: 0 }))
  const page = mountPage('src/components/invoicing/ManualInvoiceEditor.tsx', {
    '@/src/lib/supabase/client': { supabase: {} },
    '@/src/components/ui/UnsavedChangesGuard': { UnsavedChangesGuard: 'UnsavedChangesGuard' },
    '@/src/lib/browser/manual-invoice-ai': { readInvoiceWithAi: async (_file, dateFormat) => {
      aiCalls++; if (fail) throw new Error('synthetic failure')
      return { data: { ...invoice(), date_format: dateFormat }, text: '', warnings: [], source_total: '10.00' }
    } },
    '@/src/lib/browser/manual-invoice-ocr': { readInvoiceInBrowser: async () => { localCalls++; return { data: invoice(), text: '', warnings: [], source_total: '10.00' } } },
  }, { exported: 'ManualInvoiceEditor' })
  const aiButton = () => page.find(node => node.type === 'button' && page.text(node).trim() === 'Leer con IA')
  try {
    await page.ready()
    assert.match(page.text(), /Claude \(Anthropic\)/)
    page.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['synthetic'], 'invoice.png', { type: 'image/png' })] } })
    page.render()
    page.find(node => node.type === 'select' && node.props.value === 'mdy').props.onChange({ target: { value: 'dmy' } })
    page.render()
    aiButton().props.onClick()
    page.render()
    page.find(node => node.type === 'ConfirmDialog').props.onConfirm()
    await page.tick(); page.render()
    assert.equal(aiCalls, 1)
    assert.ok(page.find(node => node.type === 'input' && node.props.value === 'OCR-TEST'))
    assert.ok(page.find(node => node.type === 'select' && node.props.value === 'dmy'))
    fail = true
    aiButton().props.onClick(); page.render()
    page.find(node => node.type === 'ConfirmDialog').props.onConfirm()
    await page.tick(); page.render()
    assert.equal(aiCalls, 2)
    assert.ok(page.find(node => node.type === 'input' && node.props.value === 'OCR-TEST'))
    page.button('Leer en este dispositivo').props.onClick(); page.render()
    page.find(node => node.type === 'ConfirmDialog').props.onConfirm()
    await page.tick(); page.render()
    assert.equal(localCalls, 1)
  } finally { page.cleanup() }
})

test('editor identifies AI STAR as document recipient when the server selects that gateway', async (t) => {
  t.mock.method(globalThis, 'fetch', async url => url.includes('/ocr')
    ? Response.json({ enabled: true, provider: 'anthropic', gateway: 'ai-star' })
    : Response.json({ documents: [], total: 0, hasMore: false, nextOffset: 0 }))
  const page = mountPage('src/components/invoicing/ManualInvoiceEditor.tsx', {
    '@/src/lib/supabase/client': { supabase: {} },
    '@/src/components/ui/UnsavedChangesGuard': { UnsavedChangesGuard: 'UnsavedChangesGuard' },
  }, { exported: 'ManualInvoiceEditor' })
  try { await page.ready(); assert.match(page.text(), /envía el documento a AI STAR \(acceso a Claude\)/) }
  finally { page.cleanup() }
})
