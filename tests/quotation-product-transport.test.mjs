import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { getProductTransportRule, resolveProductQuoteType } = loadTs('src/lib/quotation-products.ts')

test('cada producto con pricing por agentes fija su transporte', () => {
  assert.deepEqual(getProductTransportRule('other_origin_fcl'), { transport: 'Marítima', modalities: ['FCL'] })
  assert.deepEqual(getProductTransportRule('other_origin_lcl'), { transport: 'Marítima', modalities: ['LCL'] })
  assert.deepEqual(getProductTransportRule('other_origin_air'), { transport: 'Aéreo', modalities: ['Consolidado'] })
  assert.deepEqual(getProductTransportRule('courier'), { transport: 'Aéreo', modalities: ['Courier'] })
  assert.deepEqual(getProductTransportRule('usa_ltl_ftl'), { transport: 'Terrestre', modalities: ['LTL', 'FTL'] })
})

test('Miami, Aduanas y productos personalizados no usan la regla', () => {
  for (const product of ['miami_lcl', 'miami_air', 'customs_only', 'producto_tenant', '', null, undefined]) {
    assert.equal(getProductTransportRule(product), null)
  }
})

test('la modalidad única se impone y la múltiple conserva solo valores válidos', () => {
  const fcl = getProductTransportRule('other_origin_fcl')
  assert.equal(resolveProductQuoteType(fcl, 'LCL'), 'FCL')
  assert.equal(resolveProductQuoteType(fcl, ''), 'FCL')

  const road = getProductTransportRule('usa_ltl_ftl')
  assert.equal(resolveProductQuoteType(road, 'FTL'), 'FTL')
  assert.equal(resolveProductQuoteType(road, 'LTL'), 'LTL')
  assert.equal(resolveProductQuoteType(road, 'FCL'), '')
  assert.equal(resolveProductQuoteType(road, ''), '')
})
