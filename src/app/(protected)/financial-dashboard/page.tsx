'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  Download,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'

type QuotationRow = {
  id: string
  quotation_number: string | null
  created_at: string | null
  status: string | null
  quote_type: string | null
  tipo_transporte: string | null
  total_sale: number | string | null
  profit_amount: number | string | null
  clientes: { nombre: string | null } | { nombre: string | null }[] | null
}

type PricingItem = {
  quotation_id: string | null
  cost_amount: number | string | null
  sale_amount: number | string | null
  quantity: number | string | null
}

type InvoiceItem = {
  quotation_id: string | null
  total_cost: number | string | null
  tax_amount: number | string | null
}

function resolveCliente(
  clientes: QuotationRow['clientes']
): string {
  if (!clientes) return 'Sin cliente'
  const c = Array.isArray(clientes) ? clientes[0] : clientes
  return c?.nombre || 'Sin cliente'
}

function formatUSD(value: number) {
  return `USD ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPct(value: number) {
  return `${value.toFixed(1)}%`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return new Intl.DateTimeFormat('es-HN', { month: 'short', year: '2-digit' }).format(date)
}

function exportCSV(rows: Record<string, string | number>[], filename: string) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function FinancialDashboardPage() {
  const { profile, loading: userLoading } = useUser()
  const router = useRouter()
  const role = profile?.rol || ''
  const canView = role === 'Admin' || role === 'Finanzas' || role === 'Contabilidad'

  const today = new Date()
  const [dateFrom, setDateFrom] = useState(`${today.getFullYear()}-01-01`)
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10))
  const [activePreset, setActivePreset] = useState<'month' | 'quarter' | 'year' | 'all' | 'custom'>('year')

  const [loading, setLoading] = useState(true)
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])

  const applyPreset = (preset: 'month' | 'quarter' | 'year' | 'all') => {
    setActivePreset(preset)
    const now = new Date()
    const to = now.toISOString().slice(0, 10)
    if (preset === 'month') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
      setDateTo(to)
    } else if (preset === 'quarter') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10))
      setDateTo(to)
    } else if (preset === 'year') {
      setDateFrom(`${now.getFullYear()}-01-01`)
      setDateTo(to)
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  useEffect(() => {
    if (userLoading) return
    if (!canView) { setLoading(false); return }
    fetchData()
  }, [userLoading, canView])

  const fetchData = async () => {
    setLoading(true)

    const { data: qData, error: qError } = await supabase
      .from('quotations')
      .select('id, quotation_number, created_at, status, quote_type, tipo_transporte, total_sale, profit_amount, clientes(nombre)')
      .eq('status', 'Ganada')
      .is('deleted_at', null)

    if (qError) { toast.error(qError.message); setLoading(false); return }

    const qs = (qData || []) as QuotationRow[]
    const ids = qs.map((q) => q.id)

    let pi: PricingItem[] = []
    let ii: InvoiceItem[] = []

    if (ids.length > 0) {
      const [piRes, iiRes] = await Promise.all([
        supabase
          .from('pricing_items')
          .select('quotation_id, cost_amount, sale_amount, quantity')
          .in('quotation_id', ids),
        supabase
          .from('provider_invoice_items')
          .select('quotation_id, total_cost, tax_amount')
          .in('quotation_id', ids),
      ])
      pi = (piRes.data || []) as PricingItem[]
      ii = (iiRes.data || []) as InvoiceItem[]
    }

    setQuotations(qs)
    setPricingItems(pi)
    setInvoiceItems(ii)
    setLoading(false)
  }

  // Filtered by date range (client-side)
  const filtered = useMemo(() => {
    return quotations.filter((q) => {
      const d = (q.created_at || '').slice(0, 10)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
  }, [quotations, dateFrom, dateTo])

  const piByQ = useMemo(() => {
    return pricingItems.reduce<Record<string, PricingItem[]>>((acc, p) => {
      if (!p.quotation_id) return acc
      acc[p.quotation_id] = [...(acc[p.quotation_id] || []), p]
      return acc
    }, {})
  }, [pricingItems])

  const iiByQ = useMemo(() => {
    return invoiceItems.reduce<Record<string, InvoiceItem[]>>((acc, i) => {
      if (!i.quotation_id) return acc
      acc[i.quotation_id] = [...(acc[i.quotation_id] || []), i]
      return acc
    }, {})
  }, [invoiceItems])

  const analytics = useMemo(() => {
    let totalRevenue = 0
    let totalCostCotizado = 0
    let totalCostReal = 0
    const losses: { quotation: string; client: string; realGP: number; variance: number }[] = []
    const byClient: Record<string, { cliente: string; revenue: number; gpCotizado: number }> = {}
    const byMonth: Record<string, { ym: string; revenue: number; gpCotizado: number; count: number }> = {}
    const byType: Record<string, { tipo: string; revenue: number; count: number }> = {}

    filtered.forEach((q) => {
      const items = piByQ[q.id] || []
      const invoices = iiByQ[q.id] || []

      const storedSale = Number(q.total_sale || 0)
      const piSale = items.reduce((s, i) => s + Number(i.sale_amount || 0) * Number(i.quantity || 1), 0)
      const piCost = items.reduce((s, i) => s + Number(i.cost_amount || 0) * Number(i.quantity || 1), 0)
      const realCost = invoices.reduce((s, i) => s + Number(i.total_cost || 0) + Number(i.tax_amount || 0), 0)

      const revenue = storedSale > 0 ? storedSale : piSale
      const gpCotizado = revenue - piCost
      const gpReal = revenue - realCost
      const variance = realCost - piCost

      totalRevenue += revenue
      totalCostCotizado += piCost
      if (realCost > 0) totalCostReal += realCost

      const clientName = resolveCliente(q.clientes)
      byClient[clientName] = byClient[clientName] || { cliente: clientName, revenue: 0, gpCotizado: 0 }
      byClient[clientName].revenue += revenue
      byClient[clientName].gpCotizado += gpCotizado

      const ym = (q.created_at || '').slice(0, 7)
      if (ym) {
        byMonth[ym] = byMonth[ym] || { ym, revenue: 0, gpCotizado: 0, count: 0 }
        byMonth[ym].revenue += revenue
        byMonth[ym].gpCotizado += gpCotizado
        byMonth[ym].count += 1
      }

      const tipo = q.quote_type || q.tipo_transporte || 'Otros'
      byType[tipo] = byType[tipo] || { tipo, revenue: 0, count: 0 }
      byType[tipo].revenue += revenue
      byType[tipo].count += 1

      if (invoices.length > 0 && gpReal < 0) {
        losses.push({
          quotation: q.quotation_number || q.id,
          client: clientName,
          realGP: gpReal,
          variance,
        })
      }
    })

    const gpCotizado = totalRevenue - totalCostCotizado
    const gpPct = totalRevenue > 0 ? (gpCotizado / totalRevenue) * 100 : 0
    const gpReal = totalCostReal > 0 ? totalRevenue - totalCostReal : null

    const monthlyTrend = Object.values(byMonth)
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .map((m) => ({
        mes: monthLabel(m.ym),
        Revenue: Math.round(m.revenue),
        'GP Cotizado': Math.round(m.gpCotizado),
        'GP%': m.revenue > 0 ? Number(((m.gpCotizado / m.revenue) * 100).toFixed(1)) : 0,
      }))

    const topClients = Object.values(byClient)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
      .map((c) => ({
        cliente: c.cliente.length > 18 ? c.cliente.slice(0, 16) + '…' : c.cliente,
        Revenue: Math.round(c.revenue),
        'GP Cotizado': Math.round(c.gpCotizado),
      }))

    const byTypeSorted = Object.values(byType)
      .sort((a, b) => b.revenue - a.revenue)
      .map((t) => ({ tipo: t.tipo, Revenue: Math.round(t.revenue), count: t.count }))

    return {
      totalRevenue,
      gpCotizado,
      gpPct,
      gpReal,
      variance: totalCostReal > 0 ? totalCostReal - totalCostCotizado : null,
      losses: losses.sort((a, b) => a.realGP - b.realGP),
      monthlyTrend,
      topClients,
      byTypeSorted,
      totalQuotations: filtered.length,
    }
  }, [filtered, piByQ, iiByQ])

  if (userLoading || loading) return <PageSkeleton cards={6} rows={4} />

  if (!canView) {
    return (
      <div className={cardClass}>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Acceso restringido</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No tienes permiso para ver este módulo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Finanzas
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
            Dashboard Financiero
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Análisis consolidado de cotizaciones ganadas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push('/cost-validation')}
            className={secondaryButtonClass}
          >
            Validación de Costos
          </button>
          <button
            type="button"
            onClick={() =>
              exportCSV(
                analytics.topClients.map((c) => ({
                  Cliente: c.cliente,
                  Revenue: c.Revenue,
                  'GP Cotizado': c['GP Cotizado'],
                })),
                'financiero-clientes.csv'
              )
            }
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Período:</span>
        {([
          { label: 'Este mes', preset: 'month' as const },
          { label: 'Último trimestre', preset: 'quarter' as const },
          { label: 'Este año', preset: 'year' as const },
          { label: 'Todo', preset: 'all' as const },
        ]).map(({ label, preset }) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            aria-pressed={activePreset === preset}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              activePreset === preset
                ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
        {activePreset === 'custom' && (
          <span className="rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-semibold text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950">
            Personalizado
          </span>
        )}
        <span className="ml-2 text-xs text-slate-400">o personalizado:</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setActivePreset('custom') }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <span className="text-xs text-slate-400">—</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setActivePreset('custom') }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <span className="ml-auto text-xs text-slate-400">
          {analytics.totalQuotations} operación{analytics.totalQuotations !== 1 ? 'es' : ''} ganada{analytics.totalQuotations !== 1 ? 's' : ''}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue total"
          value={formatUSD(analytics.totalRevenue)}
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
        />
        <KpiCard
          label="GP cotizado"
          value={formatUSD(analytics.gpCotizado)}
          sub={formatPct(analytics.gpPct)}
          icon={<TrendingUp className="h-5 w-5" />}
          color={analytics.gpPct >= 15 ? 'green' : analytics.gpPct >= 8 ? 'orange' : 'red'}
        />
        <KpiCard
          label="GP real"
          value={analytics.gpReal !== null ? formatUSD(analytics.gpReal) : 'Sin facturas aún'}
          icon={<TrendingDown className="h-5 w-5" />}
          color={analytics.gpReal === null ? 'slate' : analytics.gpReal >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Pérdidas detectadas"
          value={String(analytics.losses.length)}
          sub={analytics.losses.length > 0 ? 'Requieren atención' : 'Sin pérdidas'}
          icon={<AlertTriangle className="h-5 w-5" />}
          color={analytics.losses.length > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel title="Revenue mensual" description="Ingresos y GP cotizado por mes.">
          {analytics.monthlyTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.monthlyTrend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatUSD(Number(v))} />
                <Bar dataKey="Revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="GP Cotizado" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>

        <ChartPanel title="GP% mensual" description="Tendencia de margen bruto cotizado.">
          {analytics.monthlyTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={analytics.monthlyTrend} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 'auto']} />
                <Tooltip formatter={(v) => `${Number(v)}%`} />
                <Line
                  type="monotone"
                  dataKey="GP%"
                  stroke="#8b5cf6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#8b5cf6' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartPanel title="Top clientes por revenue" description="Clientes con mayor facturación en el período.">
          {analytics.topClients.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.topClients} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="cliente" width={110} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatUSD(Number(v))} />
                <Bar dataKey="Revenue" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                <Bar dataKey="GP Cotizado" fill="#10b981" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartPanel>

        <ChartPanel title="Revenue por tipo de servicio">
          {analytics.byTypeSorted.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="space-y-3 pt-2">
              {analytics.byTypeSorted.map((t) => {
                const pct = analytics.totalRevenue > 0 ? (t.Revenue / analytics.totalRevenue) * 100 : 0
                return (
                  <div key={t.tipo}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{t.tipo}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{t.count} op.</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {formatUSD(t.Revenue)}
                        </span>
                        <span className="w-10 text-right text-xs text-slate-500">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ChartPanel>
      </div>

      {/* Losses table */}
      {analytics.losses.length > 0 && (
        <section className={cardClass}>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Operaciones con pérdida real
            </h2>
            <span className="ml-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
              {analytics.losses.length}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Cotización</th>
                  <th className="pr-4">Cliente</th>
                  <th className="pr-4 text-right">Variación de costo</th>
                  <th className="text-right">GP Real</th>
                </tr>
              </thead>
              <tbody>
                {analytics.losses.map((loss, i) => (
                  <tr key={i} className="border-t border-rose-100 bg-rose-50/50 dark:border-rose-900/30 dark:bg-rose-950/20">
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">
                      {loss.quotation}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">{loss.client}</td>
                    <td className="pr-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                      {formatUSD(loss.variance)}
                    </td>
                    <td className="text-right font-bold text-rose-700 dark:text-rose-300">
                      {formatUSD(loss.realGP)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'orange' | 'red' | 'slate'
}) {
  const colorMap = {
    blue: 'border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/30',
    green: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30',
    orange: 'border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/30',
    red: 'border-rose-200 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/30',
    slate: 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]',
  }
  const iconMap = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-200',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${colorMap[color]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
        <div className={`rounded-xl p-2 ${iconMap[color]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </section>
  )
}

function ChartPanel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className={cardClass}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center text-sm text-slate-400 dark:text-slate-500">
      No hay datos para el período seleccionado.
    </div>
  )
}
