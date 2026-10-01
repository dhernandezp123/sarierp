export function guaranteeTotalsByCurrency(rows: { monto: number | string; moneda: string }[]) {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const currency = row.moneda?.trim().toUpperCase() || 'Sin moneda'
    const amount = Number(row.monto)
    if (!Number.isFinite(amount)) throw new Error('Hay garantías con montos inválidos.')
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b))
}
