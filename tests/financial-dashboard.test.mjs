import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { buildFinancialRows, summarizeFinancialRows, loadFinancialData, financialCsv, readFinancialView, filterFinancialRows, financialDetailRows } = loadTs('src/lib/financial-dashboard.ts')
const quote = (id = 'q', patch = {}) => ({ id, quotation_number: 'Q-' + id, created_at: '2026-09-14T12:00:00Z', quote_type: 'FCL', tipo_transporte: null, total_sale: 100, financial_validation_status: 'Pendiente', clientes: { id: 'c-' + id, nombre: 'Cliente completo ' + id }, ...patch })
const pricing = (id = 'q', patch = {}) => ({ id: 'p-' + id, quotation_id: id, currency: 'USD', sale_amount: 100, cost_amount: 70, quantity: 1, ...patch })
const cost = (id = 'q', patch = {}) => ({ id: 'i-' + id, quotation_id: id, currency: 'USD', total_cost: 80, tax_amount: 0, ...patch })
const rows = (patch = {}) => buildFinancialRows({ quotes: [quote()], pricing: [pricing()], costs: [cost()], costsReadable: true, ...patch })

test('financial totals keep currencies separate and never subtract HNL costs from USD sales', () => {
  const mixed = rows({ costs: [cost('q', { currency: 'HNL', total_cost: 2000 })] })
  const usd = mixed.find(r => r.currency === 'USD'), hnl = mixed.find(r => r.currency === 'HNL')
  assert.equal(usd.sale, 100); assert.equal(usd.registeredProfit, null)
  assert.equal(hnl.sale, null); assert.equal(hnl.registeredCost, 2000)
  assert.equal(hnl.registeredProfit, null); assert.equal(hnl.issue, 'Sin venta en esta moneda')
  assert.throws(() => summarizeFinancialRows(mixed), /una sola moneda/)
})
test('multicurrency quotes use each currency lines without duplicating the header sale', () => {
  const result = rows({ quotes: [quote('q', { total_sale: 2100 })], pricing: [pricing(), pricing('q', { id: 'p-hnl', currency: 'HNL', sale_amount: 2000, cost_amount: 1500 })] })
  assert.equal(result.find(r => r.currency === 'USD').sale, 100)
  assert.equal(result.find(r => r.currency === 'HNL').sale, 2000)
})
test('registered profit compares only covered sales; zero cost is registered and pending remains pending', () => {
  const result = rows({ quotes: [quote(), quote('second')], pricing: [pricing(), pricing('second')], costs: [cost('q', { total_cost: 0 })] })
  const total = summarizeFinancialRows(result)
  assert.equal(total.sale, 200); assert.equal(total.registeredProfit, 100)
  assert.equal(total.comparable, 1); assert.equal(total.missing, 1); assert.equal(total.pending, 2)
  assert.equal(result[0].validated, false)
})
test('missing currency, invalid values and missing pricing never create invented profits', () => {
  assert.equal(rows({ pricing: [pricing('q', { currency: null })], costs: [] })[0].sale, null)
  assert.equal(rows({ pricing: [], costs: [] })[0].currency, 'REVIEW')
  const invalid = rows({ pricing: [pricing('q', { cost_amount: 'invalid' })] })[0]
  assert.equal(invalid.quotedProfit, null); assert.equal(invalid.issue, 'Importes por revisar')
  assert.equal(summarizeFinancialRows([invalid]).registeredProfit, null)
  assert.equal(rows({ quotes: [quote('q', { total_sale: 0 })], pricing: [pricing('q', { quantity: 0 })] })[0].quotedCost, 0)
})
test('deleted lines are excluded and weighted margins use comparable bases', () => {
  const result = rows({ quotes: [quote(), quote('b', { total_sale: 900 })], pricing: [pricing(), pricing('b', { cost_amount: 810 }), pricing('q', { deleted_at: '2026-09-01', cost_amount: 9999 })] })
  assert.equal(summarizeFinancialRows(result).margin, 12)
  assert.equal(result[0].quotedCost, 70)
  assert.equal(rows({ costs: [cost('q', { deleted_at: '2026-09-01' })] })[0].registeredProfit, null)
})
test('CSV exports full names, all supplied rows, cents and no formulas; null differs from zero', () => {
  const result = rows({ quotes: Array.from({ length: 30 }, (_, i) => quote(String(i), { total_sale: 100.55, clientes: { id: String(i), nombre: '=Cliente internacional ' + i } })), pricing: Array.from({ length: 30 }, (_, i) => pricing(String(i))), costs: [] })
  const csv = financialCsv(result, () => '14/09/2026')
  assert.equal(csv.charCodeAt(0), 0xFEFF); assert.equal(csv.split('\n').length, 31)
  assert.ok(csv.includes("'=Cliente internacional 29")); assert.ok(csv.includes('"100.55"'))
  assert.ok(csv.includes('"30.55","","",""'))
})
test('URL state validates dates and pagination, and detail sorting treats amounts numerically', () => {
  const view = readFinancialView(new URLSearchParams('from=2026-02-30&to=&page=-2&pageSize=50&currency=HNL&focus=loss'), new Date(2026, 8, 14))
  assert.equal(view.from, '2026-01-01'); assert.equal(view.page, 1); assert.equal(view.pageSize, 50); assert.equal(view.focus, 'loss')
  const usd = { ...view, currency: 'USD', search: '', focus: 'all', sort: 'sale' }
  const result = rows({ quotes: [quote(), quote('b', { total_sale: 900 })], pricing: [pricing(), pricing('b')] })
  assert.equal(financialDetailRows(filterFinancialRows(result, usd), usd)[0].quoteId, 'b')
  assert.equal(filterFinancialRows(result, { ...usd, from: '2026-10-01', to: '2026-01-01' }).length, 0)
  assert.equal(filterFinancialRows(result, { ...usd, search: 'Q-b' }).length, 1)
})

