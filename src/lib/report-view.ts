import { formatDate, parseDateValue, toDateInputValue } from './format'

export type ReportId = 'commercial' | 'pricing' | 'operations' | 'billing' | 'customer_payments' | 'receivable' | 'payable' | 'overdue' | 'supplier_payments'
export type DatePreset = 'month' | 'quarter' | 'year' | 'all' | 'custom'
export type ReportView = {
  report: ReportId; level: 'operations' | 'bookings' | 'readiness'
  from: string; to: string; client: string; seller: string; service: string; status: string
  currency: string; method: string; fiscal: string; pos: string; search: string
  page: number; pageSize: number; sort: string; direction: 'asc' | 'desc'
}

export function reportDateRange(preset: Exclude<DatePreset, 'custom'>, now = new Date()) {
  const to = toDateInputValue(now)
  if (preset === 'all') return { from: '', to: '' }
  const month = preset === 'quarter' ? Math.floor(now.getMonth() / 3) * 3 : preset === 'year' ? 0 : now.getMonth()
  return { from: toDateInputValue(new Date(now.getFullYear(), month, 1)), to }
}

export function defaultReportView(report: ReportId, now = new Date()): ReportView {
  return {
    report, level: 'operations', ...reportDateRange(report === 'overdue' ? 'all' : 'month', now),
    client: 'Todos', seller: 'Todos', service: 'Todos', status: 'Todos', currency: 'Todos',
    method: 'Todos', fiscal: 'Todos', pos: 'Todos', search: '', page: 1, pageSize: 25, sort: '', direction: 'asc',
  }
}

export function readReportView(params: Pick<URLSearchParams, 'get'>, allowed: ReportId[], now = new Date()): ReportView {
  const report = allowed.find((id) => id === params.get('report')) || allowed[0] || 'commercial'
  const view = defaultReportView(report, now)
  for (const key of ['client', 'seller', 'service', 'status', 'currency', 'method', 'fiscal', 'pos', 'search', 'sort'] as const) {
    view[key] = params.get(key)?.slice(0, 500) ?? view[key]
  }
  if (!['commercial', 'pricing', 'operations', 'billing'].includes(report)) view.seller = 'Todos'
  if (!['commercial', 'pricing', 'operations'].includes(report)) view.service = 'Todos'
  if (['pricing', 'operations'].includes(report)) view.currency = 'Todos'
  if (!['customer_payments', 'supplier_payments'].includes(report)) view.method = 'Todos'
  if (report !== 'customer_payments') { view.fiscal = 'Todos'; view.pos = 'Todos' }
  if (report === 'supplier_payments') view.status = 'Todos'
  for (const key of ['from', 'to'] as const) {
    const value = params.get(key)
    if (value !== null) view[key] = value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && parseDateValue(value)) ? value : view[key]
  }
  const level = params.get('level')
  if (level === 'bookings' || level === 'readiness') view.level = level
  view.page = Math.max(1, Math.min(100000, Number.parseInt(params.get('page') || '1', 10) || 1))
  view.pageSize = [25, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 25
  view.direction = params.get('direction') === 'desc' ? 'desc' : 'asc'
  return view
}

export function reportViewQuery(view: ReportView) {
  return new URLSearchParams(Object.entries(view).map(([key, value]) => [key, String(value)])).toString()
}

export function reportDateBasis(report: ReportId, level: ReportView['level']) {
  if (report === 'pricing') return 'Entradas y salidas de Pricing; pendientes al cierre del período'
  if (report === 'operations' && level === 'readiness') return 'Fecha del próximo cutoff'
  if (report === 'commercial' || report === 'operations') return 'Fecha de creación'
  if (report === 'billing') return 'Fecha de emisión'
  if (report === 'customer_payments' || report === 'supplier_payments') return 'Fecha de pago'
  if (report === 'overdue') return 'Fecha de vencimiento'
  return 'Fecha de vencimiento (emisión si no tiene vencimiento)'
}

export function reportDateMatches(value: string | undefined, from: string, to: string) {
  if (!from && !to) return true
  if (!value) return false
  return (!from || value >= from) && (!to || value <= to)
}

export function reportSortValue(value: string | number | undefined): string | number {
  if (typeof value === 'number') return value
  const text = String(value ?? '')
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (dateMatch) return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
  const numeric = text.replace(/^[A-Z]{3}\s+/, '').replaceAll(',', '').replace(/\s*(%|días|h)$/, '')
  return /^-?\d+(\.\d+)?$/.test(numeric) ? Number(numeric) : text
}

export function reportRangeLabel(from: string, to: string) {
  if (!from && !to) return 'Todas las fechas'
  return `${from ? formatDate(from) : 'Sin fecha inicial'} – ${to ? formatDate(to) : 'Sin fecha final'}`
}

export function reportCsvCell(value: unknown) {
  const text = String(value ?? '')
  const formula = /^\s*[=+@]/.test(text) || (/^\s*-/.test(text) && !/^-\d+(\.\d+)?$/.test(text)) || /^[\t\r\n]/.test(text)
  return '"' + (formula ? "'" + text : text).replaceAll('"', '""') + '"'
}
