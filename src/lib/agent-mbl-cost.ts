type MblQuote = { mbl_fee?: number | string | null; mbl_quantity?: number | string | null }
type MblOverride = { mbl?: string; mblSource?: string }

export function isValidMblQuantity(value: unknown): boolean {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 2147483647
}

export function getMblQuantity(quote: MblQuote): number {
  return isValidMblQuantity(quote.mbl_quantity) ? Number(quote.mbl_quantity) : 1
}

export function getAgentMblTotal(quote: MblQuote): number {
  return Number(quote.mbl_fee || 0) * getMblQuantity(quote)
}

export function getMblSource(quote: MblQuote): string {
  return `${getMblQuantity(quote)}:${Number(quote.mbl_fee || 0)}`
}

/** Overrides are totals. Discard stale browser values after a persisted fee/count change. */
export function getFclMblTotal(quote: MblQuote, override?: MblOverride): number {
  const validSource = override?.mblSource === getMblSource(quote)
    || (override?.mblSource === undefined && getMblQuantity(quote) === 1)
  const amount = override?.mbl === undefined ? NaN : Number(override.mbl)
  return validSource && Number.isFinite(amount) && amount >= 0
    ? amount
    : getAgentMblTotal(quote)
}
