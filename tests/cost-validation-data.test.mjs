import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { loadCostValidationData } = loadTs('src/lib/cost-validation-data.ts')

function mockClient({ permission = true, failTable = '', pageFailure = false } = {}) {
  const calls = []
  const tables = {
    quotations: { id: 'q', quote_type: 'FCL' },
    pricing_items: [{ id: 'p1' }, { id: 'p2' }], provider_invoice_items: [],
    quotation_containers: [{ id: 'c', quantity: 10 }], agent_quotes: null,
    quotation_options: [], shipments: [], tax_rates: [], invoices: null,
  }
  return { calls,
    rpc: async () => ({ data: permission, error: null }),
    from(table) {
      let offset = null
      const filters = []
      const query = {
        select() { return query }, order() { return query }, limit() { return query },
        single() { return query }, maybeSingle() { return query },
        eq(...args) { filters.push(['eq', ...args]); return query },
        neq(...args) { filters.push(['neq', ...args]); return query },
        is(...args) { filters.push(['is', ...args]); return query },
        range(from) { offset = from; return query },
        then(resolve, reject) {
          calls.push({ table, filters, offset })
          const error = table === failTable || (pageFailure && table === 'pricing_items' && offset === 1) ? { message: 'failed' } : null
          const data = offset === null ? tables[table] : tables[table].slice(offset, offset + 1)
          return Promise.resolve({ data, error }).then(resolve, reject)
        },
      }
      return query
    },
  }
}
test('loader verifies access before interpreting no invoices; denied is not zero cost', async () => {
  const client = mockClient({ permission: false })
  await assert.rejects(loadCostValidationData(client, 'q'), /no tiene acceso/)
  assert.equal(client.calls.some(c => c.table === 'provider_invoice_items'), false)
})
test('loader reads all capped pages and excludes deleted pricing and invoice lines', async () => {
  const client = mockClient()
  const result = await loadCostValidationData(client, 'q')
  assert.equal(result.pricing.length, 2)
  for (const table of ['pricing_items', 'provider_invoice_items']) {
    assert.ok(client.calls.filter(c => c.table === table).every(c => c.filters.some(f => f[0] === 'is' && f[1] === 'deleted_at' && f[2] === null)))
  }
})
test('later-page and context failures reject the whole result; stale loads cannot publish', async () => {
  await assert.rejects(loadCostValidationData(mockClient({ pageFailure: true }), 'q'), /pricing_items/)
  await assert.rejects(loadCostValidationData(mockClient({ failTable: 'quotation_options' }), 'q'), /contexto/)
  await assert.rejects(loadCostValidationData(mockClient(), 'q', () => false), /reemplazada/)
})