function mockClient({ count = 201, cap = 37, failure = '', allowed = true } = {}) {
  const dataset = { quotations: Array.from({ length: count }, (_, i) => quote(String(i))), pricing_items: Array.from({ length: count }, (_, i) => pricing(String(i))), provider_invoice_items: Array.from({ length: count }, (_, i) => cost(String(i))) }
  const calls = []
  return { calls, rpc: async () => ({ data: allowed, error: null }), from(table) {
    let start = 0, ids = null
    const query = new Proxy({}, { get(_, property) {
      if (property === 'then') return resolve => {
        calls.push({ table, start, ids })
        const source = dataset[table].filter(r => !ids || ids.includes(r.quotation_id))
        resolve({ data: failure === table && start > 0 ? null : source.slice(start, start + cap), error: failure === table && start > 0 ? { message: 'Network failure' } : null })
      }
      return (...args) => { if (property === 'range') start = args[0]; if (property === 'in') { ids = args[1]; assert.ok(ids.length <= 100) }; return query }
    } })
    return query
  } }
}
test('financial loader reads full pages and bounded quote groups despite a smaller server cap', async () => {
  const client = mockClient()
  const data = await loadFinancialData(client)
  assert.equal(data.quotes.length, 201); assert.equal(data.pricing.length, 201); assert.equal(data.costs.length, 201)
  assert.equal(summarizeFinancialRows(buildFinancialRows(data)).sale, 20100)
})
test('financial loader rejects any failed source and obsolete request instead of partial data', async () => {
  for (const failure of ['quotations', 'pricing_items', 'provider_invoice_items']) await assert.rejects(loadFinancialData(mockClient({ failure })), /No se pudo cargar/)
  await assert.rejects(loadFinancialData(mockClient(), () => false), /reemplazada/)
})
test('denied RLS read capability never describes inaccessible costs as missing or zero', async () => {
  const client = mockClient({ allowed: false })
  const data = await loadFinancialData(client)
  assert.equal(data.costsReadable, false)
  assert.equal(client.calls.some(c => c.table === 'provider_invoice_items'), false)
  const totals = summarizeFinancialRows(buildFinancialRows(data))
  assert.equal(totals.registeredProfit, null); assert.equal(totals.missing, 0)
})
