import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { isValidCaiDate, validateCaiRange } = loadTs('src/lib/cai-validation.ts')
const { guaranteeTotalsByCurrency } = loadTs('src/lib/guarantees.ts')

test('CAI rejects extended years, impossible dates and timestamps', () => {
  for (const value of ['20260-09-14', '0000-01-01', '2026-02-29', '2026-04-31', '2026-13-01', '2026-09-14T00:00:00Z', '']) assert.equal(isValidCaiDate(value), false, value)
  for (const value of ['2028-02-29', '2026-09-14', '0001-01-01', '9999-12-31']) assert.equal(isValidCaiDate(value), true, value)
})
test('CAI range compares exact numbers, matching prefixes and widths', () => {
  const form = { cai: 'CAI', fecha_limite_emision: '2028-02-29', rango_desde: '000-001-01-00000001', rango_hasta: '000-001-01-00000100' }
  assert.equal(validateCaiRange(form), null)
  for (const change of [{ cai: '  ' }, { rango_hasta: '000-002-01-00000100' }, { rango_hasta: '000-001-01-100' }, { rango_desde: '000-001-01-00000101' }, { fecha_limite_emision: '20280-02-28' }]) assert.ok(validateCaiRange({ ...form, ...change }))
  assert.ok(validateCaiRange({ ...form, rango_desde: '000-001-01-9007199254740993', rango_hasta: '000-001-01-9007199254740992' }))
})
test('guarantee totals keep currencies separate and reject corrupt amounts', () => {
  assert.deepEqual(guaranteeTotalsByCurrency([{ monto: '100.25', moneda: 'USD' }, { monto: 20.5, moneda: 'usd' }, { monto: 500, moneda: 'HNL' }]), [['HNL', 500], ['USD', 120.75]])
  assert.deepEqual(guaranteeTotalsByCurrency([]), [])
  assert.deepEqual(guaranteeTotalsByCurrency([{ monto: 0, moneda: '' }]), [['Sin moneda', 0]])
  assert.throws(() => guaranteeTotalsByCurrency([{ monto: 'NaN', moneda: 'USD' }]))
})
