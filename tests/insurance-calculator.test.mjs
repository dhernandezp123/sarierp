import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  calculateInsuranceDeclaration,
  INSURANCE_MINIMUM_CHARGE_USD,
} = loadTs('src/lib/insurance-calculator.ts')

test('insurance applies the USD 75 minimum to positive cost and sale premiums', () => {
  const calculation = calculateInsuranceDeclaration({
    invoiceValue: 10_000,
    freightValue: 0,
    includeAdditionalExpenses: false,
    costRatePercent: 0.28,
    saleRatePercent: 0.5,
  })

  assert.equal(INSURANCE_MINIMUM_CHARGE_USD, 75)
  assert.equal(calculation.insuranceCost, 75)
  assert.equal(calculation.insuranceSale, 75)
  assert.equal(calculation.insuranceCostMinimumApplied, true)
  assert.equal(calculation.insuranceSaleMinimumApplied, true)
})

test('insurance keeps the USD 75 charge when the calculated premium is exactly the minimum', () => {
  const calculation = calculateInsuranceDeclaration({
    invoiceValue: 7_500,
    freightValue: 0,
    includeAdditionalExpenses: false,
    costRatePercent: 1,
    saleRatePercent: 1,
  })

  assert.equal(calculation.insuranceCost, 75)
  assert.equal(calculation.insuranceSale, 75)
  assert.equal(calculation.insuranceCostMinimumApplied, true)
  assert.equal(calculation.insuranceSaleMinimumApplied, true)
})

test('insurance preserves premiums above the minimum and leaves an empty calculation at zero', () => {
  const aboveMinimum = calculateInsuranceDeclaration({
    invoiceValue: 30_000,
    freightValue: 0,
    includeAdditionalExpenses: false,
    costRatePercent: 0.28,
    saleRatePercent: 0.5,
  })
  const empty = calculateInsuranceDeclaration({
    invoiceValue: 0,
    freightValue: 0,
    includeAdditionalExpenses: false,
    costRatePercent: 0.28,
    saleRatePercent: 0.5,
  })

  assert.ok(Math.abs(aboveMinimum.insuranceCost - 84) < Number.EPSILON * 100)
  assert.equal(aboveMinimum.insuranceSale, 150)
  assert.equal(aboveMinimum.insuranceCostMinimumApplied, false)
  assert.equal(aboveMinimum.insuranceSaleMinimumApplied, false)
  assert.equal(empty.insuranceCost, 0)
  assert.equal(empty.insuranceSale, 0)
})
