import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { isValidMblQuantity, getAgentMblTotal, getMblQuantity, getFclMblTotal, getMblSource } = loadTs('src/lib/agent-mbl-cost.ts')

test('10 × 40HC: 3 MBL suman 150; costo 8,601 por contenedor y 86,010 total', () => {
  const quote = { mbl_fee: 50, mbl_quantity: 3 }
  const mbl = getAgentMblTotal(quote)
  assert.equal(mbl, 150)
  assert.equal(8536 + 50 + mbl / 10, 8601)
  assert.equal(85360 + 50 * 10 + mbl, 86010)
  assert.equal(9365 - (8536 + 50 + mbl / 10), 764)
})

test('Tarifas anteriores conservan 1 MBL; monto cero y cantidades string son válidos', () => {
  assert.equal(getMblQuantity({}), 1)
  assert.equal(getAgentMblTotal({ mbl_fee: 50 }), 50)
  assert.equal(getAgentMblTotal({ mbl_fee: '50', mbl_quantity: '3' }), 150)
  assert.equal(getAgentMblTotal({ mbl_fee: 0, mbl_quantity: 3 }), 0)
  for (const value of ['', null, undefined, 0, -1, 1.5, 'bad', Infinity, 2147483648]) {
    assert.equal(isValidMblQuantity(value), false)
  }
})

test('Un override viejo no reduce 3 MBL a 1 al recargar desde otro navegador', () => {
  const quote = { mbl_fee: 50, mbl_quantity: 3 }
  assert.equal(getFclMblTotal(quote, { mbl: '50' }), 150)
  assert.equal(getFclMblTotal(quote, { mbl: '50', mblSource: '1:50' }), 150)
  assert.equal(getFclMblTotal(quote, { mbl: '160', mblSource: getMblSource(quote) }), 160)
  assert.equal(getFclMblTotal(quote, { mbl: '0', mblSource: getMblSource(quote) }), 0)
  assert.equal(getFclMblTotal({ mbl_fee: 60, mbl_quantity: 3 }, { mbl: '160', mblSource: getMblSource(quote) }), 180)
  assert.equal(getFclMblTotal({ mbl_fee: 50 }, { mbl: '65' }), 65)
})
