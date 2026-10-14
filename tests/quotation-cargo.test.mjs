import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const cargo = loadTs('src/lib/quotation-cargo.ts')
const line = { id: 'line', quantity: '3', packageType: 'Caja', length: '100', width: '100', height: '100', dimensionUnit: 'cm', weight: '10', weightUnit: 'kg' }

test('cargo quantity multiplies measured volume and unit weight, manual CBM remains a line total', () => {
  assert.equal(cargo.calculateLineCbm(line), 3)
  assert.equal(cargo.calculateLineFt3(line), 3 * 35.3147)
  assert.equal(cargo.getLineTotalWeightKg(line), 30)
  assert.equal(cargo.getLineTotalWeightLbs(line), 10 * 2.20462 * 3)
  assert.equal(cargo.calculateLineCbm({ ...line, volumeMode: 'manual', manualCbm: '7.25' }), 7.25)
  assert.equal(cargo.calculateLineCbm({ ...line, quantity: '0' }), 0)
  assert.equal(cargo.hasLineVolume({ ...line, height: '' }), false)
  assert.equal(cargo.hasLineVolume({ ...line, height: '', volumeMode: 'manual', manualCbm: '7.25' }), true)
})

test('cargo dimension units and legacy pounds preserve existing conversion factors', () => {
  for (const [dimensionUnit, length, expected] of [['m','1',1], ['cm','100',1], ['mm','1000',1], ['in','12',1728 / 61023.7441]]) {
    assert.equal(cargo.calculateLineCbm({ ...line, quantity:'1', dimensionUnit, length, width:length, height:length }), expected)
  }
  assert.equal(cargo.getLineUnitWeightLbs({ ...line, weightUnit: undefined }), 10)
  assert.equal(cargo.getLineUnitWeightKg({ ...line, weightUnit: undefined }), 10 / 2.20462)
})
