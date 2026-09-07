import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { normalizeTaxRatePercent, calculateTaxAmount, DEFAULT_TAX_RATE_PERCENT } = loadTs('src/lib/tax.ts')
const { resolveBookingDocumentSummary } = loadTs('src/lib/booking-document-summary.ts')

test('Una tasa ausente usa el default existente; una exención explícita de cero se conserva', () => {
  for (const missing of [null, undefined, '', '   ', 'invalid', NaN, -1]) {
    assert.equal(normalizeTaxRatePercent(missing), DEFAULT_TAX_RATE_PERCENT)
  }
  assert.equal(normalizeTaxRatePercent(0), 0)
  assert.equal(normalizeTaxRatePercent('0'), 0)
  assert.equal(normalizeTaxRatePercent('12.5'), 12.5)
  assert.equal(calculateTaxAmount(true, 100, null), 15)
  assert.equal(calculateTaxAmount(true, 100, 0), 0)
  assert.equal(calculateTaxAmount(false, 100, null), 0)
})

test('Un BL estructurado sin número no debe mostrar el número antiguo del cache', () => {
  const result = resolveBookingDocumentSummary({ master_bl: 'OLD-MBL', house_bl: 'OLD-HBL' }, [
    { id: 'm', bl_type: 'MBL', bl_number: null, status: 'Borrador' },
    { id: 'h', bl_type: 'HBL', bl_number: ' ', status: 'Borrador' },
  ])
  assert.equal(result.master, null)
  assert.deepEqual(result.houses, [])
})

test('Los documentos legacy siguen disponibles cuando no existe un registro estructurado de ese tipo', () => {
  const cache = { master_bl: 'LEGACY-MBL', house_bl: 'LEGACY-HBL' }
  assert.equal(resolveBookingDocumentSummary(cache, []).master.number, 'LEGACY-MBL')
  const result = resolveBookingDocumentSummary(cache, [{ id: 'm', bl_type: 'MBL', bl_number: 'NEW-MBL' }])
  assert.equal(result.master.number, 'NEW-MBL')
  assert.equal(result.master.source, 'bills_of_lading')
  assert.equal(result.houses[0].number, 'LEGACY-HBL')
})
