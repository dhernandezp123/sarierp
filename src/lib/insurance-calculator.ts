export const DEFAULT_INSURANCE_COST_RATE_PERCENT = 0.28
export const INSURANCE_SURCHARGE_PERCENT = 10
export const INSURANCE_MINIMUM_CHARGE_USD = 75

type InsuranceDeclarationInput = {
  invoiceValue: number
  freightValue: number
  nationalTaxes?: number
  includeAdditionalExpenses?: boolean
  includeOperationalExpenses?: boolean
  costRatePercent?: number
  saleRatePercent: number
}

const finiteAmount = (value: number) =>
  Number.isFinite(value) ? Math.max(value, 0) : 0

export const applyInsuranceMinimumCharge = (calculatedPremium: number) => {
  const premium = finiteAmount(calculatedPremium)

  if (premium === 0) return 0

  return Math.max(premium, INSURANCE_MINIMUM_CHARGE_USD)
}

export function calculateInsuranceDeclaration({
  invoiceValue,
  freightValue,
  nationalTaxes = 0,
  includeAdditionalExpenses = true,
  includeOperationalExpenses = false,
  costRatePercent = DEFAULT_INSURANCE_COST_RATE_PERCENT,
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
  const normalizedCostRate = finiteAmount(costRatePercent)
  const calculatedInsuranceCost =
    insuredValue * (normalizedCostRate / 100)
  const calculatedInsuranceSale =
    insuredValue * (finiteAmount(saleRatePercent) / 100)
  const insuranceCost = applyInsuranceMinimumCharge(calculatedInsuranceCost)
  const insuranceSale = applyInsuranceMinimumCharge(calculatedInsuranceSale)

  return {
    invoice,
    freight,
    taxes,
    subtotal,
    additionalExpenses,
    operationalExpenses,
    insuredValue,
    costRatePercent: normalizedCostRate,
    calculatedInsuranceCost,
    calculatedInsuranceSale,
    insuranceCostMinimumApplied:
      calculatedInsuranceCost > 0 &&
      calculatedInsuranceCost <= INSURANCE_MINIMUM_CHARGE_USD,
    insuranceSaleMinimumApplied:
      calculatedInsuranceSale > 0 &&
      calculatedInsuranceSale <= INSURANCE_MINIMUM_CHARGE_USD,
    insuranceCost,
    insuranceSale,
  }
}
