export const INSURANCE_COST_RATE_PERCENT = 0.28
export const INSURANCE_SURCHARGE_PERCENT = 10

type InsuranceDeclarationInput = {
  invoiceValue: number
  freightValue: number
  nationalTaxes?: number
  includeAdditionalExpenses?: boolean
  includeOperationalExpenses?: boolean
  saleRatePercent: number
}

const finiteAmount = (value: number) =>
  Number.isFinite(value) ? Math.max(value, 0) : 0

export function calculateInsuranceDeclaration({
  invoiceValue,
  freightValue,
  nationalTaxes = 0,
  includeAdditionalExpenses = true,
  includeOperationalExpenses = false,
  saleRatePercent,
}: InsuranceDeclarationInput) {
  const invoice = finiteAmount(invoiceValue)
  const freight = finiteAmount(freightValue)
  const taxes = finiteAmount(nationalTaxes)
  const subtotal = invoice + freight + taxes
  const additionalExpenses = includeAdditionalExpenses
    ? subtotal * (INSURANCE_SURCHARGE_PERCENT / 100)
    : 0
  const operationalExpenses = includeOperationalExpenses
    ? subtotal * (INSURANCE_SURCHARGE_PERCENT / 100)
    : 0
  const insuredValue = subtotal + additionalExpenses + operationalExpenses
  const insuranceCost =
    insuredValue * (INSURANCE_COST_RATE_PERCENT / 100)
  const insuranceSale =
    insuredValue * (finiteAmount(saleRatePercent) / 100)

  return {
    invoice,
    freight,
    taxes,
    subtotal,
    additionalExpenses,
    operationalExpenses,
    insuredValue,
    insuranceCost,
    insuranceSale,
  }
}
