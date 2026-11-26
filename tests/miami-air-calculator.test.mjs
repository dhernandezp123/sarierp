import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { calculateMiamiAir } = loadTs('src/lib/miami-air-calculator.ts')
const { calculateLineCbm } = loadTs('src/lib/quotation-cargo.ts')
const rules = [
  { code: 'miami_air_min_small', fixed_amount: 270, minimum_amount: 22 },
  { code: 'miami_air_min_large', fixed_amount: 375, minimum_amount: 40 },
]

test('Miami air bills volumetric weight for 40 x 40 x 48 inches, not 52.2 kg actual', () => {
  const cbm = calculateLineCbm({ quantity: '1', length: '40', width: '40', height: '48', dimensionUnit: 'in' })
  const result = calculateMiamiAir(52.2, cbm, 2.7, rules)
  assert.equal(result.chargeableWeightKg.toFixed(2), '209.75')
  assert.equal(result.freight.toFixed(2), '566.34')
  assert.equal(result.minimumApplied, 0)
})

test('Miami air keeps actual weight when heavier and preserves minimum boundaries', () => {
  for (const [kg, expected] of [[21.99, 270], [22, 375], [40, 375], [40.01, 108.027], [100, 270]]) {
    const result = calculateMiamiAir(kg, 0.001, 2.7, rules)
    assert.ok(Math.abs(result.freight - expected) < 0.00001)
    assert.equal(result.chargeableWeightKg, kg)
  }
  assert.equal(calculateMiamiAir(5, 0.18, 2.7, rules).minimumApplied, 375)
  assert.equal(calculateMiamiAir(0, 0, 2.7, rules).freight, 0)
  assert.equal(calculateMiamiAir(20, 0, 20, rules).freight, 400)
})

test('Miami air without volume retains a base minimum even above 40 kg', () => {
  assert.equal(calculateMiamiAir(52.2, 0, 2.7, rules).freight, 270)
  assert.equal(calculateMiamiAir(52.2, 0, 2.7, rules).minimumApplied, 270)
  assert.equal(calculateMiamiAir(150, 0, 2.7, rules).freight, 405)
  assert.equal(calculateMiamiAir(30, 0, 2.7, rules).freight, 375)
  assert.equal(calculateMiamiAir(52.2, 1, 2.7, rules).freight.toFixed(2), '450.00')
  assert.equal(calculateMiamiAir(0, 0, 2.7, rules).freight, 0)
})
