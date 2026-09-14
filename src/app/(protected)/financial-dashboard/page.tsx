'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowUpRight, Download, Filter, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { formatDate, formatDateTime, parseDateValue, toDateInputValue } from '@/src/lib/format'
import { canAccessPath } from '@/src/lib/permissions'
import { isInCreationPeriod } from '@/src/lib/commercial-dashboard'
import { reportDateRange, reportRangeLabel } from '@/src/lib/report-view'
import { buildFinancialRows, filterFinancialRows, financialCsv, financialDetailRows, loadFinancialData, readFinancialView, summarizeFinancialRows, type FinancialData, type FinancialFocus, type FinancialView } from '@/src/lib/financial-dashboard'
import { cardClass, fieldClassSm } from '@/src/lib/ui-classes'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
const linkClass = 'inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300'
const focusLabels: Record<FinancialFocus, string> = { all: 'Todos', loss: 'Con pérdida detectada', missing: 'Sin costos registrados', pending: 'Pendientes de validar', review: 'Datos por revisar' }
function money(value: number | null, currency: string) {
  return value === null ? 'Sin base comparable' : `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function monthLabel(value: string) {
  return new Intl.DateTimeFormat('es-HN', { month: 'short', year: '2-digit' }).format(new Date(`${value}-01T12:00:00`))
}

export default function FinancialDashboardPage() {
  const { user, profile, loading } = useUser()
  if (loading) return <PageSkeleton cards={4} rows={4} />
  if (!user || !profile || !['Admin', 'Finanzas', 'Contabilidad'].includes(profile.rol) || !profile.is_active || profile.status !== 'Aprobado') {
    return <div className={cardClass}><h1 className="text-xl font-bold">Acceso restringido</h1><p className="mt-2 text-sm text-slate-500">No tienes permiso para ver este módulo.</p></div>
  }
  return <FinancialDashboard key={`${user.id}:${profile.rol}`} role={profile.rol} />
}

function FinancialDashboard({ role }: { role: string }) {
  const params = useSearchParams(), pathname = usePathname()
  const initialView = readFinancialView(params)
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const version = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++version.current
    const isCurrent = () => request === version.current
    setLoading(true); setError(''); setData(null)
    try {
      const result = await loadFinancialData(supabase, isCurrent)
      if (!isCurrent()) return
      setData(result); setUpdatedAt(new Date())
    } catch (e) {
      if (isCurrent()) setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard. Reintenta la consulta.')
    } finally { if (isCurrent()) setLoading(false) }
  }, [])
  useEffect(() => {
    const requests = version
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => { window.clearTimeout(timer); requests.current++ }
  }, [refresh])
  const allRows = useMemo(() => data ? buildFinancialRows(data) : [], [data])
  const currencyOptions = [...new Set(allRows.map(r => r.currency))].sort((a, b) => a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))
  const currency = initialView.currency || currencyOptions[0] || 'USD'
  const view = { ...initialView, currency }
  const updateView = (patch: Partial<FinancialView>) => {
    // Pagination can update size and page in one event. Read the latest URL.
    const next = { ...readFinancialView(new URLSearchParams(window.location.search)), currency, ...patch }
    const query = new URLSearchParams(Object.entries(next).map(([key, value]) => [key, String(value)]))
    window.history.replaceState(null, '', `${pathname}?${query}${window.location.hash}`)
  }
  const invalidRange = Boolean(view.from && view.to && view.from > view.to)
  const rows = invalidRange ? [] : filterFinancialRows(allRows, view)
  const totals = summarizeFinancialRows(rows)
  const detail = financialDetailRows(rows, view)
  const page = Math.min(view.page, Math.max(1, Math.ceil(detail.length / view.pageSize)))
  const pageRows = detail.slice((page - 1) * view.pageSize, page * view.pageSize)
  const ready = !loading && !error && data !== null && !invalidRange
  const unknown = new Set(allRows.filter(r => r.currency === 'REVIEW' && isInCreationPeriod(r.createdAt, view.from, view.to)).map(r => r.quoteId)).size
  const selectedPreset = (['month', 'quarter', 'year', 'all'] as const).find(p => {
    const dates = reportDateRange(p)
    return view.from === dates.from && view.to === dates.to
  })
  const monthly = new Map<string, { month: string; sale: number; profit: number; base: number; quoted: number }>()
  const clients = new Map<string, { id: string; name: string; sale: number }>()
  const services = new Map<string, { name: string; sale: number; count: number }>()
  for (const row of rows) {
    if (row.sale === null) continue
    const date = parseDateValue(row.createdAt)
    if (date) {
      const month = toDateInputValue(date).slice(0, 7)
      const entry = monthly.get(month) || { month, sale: 0, profit: 0, base: 0, quoted: 0 }
      entry.sale += row.sale
      if (row.quotedProfit !== null) { entry.profit += row.quotedProfit; entry.base += row.sale; entry.quoted++ }
      monthly.set(month, entry)
    }
    const client = clients.get(row.clientId) || { id: row.clientId, name: row.client, sale: 0 }
    client.sale += row.sale; clients.set(row.clientId, client)
    const service = services.get(row.service) || { name: row.service, sale: 0, count: 0 }
    service.sale += row.sale; service.count++; services.set(row.service, service)
  }
  const trend = [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ month: m.month, 'Venta cotizada': m.sale, 'Utilidad cotizada': m.quoted ? m.profit : null, Margen: m.base > 0 && m.quoted ? m.profit / m.base * 100 : null }))
  const topClients = [...clients.values()].sort((a, b) => b.sale - a.sale).slice(0, 8)
  const serviceRows = [...services.values()].sort((a, b) => b.sale - a.sale)
  const goToDetail = (focus: FinancialFocus) => {
    updateView({ focus, page: 1, sort: focus === 'loss' ? 'loss' : view.sort })
    document.getElementById('financial-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    document.getElementById('financial-detail-title')?.focus({ preventScroll: true })
  }
  const exportCsv = () => {
    if (!ready || !detail.length) return
    try {
      const url = URL.createObjectURL(new Blob([financialCsv(detail, formatDate)], { type: 'text/csv;charset=utf-8;' }))
      const anchor = document.createElement('a'); anchor.href = url
      anchor.download = `rentabilidad-${currency}-${view.from || 'inicio'}-${view.to || 'hoy'}.csv`
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success(`${detail.length} registros incluidos en el CSV`)
    } catch { toast.error('No se pudo generar el CSV. Intenta nuevamente.') }
  }

  return <div className="min-w-0 space-y-5 financial-dashboard">
    <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-300">Finanzas · Rentabilidad</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">Dashboard Financiero</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Venta cotizada y costos registrados de cotizaciones ganadas. La utilidad es provisional hasta completar y validar los costos.</p>
        <nav aria-label="Módulos financieros" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{[['Facturación', '/invoicing'], ['Cuentas por cobrar', '/reports?report=receivable&from=&to='], ['Cuentas por pagar', '/accounts-payable']].map(([label, href]) => canAccessPath(role, href.split('?')[0]) && <Link key={href} href={href} className={linkClass}>{label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>)}</nav>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void refresh()} disabled={loading} className={buttonClass}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar</button><button type="button" onClick={exportCsv} disabled={!ready || !detail.length} className={buttonClass}><Download className="h-4 w-4" aria-hidden="true" />Exportar detalle CSV</button></div>
    </header>
    <section className={`${cardClass} !p-4`} aria-label="Filtros del dashboard">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{reportRangeLabel(view.from, view.to)}</p><p className="mt-1 text-xs text-slate-500">Por fecha de creación de la cotización · {currency === 'REVIEW' ? 'Moneda por revisar' : currency}</p></div><button type="button" className={`${buttonClass} md:hidden`} aria-expanded={filtersOpen} aria-controls="financial-filters" onClick={() => setFiltersOpen(!filtersOpen)}><Filter className="h-4 w-4" aria-hidden="true" />Filtros</button></div>
      <div id="financial-filters" className={`${filtersOpen ? 'block' : 'hidden'} mt-4 space-y-4 md:block`}>
        <div className="flex flex-wrap gap-2">{([['month', 'Este mes'], ['quarter', 'Este trimestre'], ['year', 'Este año'], ['all', 'Todas las fechas']] as const).map(([preset, label]) => <button type="button" key={preset} aria-pressed={selectedPreset === preset} onClick={() => updateView({ ...reportDateRange(preset), page: 1 })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selectedPreset === preset ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'}`}>{label}</button>)}{!selectedPreset && <span className="self-center text-xs text-blue-600 dark:text-blue-300">Período personalizado</span>}</div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Desde" id="financial-from"><input id="financial-from" type="date" value={view.from} aria-invalid={invalidRange} onChange={e => updateView({ from: e.target.value, page: 1 })} className={`${fieldClassSm} dark:[color-scheme:dark]`} /></Field>
          <Field label="Hasta" id="financial-to"><input id="financial-to" type="date" value={view.to} aria-invalid={invalidRange} onChange={e => updateView({ to: e.target.value, page: 1 })} className={`${fieldClassSm} dark:[color-scheme:dark]`} /></Field>
          <Field label="Moneda" id="financial-currency"><select id="financial-currency" value={currency} onChange={e => updateView({ currency: e.target.value, focus: 'all', page: 1 })} className={fieldClassSm}>{[...new Set([currency, ...currencyOptions])].map(c => <option key={c} value={c}>{c === 'REVIEW' ? 'Por revisar: sin moneda' : c}</option>)}</select></Field>
          <Field label="Buscar cotización, cliente o servicio" id="financial-search"><input id="financial-search" type="search" value={view.search} onChange={e => updateView({ search: e.target.value, page: 1 })} placeholder="Número, nombre o servicio" className={fieldClassSm} /></Field>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500" aria-live="polite">{loading ? 'Consultando todas las páginas…' : error ? 'Consulta incompleta' : `Última actualización: ${formatDateTime(updatedAt)} · ${rows.length} registros en esta moneda`}. Los importes de distintas monedas no se suman.</p>
      {view.search && <button type="button" onClick={() => updateView({ search: '', page: 1 })} className={`${linkClass} mt-2`}>Quitar búsqueda: {view.search}</button>}
    </section>
    {invalidRange && <Notice>La fecha Desde debe ser anterior o igual a Hasta. Corrige el rango para consultar y exportar.</Notice>}
    {error && <Notice><p role="alert">{error}</p><button type="button" onClick={() => void refresh()} className={`${buttonClass} mt-3`}>Reintentar consulta</button></Notice>}
    {loading && <PageSkeleton cards={4} rows={4} />}
    {ready && <>
      {!data.costsReadable && <Notice>Tu perfil no tiene acceso de lectura a los costos de proveedor. La utilidad con costos registrados y la detección de pérdidas no están disponibles. Solicita al administrador revisar los permisos del módulo.</Notice>}
      {unknown > 0 && currency !== 'REVIEW' && <Notice>{unknown} cotización(es) tienen datos sin moneda identificable y quedan fuera de los totales. <button type="button" onClick={() => updateView({ currency: 'REVIEW', focus: 'all', search: '', page: 1 })} className={linkClass}>Revisar registros</button></Notice>}
      {rows.length === 0 ? <section className={cardClass}><EmptyState title="Sin resultados para estos filtros" description="Prueba otra moneda, amplía el período o quita la búsqueda." action={{ label: 'Ver todas las fechas', onClick: () => updateView({ from: '', to: '', search: '', focus: 'all', page: 1 }) }} /></section> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Venta cotizada" value={money(totals.sale, currency)} sub="Cotizaciones ganadas; no es facturación" />
          <Kpi label="Utilidad cotizada" value={money(totals.profit, currency)} sub={`${totals.quoted} de ${totals.total} registros con venta y costo comparables`} negative={totals.profit !== null && totals.profit < 0} />
          <Kpi label="Margen cotizado" value={totals.margin === null ? 'Sin base comparable' : `${totals.margin.toFixed(1)}%`} sub="Utilidad / venta comparable; margen ponderado" negative={totals.margin !== null && totals.margin < 0} />
          <Kpi label="Utilidad con costos registrados" value={!data.costsReadable ? 'Sin acceso a costos' : money(totals.registeredProfit, currency)} sub={`${totals.comparable} de ${totals.total} registros comparables · resultado provisional`} negative={totals.registeredProfit !== null && totals.registeredProfit < 0} />
        </div>
        <section className={`${cardClass} !p-4`} aria-labelledby="financial-attention"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="financial-attention" className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />Atención requerida</h2><Link href="/cost-validation" className={linkClass}>Validación de costos<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></div>
          <p className="mt-1 text-xs text-slate-500">En la moneda y filtros seleccionados. Un registro puede requerir más de una revisión.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([
            ['loss', data.costsReadable && totals.comparable ? totals.loss : null, 'Pérdidas detectadas', totals.comparable ? `Entre ${totals.comparable} registros comparables` : 'Sin base para evaluar'],
            ['missing', data.costsReadable ? totals.missing : null, 'Sin costos registrados', 'La utilidad todavía no puede evaluarse'],
            ['pending', totals.pending, 'Pendientes de validar', 'Revisar integridad de los costos'],
            ['review', totals.review, 'Datos por revisar', 'Moneda, importes o venta no comparables'],
          ] as const).map(([focus, count, title, sub]) => <button key={focus} type="button" disabled={count === null || count === 0} onClick={() => goToDetail(focus)} className="rounded-xl border border-slate-200 p-3 text-left hover:border-blue-400 disabled:cursor-default disabled:hover:border-slate-200 dark:border-slate-700"><span className="block text-2xl font-bold">{count ?? '—'}</span><span className="mt-1 block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-slate-500">{sub}</span></button>)}</div>
        </section>
        {totals.sale !== null && <>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <Panel title="Venta y utilidad cotizadas" description={`Por mes de creación · ${currency}. Solo meses con datos; no es facturación mensual.`}>
              {trend.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} /><YAxis width={55} tick={{ fontSize: 10 }} tickFormatter={v => Intl.NumberFormat('es', { notation: 'compact' }).format(Number(v))} /><Tooltip labelFormatter={v => monthLabel(String(v))} formatter={v => money(Number(v), currency)} contentStyle={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="Venta cotizada" fill="#3b82f6" radius={[3, 3, 0, 0]} /><Bar dataKey="Utilidad cotizada" fill="#10b981" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="Sin fechas válidas para graficar" />}
            </Panel>
            <Panel title="Margen cotizado mensual" description="Margen ponderado sobre registros comparables. Una venta sin base no equivale a margen cero.">
              {trend.length ? <ResponsiveContainer width="100%" height={260}><LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.25} /><XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11 }} /><YAxis width={50} domain={['auto', 'auto']} tickFormatter={v => `${Number(v).toFixed(0)}%`} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={v => monthLabel(String(v))} formatter={v => `${Number(v).toFixed(1)}%`} contentStyle={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }} /><Line type="linear" dataKey="Margen" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} /></LineChart></ResponsiveContainer> : <EmptyState title="Sin fechas válidas para graficar" />}
            </Panel>
          </div>
          <div className="grid min-w-0 gap-5 xl:grid-cols-2"><Panel title="Clientes por venta cotizada" description="Los ocho principales. La exportación incluye todo el detalle filtrado."><ol className="divide-y divide-slate-100 dark:divide-slate-800">{topClients.map(c => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="min-w-0 break-words font-medium">{c.name}</span><span className="shrink-0 tabular-nums">{money(c.sale, currency)}</span></li>)}</ol></Panel>
            <Panel title="Venta cotizada por servicio" description="Participación en la venta de la moneda seleccionada."><ul className="space-y-4">{serviceRows.map(s => <li key={s.name}><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="min-w-0 break-words font-medium">{s.name} <span className="text-xs font-normal text-slate-500">({s.count})</span></span><span className="tabular-nums">{money(s.sale, currency)}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, totals.sale! > 0 ? s.sale / totals.sale! * 100 : 0))}%` }} /></div></li>)}</ul></Panel></div>
        </>}
        <section id="financial-detail" className={`${cardClass} min-w-0 scroll-mt-4 !p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="financial-detail-title" tabIndex={-1} className="text-lg font-semibold">Detalle de rentabilidad</h2><p className="mt-1 text-xs text-slate-500">Un registro por cotización y moneda. CSV: {detail.length} registros, incluidas todas las páginas.</p></div><div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <Field id="financial-focus" label="Mostrar"><select id="financial-focus" className={fieldClassSm} value={view.focus} onChange={e => updateView({ focus: e.target.value as FinancialFocus, page: 1 })}>{Object.entries(focusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
            <Field id="financial-sort" label="Ordenar por"><select id="financial-sort" className={fieldClassSm} value={view.sort} onChange={e => updateView({ sort: e.target.value, page: 1 })}><option value="date">Más recientes</option><option value="sale">Mayor venta</option><option value="profit">Mayor utilidad cotizada</option><option value="loss">Menor utilidad con costos</option><option value="client">Cliente A–Z</option></select></Field>
          </div></div>
          {view.focus !== 'all' && <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">Detalle: {focusLabels[view.focus]}. <button type="button" onClick={() => updateView({ focus: 'all', page: 1 })} className="font-semibold underline">Mostrar todos</button></p>}
          {detail.length ? <><div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabla de rentabilidad, desplazamiento horizontal"><table className="w-full whitespace-nowrap text-sm"><thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">{['Cotización / cliente', 'Creación', 'Venta cotizada', 'Costo cotizado', 'Utilidad cotizada', 'Costo registrado', 'Utilidad con costos', 'Variación de costo', 'Revisión'].map((label, i) => <th key={label} scope="col" className={`px-3 py-3 ${i > 1 && i < 8 ? 'text-right' : ''}`}>{label}</th>)}</tr></thead><tbody>{pageRows.map(row => <tr key={row.id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="px-3 py-3"><Link href={`/cost-validation/${row.quoteId}`} className={linkClass}>{row.number}<ArrowUpRight className="h-3 w-3" aria-hidden="true" /></Link><p className="mt-1 max-w-64 whitespace-normal break-words text-xs text-slate-500">{row.client}</p><p className="mt-1 text-xs text-slate-500">{row.service}</p></td><td className="px-3 py-3">{formatDate(row.createdAt)}</td>{[row.sale, row.quotedCost, row.quotedProfit, row.registeredCost, row.registeredProfit, row.variance].map((value, i) => <td key={i} className={`px-3 py-3 text-right tabular-nums ${((i === 2 || i === 4) && value !== null && value < 0) ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}`}>{value === null ? <span className="text-slate-400" title="Sin base comparable">—</span> : money(value, currency)}</td>)}<td className="max-w-56 whitespace-normal px-3 py-3"><p className="font-medium">{row.validated ? 'Validado' : 'Pendiente de validar'}</p><p className="mt-1 text-xs text-slate-500">{row.issue || (!row.costsReadable ? 'Sin acceso a costos' : row.registeredCost === null ? 'Sin costos registrados' : 'Con costos registrados')}</p></td></tr>)}</tbody></table></div><Pagination page={page} pageSize={view.pageSize} total={detail.length} onPageChange={next => updateView({ page: next })} onPageSizeChange={size => updateView({ pageSize: size, page: 1 })} /></> : <EmptyState title="Sin registros en esta revisión" action={{ label: 'Mostrar todos', onClick: () => updateView({ focus: 'all', page: 1 }) }} />}
          <p className="mt-3 text-xs leading-relaxed text-slate-500">La utilidad con costos registrados compara venta cotizada y costos de proveedor, incluidos sus impuestos, en la misma moneda. Tener costos registrados no garantiza que estén completos. Variación de costo = costo registrado − costo cotizado. “—” indica que falta una base comparable.</p>
        </section>
      </>}
    </>}
  </div>
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="min-w-0 max-w-full"><label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>{children}</div>
}
function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{children}</div>
}
function Kpi({ label, value, sub, negative = false }: { label: string; value: string; sub: string; negative?: boolean }) {
  return <section className={`min-w-0 rounded-2xl border p-4 ${negative ? 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-[#0b1220]'}`}><h2 className="text-sm text-slate-600 dark:text-slate-400">{label}</h2><p className={`mt-3 break-words text-xl font-bold tabular-nums ${negative ? 'text-rose-700 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>{value}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{sub}</p></section>
}
function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className={`${cardClass} min-w-0 !p-4`}><h2 className="font-semibold">{title}</h2><p className="mb-4 mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>{children}</section>
}
