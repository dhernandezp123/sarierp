import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  getAvailableClientRate,
  MIAMI_LCL_OPTIONAL_CHARGES,
} = loadTs('src/lib/miami-pricing-items.ts')

const rate = (overrides = {}) => ({
  cliente_id: 'client-1',
  rate_code: 'hazmat_imo_charge_line',
  rate_label: 'Hazmat IMO Charge Line',
  category: 'Otros Cargos',
  unit: 'flat',
  currency: 'USD',
  amount: 125,
  is_active: true,
  valid_from: null,
  valid_to: null,
  notes: null,
  ...overrides,
})

test('Miami LCL mantiene centralizadas las tres opciones condicionales', () => {
  assert.deepEqual(
    MIAMI_LCL_OPTIONAL_CHARGES.map(({ rateCode, optionKey }) => [rateCode, optionKey]),
    [
      ['hazmat_imo_charge_line', 'isHazmat'],
      ['declaracion_imo', 'isImo'],
      ['certificado_imo', 'includeImoCertificate'],
    ]
  )
})

test('un cargo opcional solo se habilita con tarifa activa y monto positivo', () => {
  assert.equal(getAvailableClientRate([rate()], 'hazmat_imo_charge_line')?.amount, 125)
  assert.equal(getAvailableClientRate([rate({ amount: 0 })], 'hazmat_imo_charge_line'), null)
  assert.equal(getAvailableClientRate([rate({ is_active: false })], 'hazmat_imo_charge_line'), null)
  assert.equal(getAvailableClientRate([rate()], 'declaracion_imo'), null)
})
