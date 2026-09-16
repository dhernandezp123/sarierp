export const DEFAULT_TAX_RATE_PERCENT = 15

export const normalizeTaxRatePercent = (value?: number | string | null) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return DEFAULT_TAX_RATE_PERCENT
  }
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

type PersistedTaxInput = {
  taxable: boolean
  subtotal: number
  taxAmount?: number | string | null
  taxRatePercent?: number | string | null
  fallbackTaxRatePercent?: number | string | null
}

/**
 * Conserva el impuesto persistido de una linea historica. Solo recalcula cuando
 * la linea no tiene tax_amount, usando su propia tasa antes del default actual.
 */
export const resolvePersistedTaxAmount = ({
  taxable,
  subtotal,
  taxAmount,
  taxRatePercent,
  fallbackTaxRatePercent,
}: PersistedTaxInput) => {
  if (!taxable) return 0

  if (taxAmount !== null && taxAmount !== undefined && taxAmount !== '') {
    const persistedAmount = Number(taxAmount)
    if (Number.isFinite(persistedAmount)) return persistedAmount
  }

  const effectiveRate =
    taxRatePercent === null ||
    taxRatePercent === undefined ||
    (typeof taxRatePercent === 'string' && taxRatePercent.trim() === '')
      ? fallbackTaxRatePercent
      : taxRatePercent

  return calculateTaxAmount(true, subtotal, effectiveRate)
}
