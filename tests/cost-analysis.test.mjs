import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { analyzeCosts, freightBreakdown, containerCount } = loadTs('src/lib/cost-analysis.ts')
const line = (patch = {}) => ({ id: 'p', description: 'Flete', item_type: 'Flete', supplier: 'Agente', currency: 'USD', quantity: 10, cost_amount: 8601, sale_amount: 9365, ...patch })
const invoice = (patch = {}) => ({ id: 'i', pricing_item_id: 'p', description: 'Otro texto', currency: 'USD', quantity: 1, unit_cost: 8601, total_cost: 8601, tax_amount: 0, ...patch })

test('no invoices is missing cost, never zero cost or a saving, even with stale validated status', () => {
  const [r] = analyzeCosts([line()], [], true)
  assert.equal(r.base, null); assert.equal(r.registeredProfit, null); assert.equal(r.variance, null)
  assert.equal(r.closed, false); assert.equal(r.unregisteredBudget, 86010)
})
test('partial invoices stay provisional and links survive changed descriptions', () => {
  const [r] = analyzeCosts([line()], [invoice(), invoice({ id: 'i2', total_cost: 1000 })])
  assert.equal(r.base, 9601); assert.equal(r.rows[0].linked.length, 2)
  assert.equal(r.rows[0].variance, null); assert.equal(r.variance, null); assert.equal(r.closed, false)
})
test('same descriptions do not merge suppliers; unlinked and currency-mismatched invoices need review', () => {
  const result = analyzeCosts([line(), line({ id: 'p2', supplier: 'B' })], [invoice({ pricing_item_id: null }), invoice({ id: 'h', currency: 'HNL' })], true)
  assert.equal(result[0].rows.length, 2); assert.equal(result[0].unmatched.length, 1)
  assert.equal(result[0].missing.length, 2); assert.equal(result[0].closed, false)
  assert.equal(result[1].quoted, null); assert.equal(result[1].registeredProfit, null)
})
test('net variation and provider taxes stay separate, zero registered cost is valid', () => {
  const [r] = analyzeCosts([line({ quantity: 1, cost_amount: 100, sale_amount: 150 })], [invoice({ total_cost: 100, tax_amount: 15 })], true)
  assert.equal(r.variance, 0); assert.equal(r.payable, 115); assert.equal(r.registeredProfit, 50)
  assert.equal(r.closed, true)
  assert.equal(analyzeCosts([line()], [invoice({ total_cost: 0 })])[0].base, 0)
})
test('invalid data and deleted lines cannot generate healthy results; quantity zero stays zero', () => {
  assert.equal(analyzeCosts([line({ cost_amount: 'bad' })], [invoice()], true)[0].closed, false)
  assert.equal(analyzeCosts([line()], [invoice({ deleted_at: 'today' })])[0].base, null)
  assert.equal(analyzeCosts([line({ quantity: 0 })], [])[0].quoted, 0)
  assert.equal(analyzeCosts([line({ currency: null })], [])[0].invalid, true)
  assert.equal(analyzeCosts([line({ quantity: 1e300, cost_amount: 1e300 })], [])[0].quoted, null)
  assert.equal(containerCount([{ quantity: null }]), null)
})
test('SARI example totals, loss, average and reconciled MBL breakdown', () => {
  const lines = [line(), line({ id: 'd', item_type: 'Destino', cost_amount: 380, sale_amount: 350 }), line({ id: 'l', item_type: 'Destino', cost_amount: 500, sale_amount: 550 }), line({ id: 'r', item_type: 'Destino', quantity: 2, cost_amount: 195, sale_amount: 200 })]
  const [r] = analyzeCosts(lines, [])
  assert.equal(r.quoted, 95200); assert.equal(r.sale, 103050); assert.equal(r.quotedProfit, 7850)
  assert.equal(r.rows[1].profit, -300); assert.equal(r.quoted / 10, 9520)
  const containers = [{ container_type_name: '40HC', quantity: 10 }]
  const agent = { moneda: 'USD', ocean_freight: 85360, profit_per_container: 50, mbl_fee: 50, mbl_quantity: 3 }
  assert.equal(freightBreakdown(lines, containers, agent).total, 86010)
  assert.equal(freightBreakdown(lines, containers, { ...agent, mbl_quantity: 1 }), null)
})
