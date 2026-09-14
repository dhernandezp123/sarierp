import type { SupabaseClient } from '@supabase/supabase-js'
import { isInCreationPeriod } from './commercial-dashboard'
import { parseDateValue } from './format'
import { readAllReportRows } from './report-query'
import { reportCsvCell, reportDateRange } from './report-view'

type Amount = number | string | null
export type FinancialQuote = {
  id: string; quotation_number: string | null; created_at: string | null
  quote_type: string | null; tipo_transporte: string | null; total_sale: Amount
  financial_validation_status: string | null
  clientes: { id: string; nombre: string | null } | { id: string; nombre: string | null }[] | null
}
export type FinancialPricing = {
  id: string; quotation_id: string; currency: string | null
  sale_amount: Amount; cost_amount: Amount; quantity: Amount; deleted_at?: string | null
}
export type FinancialCost = {
  id: string; quotation_id: string; currency: string | null
  total_cost: Amount; tax_amount: Amount; deleted_at?: string | null
}
export type FinancialData = {
  quotes: FinancialQuote[]; pricing: FinancialPricing[]; costs: FinancialCost[]; costsReadable: boolean
}

/** Bounded IN clauses, complete pages, and one publication after all queries succeed. */
export async function loadFinancialData(client: Pick<SupabaseClient, 'from' | 'rpc'>, isCurrent = () => true): Promise<FinancialData> {
  const quotes = await readAllReportRows<FinancialQuote>((from, to) => client.from('quotations')
    .select('id, quotation_number, created_at, quote_type, tipo_transporte, total_sale, financial_validation_status, clientes(id, nombre)')
    .eq('status', 'Ganada').is('deleted_at', null).order('id').range(from, to), { label: 'cotizaciones ganadas', isCurrent })
  let costsReadable = true
  if (quotes.length) {
    // RLS may return an empty array without error. Verify the existing read capability
    // before describing an empty cost response as a lack of registered costs.
    const permission = await client.rpc('can_select_provider_invoice_item', { p_quotation_id: quotes[0].id })
    if (!isCurrent()) throw new Error('Carga reemplazada')
    if (permission.error) throw new Error('No se pudo verificar el acceso a los costos. Reintenta la consulta.')
    costsReadable = permission.data === true
  }
  const pricing: FinancialPricing[] = [], costs: FinancialCost[] = []
  for (let start = 0; start < quotes.length; start += 100) {
    if (!isCurrent()) throw new Error('Carga reemplazada')
    const ids = quotes.slice(start, start + 100).map(q => q.id)
    const [lines, invoices] = await Promise.all([
      readAllReportRows<FinancialPricing>((from, to) => client.from('pricing_items')
        .select('id, quotation_id, currency, cost_amount, sale_amount, quantity')
        .in('quotation_id', ids).is('deleted_at', null).order('id').range(from, to), { label: 'costos y ventas cotizados', isCurrent }),
      costsReadable ? readAllReportRows<FinancialCost>((from, to) => client.from('provider_invoice_items')
        .select('id, quotation_id, currency, total_cost, tax_amount')
        .in('quotation_id', ids).is('deleted_at', null).order('id').range(from, to), { label: 'costos registrados', isCurrent }) : Promise.resolve([]),
    ])
    pricing.push(...lines); costs.push(...invoices)
  }
  if (!isCurrent()) throw new Error('Carga reemplazada')
  return { quotes, pricing, costs, costsReadable }
}

