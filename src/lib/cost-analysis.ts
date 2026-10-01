type Amount = number | string | null
export type CostPricingLine = {
  id: string; description: string; item_type: string; supplier: string | null
  currency: string | null; quantity: Amount; cost_amount: Amount; sale_amount: Amount
  deleted_at?: string | null
}
export type ProviderCostLine = {
  id: string; pricing_item_id: string | null; description: string; supplier: string | null
  currency: string | null; quantity: Amount; unit_cost: Amount; total_cost: Amount
  tax_amount: Amount; invoice_number: string | null; invoice_date?: string | null
  deleted_at?: string | null
}
export type CostContainer = { container_type_name: string; quantity: Amount }
export type FreightSource = {
  carrier: string | null; ocean_freight: Amount; profit_per_container: Amount
  mbl_fee: Amount; mbl_quantity: Amount; moneda: string | null
}

export function costNumber(value: Amount | undefined): number | null {
  if (value == null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}
export const costCurrency = (value: string | null) => /^[A-Z]{3}$/.test(value?.trim().toUpperCase() || '') ? value!.trim().toUpperCase() : 'Sin moneda'
const sum = (values: (number | null)[]) => {
  if (values.some(v => v === null)) return null
  const total = values.reduce<number>((s, v) => s + v!, 0)
  return Number.isFinite(total) ? total : null
}
const subtract = (a: number | null, b: number | null) => a === null || b === null ? null : a - b
export function costLineTotal(price: Amount, quantity: Amount) {
  const p = costNumber(price), q = costNumber(quantity)
  return p === null || q === null || !Number.isFinite(p * q) ? null : p * q
}
export function containerCount(containers: CostContainer[]) {
  const count = sum(containers.map(c => costNumber(c.quantity)))
  return count !== null && count > 0 ? count : null
}

/** Explicit IDs only: descriptions are not keys, even for legacy invoices. */
export function analyzeCosts(pricing: CostPricingLine[], invoices: ProviderCostLine[], validated = false) {
  const lines = pricing.filter(p => !p.deleted_at), costs = invoices.filter(i => !i.deleted_at)
  const currencies = [...new Set([...lines, ...costs].map(i => costCurrency(i.currency)))]
  return currencies.map(currency => {
    const items = lines.filter(p => costCurrency(p.currency) === currency)
    const registered = costs.filter(i => costCurrency(i.currency) === currency)
    const rows = items.map(item => {
      const linked = registered.filter(i => i.pricing_item_id === item.id)
      const quoted = costLineTotal(item.cost_amount, item.quantity)
      const sale = costLineTotal(item.sale_amount, item.quantity)
      const base = linked.length ? sum(linked.map(i => costNumber(i.total_cost))) : null
      const tax = linked.length ? sum(linked.map(i => costNumber(i.tax_amount))) : null
      const withTax = base === null || tax === null ? null : base + tax
      return { item, quoted, sale, profit: subtract(sale, quoted), linked, base, tax, withTax,
        // A partial invoice is never an automatic saving.
        variance: validated && linked.length ? subtract(base, quoted) : null }
    })
    const unmatched = registered.filter(i => !items.some(p => p.id === i.pricing_item_id))
    const missing = rows.filter(r => !r.linked.length)
    const quoted = items.length ? sum(rows.map(r => r.quoted)) : null
    const sale = items.length ? sum(rows.map(r => r.sale)) : null
    const base = registered.length ? sum(registered.map(i => costNumber(i.total_cost))) : null
    const tax = registered.length ? sum(registered.map(i => costNumber(i.tax_amount))) : null
    const invalid = currency === 'Sin moneda' || quoted === null || sale === null ||
      (registered.length > 0 && (base === null || tax === null))
    const reconciled = !invalid && rows.length > 0 && missing.length === 0 && unmatched.length === 0
    const closed = validated && reconciled
    return { currency, rows, unmatched, missing, quoted, sale, base, tax,
      payable: base === null || tax === null ? null : base + tax,
      quotedProfit: subtract(sale, quoted), registeredProfit: invalid ? null : subtract(sale, base),
      variance: closed ? subtract(base, quoted) : null, reconciled, closed, invalid,
      // This is the budget for wholly unregistered lines, not a forecast for partial invoices.
      unregisteredBudget: sum(missing.map(r => r.quoted)) }
  })
}

/** Explanatory breakdown only when today's source reconciles with the stored freight. */
export function freightBreakdown(pricing: CostPricingLine[], containers: CostContainer[], agent: FreightSource | null) {
  const count = containerCount(containers)
  if (!agent || count === null) return null
  const freight = pricing.filter(p => !p.deleted_at && ['Flete', 'freight'].includes(p.item_type))
  const currency = costCurrency(agent.moneda)
  if (!freight.length || currency === 'Sin moneda' || freight.some(p => costCurrency(p.currency) !== currency)) return null
  const ocean = costNumber(agent.ocean_freight), ps = costNumber(agent.profit_per_container)
  const fee = costNumber(agent.mbl_fee), mbl = costNumber(agent.mbl_quantity)
  if (ocean === null || ps === null || fee === null || mbl === null || mbl < 1 || !Number.isInteger(mbl)) return null
  const total = ocean + ps * count + fee * mbl
  const stored = sum(freight.map(p => costLineTotal(p.cost_amount, p.quantity)))
  if (stored === null || Math.abs(total - stored) > 0.01) return null
  return { currency, count, ocean, ps, fee, mbl, total }
}
