export type FixedAsset = {
  id: string; code: string; name: string; category: string; acquisition_date: string; available_date: string
  start_month: string; cost: number; residual: number; useful_months: number; asset_account_id: string
  depreciation_account_id: string; accumulated_account_id: string; acquisition_line_id: string | null
  tax_useful_months: number | null; tax_rule_reference: string; location: string; notes: string
  status: 'Preparación' | 'Activo' | 'Depreciado' | 'Baja'; accumulated_depreciation: number
  net_book_value: number; depreciated_months: number; next_month: string; last_month: string | null
}
export type AssetDepreciation = { id: string; asset_id: string; period_month: string; amount: number; entry_id: string | null; status: string }
/** Rounded cumulative amounts keep the last installment exact, including residual value. */
export function depreciationSchedule(cost: number, residual: number, months: number) {
  if (![cost,residual].every(Number.isFinite) || cost <= 0 || residual < 0 || residual > cost || !Number.isInteger(months) || months < 1 || months > 1200) return []
  const base = Math.round(cost * 100) - Math.round(residual * 100)
  return Array.from({length: months}, (_, i) => (Math.round(base * (i + 1) / months) - Math.round(base * i / months)) / 100)
}
