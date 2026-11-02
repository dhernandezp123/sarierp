import { formatDate, formatMoney } from '@/src/lib/format'

export type ClientRateSnapshot = {
  rate_label?: string | null
  category?: string | null
  unit?: string | null
  currency?: string | null
  amount?: number | string | null
  is_active?: boolean | null
  valid_from?: string | null
  valid_to?: string | null
  notes?: string | null
}

export type ClientRateEvent = {
  event_id: string
  changed_at: string
  actor_id: string | null
  actor_name: string
  rate_code: string
  destination: string | null
  before_values: ClientRateSnapshot | null
  after_values: ClientRateSnapshot | null
  total_count: number | string
}

const fields = [
  ['amount', 'Importe'], ['currency', 'Moneda'], ['unit', 'Unidad'],
  ['rate_label', 'Concepto'], ['category', 'Categoría'], ['is_active', 'Estado'],
  ['valid_from', 'Vigente desde'], ['valid_to', 'Vigente hasta'], ['notes', 'Notas'],
] as const

export function getClientRateChanges(before: ClientRateSnapshot | null, after: ClientRateSnapshot | null) {
  const display = (snapshot: ClientRateSnapshot | null, field: typeof fields[number][0]) => {
    const value = snapshot?.[field]
    if (value === null || value === undefined || value === '') return '—'
    if (field === 'amount') return formatMoney(Number(value), snapshot?.currency || 'USD')
    if (field === 'is_active') return value ? 'Activa' : 'Inactiva'
    if (field === 'valid_from' || field === 'valid_to') return formatDate(String(value))
    return String(value)
  }
  return fields.flatMap(([field, label]) => {
    if ((before?.[field] ?? null) === (after?.[field] ?? null)) return []
    return [{ field, label, before: display(before, field), after: display(after, field) }]
  })
}