export type FinancialRow = {
  id: string; quoteId: string; number: string; clientId: string; client: string; createdAt: string | null
  service: string; currency: string; sale: number | null; quotedCost: number | null
  quotedProfit: number | null; registeredCost: number | null; registeredProfit: number | null
  variance: number | null; validated: boolean; issue: string; costsReadable: boolean
}
export type FinancialFocus = 'all' | 'loss' | 'missing' | 'pending' | 'review'
export type FinancialView = { from: string; to: string; currency: string; search: string; focus: FinancialFocus; sort: string; page: number; pageSize: number }
const currencies = (value: string | null) => /^[A-Z]{3}$/.test(value?.trim().toUpperCase() || '') ? value!.trim().toUpperCase() : 'REVIEW'
function amount(value: Amount, fallback?: number) {
  if (value === null || value === '') return fallback ?? null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
function sum(values: (number | null)[]) {
  return values.some(v => v === null) ? null : values.reduce<number>((total, v) => total + v!, 0)
}
const subtract = (a: number | null, b: number | null) => a === null || b === null ? null : a - b

export function buildFinancialRows(data: FinancialData): FinancialRow[] {
  const pricing = new Map<string, FinancialPricing[]>(), costs = new Map<string, FinancialCost[]>()
  for (const item of data.pricing) if (!item.deleted_at) { const list = pricing.get(item.quotation_id) || []; list.push(item); pricing.set(item.quotation_id, list) }
  for (const item of data.costs) if (!item.deleted_at) { const list = costs.get(item.quotation_id) || []; list.push(item); costs.set(item.quotation_id, list) }
  return data.quotes.flatMap(q => {
    const lines = pricing.get(q.id) || [], invoices = costs.get(q.id) || []
    const quoteCurrencies = new Set(lines.map(i => currencies(i.currency)))
    const allCurrencies = new Set([...quoteCurrencies, ...invoices.map(i => currencies(i.currency))])
    if (!allCurrencies.size) allCurrencies.add('REVIEW')
    const client = Array.isArray(q.clientes) ? q.clientes[0] : q.clientes
    return [...allCurrencies].map(currency => {
      const pi = lines.filter(i => currencies(i.currency) === currency)
      const ii = invoices.filter(i => currencies(i.currency) === currency)
      const lineTotal = (key: 'sale_amount' | 'cost_amount') => sum(pi.map(i => {
        const value = amount(i[key]), quantity = amount(i.quantity, 1)
        return value === null || quantity === null ? null : value * quantity
      }))
      const known = currency !== 'REVIEW'
      const storedSale = amount(q.total_sale)
      // Preserve the existing header sale only when its currency is unambiguous.
      const sale = !known || !pi.length ? null : quoteCurrencies.size === 1 && storedSale !== null && storedSale > 0 ? storedSale : lineTotal('sale_amount')
      const quotedCost = known && pi.length ? lineTotal('cost_amount') : null
      const registeredCost = known && ii.length && data.costsReadable ? sum(ii.map(i => {
        const cost = amount(i.total_cost), tax = amount(i.tax_amount, 0)
        return cost === null || tax === null ? null : cost + tax
      })) : null
      const issue = !known ? 'Moneda sin identificar' : !pi.length ? 'Sin venta en esta moneda' : sale === null || quotedCost === null || (ii.length > 0 && data.costsReadable && registeredCost === null) ? 'Importes por revisar' : ''
      return {
        id: `${q.id}:${currency}`, quoteId: q.id, number: q.quotation_number || q.id,
        clientId: client?.id || q.id, client: client?.nombre || 'Sin cliente', createdAt: q.created_at,
        service: q.quote_type || q.tipo_transporte || 'Sin servicio', currency, sale, quotedCost,
        quotedProfit: subtract(sale, quotedCost), registeredCost, registeredProfit: subtract(sale, registeredCost),
        variance: subtract(registeredCost, quotedCost), validated: q.financial_validation_status === 'Validado',
        issue, costsReadable: data.costsReadable,
      }
    })
  })
}

export function summarizeFinancialRows(rows: FinancialRow[]) {
  // Never return a sum across currencies, including unresolved currency rows.
  const known = rows.filter(r => r.currency !== 'REVIEW')
  if (new Set(known.map(r => r.currency)).size > 1) throw new Error('Selecciona una sola moneda para comparar importes')
  const quoted = known.filter(r => r.sale !== null && r.quotedProfit !== null)
  const comparable = known.filter(r => r.registeredProfit !== null && !r.issue)
  const saleRows = known.filter(r => r.sale !== null)
  const sale = saleRows.length ? saleRows.reduce((s, r) => s + r.sale!, 0) : null
  const profit = quoted.length ? quoted.reduce((s, r) => s + r.quotedProfit!, 0) : null
  const base = quoted.reduce((s, r) => s + r.sale!, 0)
  return { sale, profit, margin: profit !== null && base > 0 ? profit / base * 100 : null,
    registeredProfit: comparable.length ? comparable.reduce((s, r) => s + r.registeredProfit!, 0) : null,
    comparable: comparable.length, quoted: quoted.length, total: rows.length,
    loss: comparable.filter(r => r.registeredProfit! < 0).length,
    missing: known.filter(r => r.costsReadable && r.registeredCost === null && !r.issue).length,
    pending: rows.filter(r => !r.validated).length, review: rows.filter(r => r.issue).length }
}

export function readFinancialView(params: Pick<URLSearchParams, 'get'>, now = new Date()): FinancialView {
  const dates = reportDateRange('year', now)
  for (const key of ['from', 'to'] as const) {
    const value = params.get(key)
    if (value === '' || (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDateValue(value))) dates[key] = value
  }
  const focus = params.get('focus') as FinancialFocus
  return { ...dates, currency: /^[A-Z]{3}$/.test(params.get('currency') || '') || params.get('currency') === 'REVIEW' ? params.get('currency')! : '',
    search: (params.get('search') || '').slice(0, 500), focus: ['loss', 'missing', 'pending', 'review'].includes(focus) ? focus : 'all',
    sort: ['sale', 'profit', 'client', 'loss'].includes(params.get('sort') || '') ? params.get('sort')! : 'date',
    page: Math.max(1, Math.min(100000, Number.parseInt(params.get('page') || '1', 10) || 1)),
    pageSize: [25, 50, 100].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 25 }
}
export function filterFinancialRows(rows: FinancialRow[], view: FinancialView) {
  const search = view.search.trim().toLocaleLowerCase('es')
  return rows.filter(r => r.currency === view.currency && isInCreationPeriod(r.createdAt, view.from, view.to)
    && (!search || `${r.number} ${r.client} ${r.service}`.toLocaleLowerCase('es').includes(search)))
}
export function financialDetailRows(rows: FinancialRow[], view: FinancialView) {
  const focused = rows.filter(r => view.focus === 'all' || (view.focus === 'loss' && r.registeredProfit !== null && r.registeredProfit < 0 && !r.issue)
    || (view.focus === 'missing' && r.costsReadable && r.registeredCost === null && !r.issue)
    || (view.focus === 'pending' && !r.validated) || (view.focus === 'review' && Boolean(r.issue)))
  return focused.sort((a, b) => {
    if (view.sort === 'client') return a.client.localeCompare(b.client, 'es') || a.id.localeCompare(b.id)
    const key = view.sort === 'sale' ? 'sale' : view.sort === 'profit' ? 'quotedProfit' : view.sort === 'loss' ? 'registeredProfit' : 'createdAt'
    const av = a[key], bv = b[key]
    if (av === null || bv === null) return av === bv ? a.id.localeCompare(b.id) : av === null ? 1 : -1
    const difference = typeof av === 'number' && typeof bv === 'number' ? (view.sort === 'loss' ? av - bv : bv - av) : String(bv).localeCompare(String(av))
    return difference || a.id.localeCompare(b.id)
  })
}
export function financialCsv(rows: FinancialRow[], date: (value: string | null) => string) {
  const records = rows.map(r => [r.number, r.client, date(r.createdAt), r.service, r.currency === 'REVIEW' ? 'Sin identificar' : r.currency,
    r.sale, r.quotedCost, r.quotedProfit, r.registeredCost, r.registeredProfit, r.variance,
    r.validated ? 'Validado' : 'Pendiente', r.issue || (!r.costsReadable ? 'Sin acceso a costos' : r.registeredCost === null ? 'Sin costos registrados' : 'Costos registrados; utilidad provisional')])
  return '\uFEFF' + [['Cotización', 'Cliente', 'Fecha de creación', 'Servicio', 'Moneda', 'Venta cotizada', 'Costo cotizado', 'Utilidad cotizada', 'Costo registrado', 'Utilidad con costos registrados', 'Variación de costo', 'Validación', 'Cobertura'],
    ...records].map(row => row.map(value => reportCsvCell(typeof value === 'number' ? value.toFixed(2) : value ?? '')).join(',')).join('\n')
}
