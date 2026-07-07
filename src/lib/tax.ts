export const DEFAULT_TAX_RATE_PERCENT = 15

export const normalizeTaxRatePercent = (value?: number | string | null) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue >= 0
    ? numericValue
    : DEFAULT_TAX_RATE_PERCENT
}

export const getTaxMultiplier = (taxRatePercent?: number | string | null) =>
  normalizeTaxRatePercent(taxRatePercent) / 100

export const calculateTaxAmount = (
  taxable: boolean,
  amount: number,
  taxRatePercent?: number | string | null
) => (taxable ? amount * getTaxMultiplier(taxRatePercent) : 0)
