'use client'

import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardList,
  Percent,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import {
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'

type UserTask = {
  id: string
  title: string
  notes: string | null
  status: 'Pendiente' | 'Completada'
  priority: 'Baja' | 'Media' | 'Alta'
  due_date: string | null
}

type ClientJoin = {
  id?: string | null
  nombre: string | null
}

type ProfileJoin = {
  id?: string | null
  nombre: string | null
  apellido: string | null
  email?: string | null
}

type QuotationRow = {
  id: string
  quotation_number: string | null
  status: string | null
  created_at: string | null
  created_by: string | null
  quote_type: string | null
  tipo_transporte: string | null
  total_sale: number | string | null
  profit_amount: number | string | null
  gp_percentage: number | string | null
  clientes?: ClientJoin | ClientJoin[] | null
  cliente?: ClientJoin | ClientJoin[] | null
  created_by_profile?: ProfileJoin | ProfileJoin[] | null
}

type PricingItemRow = {
  quotation_id: string | null
  cost_amount: number | string | null
  sale_amount: number | string | null
  quantity: number | string | null
}

type QuoteTotals = {
  sale: number
  cost: number
  profit: number
  gp: number
}

type ClientSummary = {
  clientName: string
  sale: number
  profit: number
}

type SellerSummary = {
  sellerName: string
  won: number
  sale: number
  profit: number
}

type SellerBreakdown = {
  sellerName: string
  total: number
  pipeline: number
  won: number
  lost: number
}

type FunnelStage = {
  label: string
  count: number
  pct: number
}

const trackedStatuses = [
  'Pendiente de Fijar Precios',
  'Pricing Aprobado',
  'Enviada al Cliente',
  'Ganada',
  'Perdida',
]

function resolveJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function formatCurrency(value: number) {
  return `USD ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function isCurrentMonth(value?: string | null) {
  if (!value) return false

  const date = new Date(value)
  const now = new Date()

  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
}

function getClientName(quote: QuotationRow) {
  return resolveJoin(quote.clientes || quote.cliente)?.nombre || 'Sin cliente'
}

function getSellerName(quote: QuotationRow) {
  const seller = resolveJoin(quote.created_by_profile)
  const fullName = `${seller?.nombre || ''} ${seller?.apellido || ''}`.trim()
  return fullName || seller?.email || 'Sin vendedor'
}

function getQuoteType(quote: QuotationRow) {
  return [quote.quote_type, quote.tipo_transporte].filter(Boolean).join(' / ') || 'N/A'
}

function calculatePricingTotals(items: PricingItemRow[]) {
  return items.reduce(
    (totals, item) => {
      const quantity = Number(item.quantity || 1)
      const cost = Number(item.cost_amount || 0) * quantity
      const sale = Number(item.sale_amount || 0) * quantity

      totals.cost += cost
      totals.sale += sale
      totals.profit += sale - cost

      return totals
    },
    { sale: 0, cost: 0, profit: 0 }
  )
}

function getQuoteTotals(
  quote: QuotationRow,
  pricingByQuote: Record<string, PricingItemRow[]>
): QuoteTotals {
  const pricingTotals = calculatePricingTotals(pricingByQuote[quote.id] || [])
  const storedSale = Number(quote.total_sale || 0)
  const storedProfit = Number(quote.profit_amount || 0)
  const sale = storedSale > 0 ? storedSale : pricingTotals.sale
  const profit = storedSale > 0 || storedProfit !== 0 ? storedProfit : pricingTotals.profit
  const cost = sale - profit
  const gp = sale > 0 ? (profit / sale) * 100 : 0

  return {
    sale,
    cost,
    profit,
    gp,
  }
}

function getStatusBadgeClass(status?: string | null) {
  switch (status) {
    case 'Ganada':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
    case 'Perdida':
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200'
    case 'Enviada al Cliente':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
    case 'Pricing Aprobado':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200'
    case 'Pendiente de Fijar Precios':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading: userLoading } = useUser()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isSales = role === 'Ventas'
  const isOperations = role === 'Operaciones'

  const [loading, setLoading] = useState(true)
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [pricingItems, setPricingItems] = useState<PricingItemRow[]>([])
  const [tasks, setTasks] = useState<UserTask[]>([])
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPriority, setTaskPriority] = useState<'Baja' | 'Media' | 'Alta'>('Media')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [loadingTasks, setLoadingTasks] = useState(false)

  // Date range filter — defaults to current month
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10))
  const [activePreset, setActivePreset] = useState<'month' | 'quarter' | 'year' | 'all' | 'custom'>('month')

  const filteredQuotations = useMemo(() => {
    if (!dateFrom && !dateTo) return quotations
    return quotations.filter((q) => {
      const d = (q.created_at || '').slice(0, 10)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
  }, [quotations, dateFrom, dateTo])

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

  const fetchDashboard = async () => {
    if (!user) return

    setLoading(true)

    let query = supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          id,
          nombre
        ),
        created_by_profile:profiles!quotations_created_by_fkey (
          id,
          nombre,
          apellido,
          email
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (isSales && !isAdmin) {
      query = query.eq('created_by', user.id)
    }

    const { data: quotesData, error: quotesError } = await query

    if (quotesError) {
      toast.error(quotesError.message)
      setQuotations([])
      setPricingItems([])
      setLoading(false)
      return
    }

    const visibleQuotes = (quotesData || []) as QuotationRow[]
    const quoteIds = visibleQuotes.map((quote) => quote.id)
    let pricingData: PricingItemRow[] = []

    if (quoteIds.length > 0) {
      const { data: pricingResult, error: pricingError } = await supabase
        .from('pricing_items')
        .select('quotation_id, cost_amount, sale_amount, quantity')
        .in('quotation_id', quoteIds)

      if (pricingError) {
        toast.error(pricingError.message)
      }

      pricingData = (pricingResult || []) as PricingItemRow[]
    }

    setQuotations(visibleQuotes)
    setPricingItems(pricingData)
    setLoading(false)
  }

  const loadTasks = async () => {
    if (!user) return

    const { data } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', user.id)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })

    if (data) {
      setTasks(data as UserTask[])
    }
  }

  useEffect(() => {
    if (userLoading) return

    if (!user) {
      setLoading(false)
      return
    }

    loadTasks()

    if (isOperations) {
      setLoading(false)
      return
    }

    fetchDashboard()
  }, [userLoading, user?.id, role])

  const createTask = async () => {
    if (!taskTitle.trim() || !user) return

    setLoadingTasks(true)

    const { error } = await supabase.from('user_tasks').insert({
      user_id: user.id,
      title: taskTitle.trim(),
      priority: taskPriority,
      due_date: taskDueDate || null,
    })

    setLoadingTasks(false)

    if (error) {
      toast.error('No se pudo crear la tarea')
      return
    }

    toast.success('Tarea creada')
    setTaskTitle('')
    setTaskPriority('Media')
    setTaskDueDate('')
    loadTasks()
  }

  const toggleTask = async (task: UserTask) => {
    const nextStatus = task.status === 'Pendiente' ? 'Completada' : 'Pendiente'

    await supabase
      .from('user_tasks')
      .update({ status: nextStatus })
      .eq('id', task.id)

    loadTasks()
  }

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from('user_tasks').delete().eq('id', taskId)

    if (error) {
      toast.error('No se pudo eliminar la tarea')
      return
    }

    toast.success('Tarea eliminada')
    loadTasks()
  }

  const dashboard = useMemo(() => {
    const pricingByQuote = pricingItems.reduce<Record<string, PricingItemRow[]>>(
      (acc, item) => {
        if (!item.quotation_id) return acc
        acc[item.quotation_id] = [...(acc[item.quotation_id] || []), item]
        return acc
      },
      {}
    )

    const totalsByQuote = filteredQuotations.reduce<Record<string, QuoteTotals>>((acc, quote) => {
      acc[quote.id] = getQuoteTotals(quote, pricingByQuote)
      return acc
    }, {})

    const quotesThisMonth = filteredQuotations.filter((quote) => isCurrentMonth(quote.created_at))
    const sentQuotes = filteredQuotations.filter((quote) => quote.status === 'Enviada al Cliente')
    const wonQuotes = filteredQuotations.filter((quote) => quote.status === 'Ganada')
    const lostQuotes = filteredQuotations.filter((quote) => quote.status === 'Perdida')
    const pendingPricing = filteredQuotations.filter(
      (quote) => quote.status === 'Pendiente de Fijar Precios'
    )

    const closedQuotes = [...wonQuotes, ...lostQuotes]
    const totalWonSale = wonQuotes.reduce(
      (sum, quote) => sum + totalsByQuote[quote.id].sale,
      0
    )
    const totalWonProfit = wonQuotes.reduce(
      (sum, quote) => sum + totalsByQuote[quote.id].profit,
      0
    )
    const averageGp =
      wonQuotes.length > 0
        ? wonQuotes.reduce((sum, quote) => sum + totalsByQuote[quote.id].gp, 0) /
          wonQuotes.length
        : 0
    const closeRate =
      closedQuotes.length > 0 ? (wonQuotes.length / closedQuotes.length) * 100 : 0

    const topClients = Object.values(
      wonQuotes.reduce<Record<string, ClientSummary>>((acc, quote) => {
        const clientName = getClientName(quote)
        const totals = totalsByQuote[quote.id]

        acc[clientName] = acc[clientName] || {
          clientName,
          sale: 0,
          profit: 0,
        }
        acc[clientName].sale += totals.sale
        acc[clientName].profit += totals.profit

        return acc
      }, {})
    ).sort((a, b) => b.sale - a.sale)

    const topSellers = Object.values(
      wonQuotes.reduce<Record<string, SellerSummary>>((acc, quote) => {
        const sellerName = getSellerName(quote)
        const totals = totalsByQuote[quote.id]

        acc[sellerName] = acc[sellerName] || {
          sellerName,
          won: 0,
          sale: 0,
          profit: 0,
        }
        acc[sellerName].won += 1
        acc[sellerName].sale += totals.sale
        acc[sellerName].profit += totals.profit

        return acc
      }, {})
    ).sort((a, b) => b.sale - a.sale)

    const statusRows = trackedStatuses.map((status) => ({
      status,
      count: filteredQuotations.filter((quote) => quote.status === status).length,
    }))

    const sellerBreakdown: SellerBreakdown[] = Object.values(
      filteredQuotations.reduce<Record<string, SellerBreakdown>>((acc, quote) => {
        const sellerName = getSellerName(quote)
        acc[sellerName] = acc[sellerName] || { sellerName, total: 0, pipeline: 0, won: 0, lost: 0 }
        acc[sellerName].total += 1
        if (quote.status === 'Ganada') acc[sellerName].won += 1
        else if (quote.status === 'Perdida') acc[sellerName].lost += 1
        else acc[sellerName].pipeline += 1
        return acc
      }, {})
    ).sort((a, b) => b.total - a.total)

    const totalCount = filteredQuotations.length
    const inPricingCount = filteredQuotations.filter((q) =>
      ['Pricing Aprobado', 'Enviada al Cliente', 'Ganada', 'Perdida'].includes(q.status || '')
    ).length
    const sentCount = filteredQuotations.filter((q) =>
      ['Enviada al Cliente', 'Ganada', 'Perdida'].includes(q.status || '')
    ).length
    const closedCount = wonQuotes.length + lostQuotes.length

    const funnelStages: FunnelStage[] = [
      { label: 'Cotizaciones creadas', count: totalCount, pct: 100 },
      { label: 'Llegaron a pricing', count: inPricingCount, pct: totalCount > 0 ? (inPricingCount / totalCount) * 100 : 0 },
      { label: 'Enviadas al cliente', count: sentCount, pct: totalCount > 0 ? (sentCount / totalCount) * 100 : 0 },
      { label: 'Cerradas', count: closedCount, pct: totalCount > 0 ? (closedCount / totalCount) * 100 : 0 },
      { label: 'Ganadas', count: wonQuotes.length, pct: totalCount > 0 ? (wonQuotes.length / totalCount) * 100 : 0 },
    ]

    return {
      pricingByQuote,
      totalsByQuote,
      metrics: {
        quotesThisMonth: quotesThisMonth.length,
        sentQuotes: sentQuotes.length,
        wonQuotes: wonQuotes.length,
        lostQuotes: lostQuotes.length,
        closeRate,
        totalWonSale,
        totalWonProfit,
        averageGp,
      },
      latestQuotes: filteredQuotations.slice(0, 8),
      topClients: topClients.slice(0, 6),
      topSellers: topSellers.slice(0, 6),
      pendingPricing: pendingPricing.slice(0, 8),
      statusRows,
      sellerBreakdown,
      funnelStages,
    }
  }, [filteredQuotations, pricingItems])

  if (userLoading || loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
          ))}
        </div>
        <div className="h-48 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
      </div>
    )
  }

  if (isOperations) {
    return (
      <div className="space-y-6">
        <Header
          subtitle="Vista limitada para Operaciones."
          onNewQuote={() => router.push('/quotations/new')}
        />
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Dashboard Operativo
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            El control operativo de bookings, ETAs, documentos y contenedores está
            disponible en el módulo de Operaciones.
          </p>
          <button
            type="button"
            onClick={() => router.push('/operations/dashboard')}
            className={`${primaryButtonClass} mt-5`}
          >
            Ir a Operaciones
          </button>
        </section>
        <TasksPanel
          tasks={tasks}
          taskTitle={taskTitle}
          taskPriority={taskPriority}
          taskDueDate={taskDueDate}
          loadingTasks={loadingTasks}
          setTaskTitle={setTaskTitle}
          setTaskPriority={setTaskPriority}
          setTaskDueDate={setTaskDueDate}
          createTask={createTask}
          toggleTask={toggleTask}
          deleteTask={deleteTask}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header
        subtitle={
          isSales
            ? 'Resumen ejecutivo comercial de tus cotizaciones.'
            : 'Resumen ejecutivo comercial y gerencial.'
        }
        onNewQuote={() => router.push('/quotations/new')}
      />

      {/* Date range filter */}
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
          {filteredQuotations.length} cotización{filteredQuotations.length !== 1 ? 'es' : ''} en período
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Cotizaciones creadas este mes"
          value={dashboard.metrics.quotesThisMonth}
          icon={<ClipboardList className="h-5 w-5" />}
        />
        <MetricCard
          title="Cotizaciones enviadas al cliente"
          value={dashboard.metrics.sentQuotes}
          icon={<BriefcaseBusiness className="h-5 w-5" />}
        />
        <MetricCard
          title="Cotizaciones ganadas"
          value={dashboard.metrics.wonQuotes}
          icon={<TrendingUp className="h-5 w-5" />}
          positive
        />
        <MetricCard
          title="Cotizaciones perdidas"
          value={dashboard.metrics.lostQuotes}
          icon={<TrendingDown className="h-5 w-5" />}
          danger
        />
        <MetricCard
          title="Tasa de cierre"
          value={formatPercent(dashboard.metrics.closeRate)}
          icon={<Target className="h-5 w-5" />}
        />
        <MetricCard
          title="Venta total ganada"
          value={formatCurrency(dashboard.metrics.totalWonSale)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          positive
        />
        <MetricCard
          title="Profit total ganado"
          value={formatCurrency(dashboard.metrics.totalWonProfit)}
          icon={<BarChart3 className="h-5 w-5" />}
          positive={dashboard.metrics.totalWonProfit >= 0}
          danger={dashboard.metrics.totalWonProfit < 0}
        />
        <MetricCard
          title="GP% promedio"
          value={formatPercent(dashboard.metrics.averageGp)}
          icon={<Percent className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <LatestQuotesTable
          quotes={dashboard.latestQuotes}
          totalsByQuote={dashboard.totalsByQuote}
        />
        <ConversionFunnel stages={dashboard.funnelStages} />
        <TopClientsTable rows={dashboard.topClients} />
        <TopSellersTable rows={dashboard.topSellers} />
        <SellerBreakdownTable rows={dashboard.sellerBreakdown} />
        <StatusTable rows={dashboard.statusRows} total={filteredQuotations.length} />
        <PendingPricingTable quotes={dashboard.pendingPricing} />
        <TasksPanel
          tasks={tasks}
          taskTitle={taskTitle}
          taskPriority={taskPriority}
          taskDueDate={taskDueDate}
          loadingTasks={loadingTasks}
          setTaskTitle={setTaskTitle}
          setTaskPriority={setTaskPriority}
          setTaskDueDate={setTaskDueDate}
          createTask={createTask}
          toggleTask={toggleTask}
          deleteTask={deleteTask}
        />
      </div>
    </div>
  )
}

function Header({
  subtitle,
  onNewQuote,
}: {
  subtitle: string
  onNewQuote: () => void
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
          Dashboard Comercial
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          Resumen Ejecutivo
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onNewQuote} className={primaryButtonClass}>
          Nueva Cotización
        </button>
        <Link href="/historico" className={secondaryButtonClass}>
          Histórico
        </Link>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  icon,
  positive,
  danger,
}: {
  title: string
  value: number | string
  icon: React.ReactNode
  positive?: boolean
  danger?: boolean
}) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm ${
        danger
          ? 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30'
          : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        <div
          className={`rounded-xl p-2 ${
            danger
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'
              : positive
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-200'
          }`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </section>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function EmptyTable({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-t border-slate-100 py-6 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400"
      >
        No hay datos para mostrar.
      </td>
    </tr>
  )
}

function LatestQuotesTable({
  quotes,
  totalsByQuote,
}: {
  quotes: QuotationRow[]
  totalsByQuote: Record<string, QuoteTotals>
}) {
  return (
    <Panel title="Últimas cotizaciones">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-3 pr-4">Número</th>
              <th className="pr-4">Cliente</th>
              <th className="pr-4">Estado</th>
              <th className="pr-4 text-right">Venta total</th>
              <th className="pr-4 text-right">Profit</th>
              <th className="pr-4">Vendedor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <EmptyTable colSpan={7} />
            ) : (
              quotes.map((quote) => {
                const totals = totalsByQuote[quote.id]

                return (
                  <tr
                    key={quote.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">
                      {quote.quotation_number || 'Sin número'}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {getClientName(quote)}
                    </td>
                    <td className="pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          quote.status
                        )}`}
                      >
                        {quote.status || 'N/A'}
                      </span>
                    </td>
                    <td className="pr-4 text-right text-slate-700 dark:text-slate-300">
                      {formatCurrency(totals?.sale || 0)}
                    </td>
                    <td className="pr-4 text-right font-semibold text-slate-900 dark:text-white">
                      {formatCurrency(totals?.profit || 0)}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {getSellerName(quote)}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/quotations/${quote.id}`}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function TopClientsTable({ rows }: { rows: ClientSummary[] }) {
  return (
    <Panel title="Top clientes por venta ganada">
      <SimpleRankingTable
        columns={['Cliente', 'Venta total', 'Profit']}
        rows={rows}
        renderRow={(row) => [
          row.clientName,
          formatCurrency(row.sale),
          formatCurrency(row.profit),
        ]}
      />
    </Panel>
  )
}

function TopSellersTable({ rows }: { rows: SellerSummary[] }) {
  return (
    <Panel title="Top vendedores">
      <SimpleRankingTable
        columns={['Vendedor', 'Ganadas', 'Venta total', 'Profit']}
        rows={rows}
        renderRow={(row) => [
          row.sellerName,
          String(row.won),
          formatCurrency(row.sale),
          formatCurrency(row.profit),
        ]}
      />
    </Panel>
  )
}

function SimpleRankingTable<T>({
  columns,
  rows,
  renderRow,
}: {
  columns: string[]
  rows: T[]
  renderRow: (row: T) => string[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                className={`py-3 pr-4 ${index > 0 ? 'text-right' : ''}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyTable colSpan={columns.length} />
          ) : (
            rows.map((row, index) => {
              const values = renderRow(row)

              return (
                <tr
                  key={index}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  {values.map((value, valueIndex) => (
                    <td
                      key={valueIndex}
                      className={`py-3 pr-4 text-slate-700 dark:text-slate-300 ${
                        valueIndex > 0 ? 'text-right font-semibold' : 'font-medium'
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function ConversionFunnel({ stages }: { stages: FunnelStage[] }) {
  return (
    <Panel
      title="Embudo de conversión"
      description="Flujo acumulado desde creación hasta cierre."
    >
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const prev = stages[i - 1]
          const convRate = prev && prev.count > 0 ? (stage.count / prev.count) * 100 : null

          return (
            <div key={stage.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {stage.label}
                </span>
                <div className="flex items-center gap-3">
                  {convRate !== null && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {convRate.toFixed(0)}% del anterior
                    </span>
                  )}
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {stage.count}
                  </span>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    stage.label === 'Ganadas'
                      ? 'bg-emerald-500 dark:bg-emerald-400'
                      : stage.label === 'Cerradas'
                        ? 'bg-slate-500 dark:bg-slate-400'
                        : 'bg-blue-500 dark:bg-blue-400'
                  }`}
                  style={{ width: `${Math.max(stage.pct, stage.count > 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function SellerBreakdownTable({ rows }: { rows: SellerBreakdown[] }) {
  return (
    <Panel
      title="Pipeline por vendedor"
      description="Actividad completa: todas las cotizaciones del período."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-3 pr-4">Vendedor</th>
              <th className="pr-4 text-right">Total</th>
              <th className="pr-4 text-right">Pipeline</th>
              <th className="pr-4 text-right">Ganadas</th>
              <th className="pr-4 text-right">Perdidas</th>
              <th className="text-right">Cierre</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyTable colSpan={6} />
            ) : (
              rows.map((row) => {
                const closed = row.won + row.lost
                const closeRate = closed > 0 ? (row.won / closed) * 100 : null

                return (
                  <tr
                    key={row.sellerName}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">
                      {row.sellerName}
                    </td>
                    <td className="pr-4 text-right text-slate-700 dark:text-slate-300">
                      {row.total}
                    </td>
                    <td className="pr-4 text-right text-slate-500 dark:text-slate-400">
                      {row.pipeline}
                    </td>
                    <td className="pr-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                      {row.won}
                    </td>
                    <td className="pr-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                      {row.lost}
                    </td>
                    <td className="text-right text-slate-700 dark:text-slate-300">
                      {closeRate !== null ? `${closeRate.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function PendingPricingTable({ quotes }: { quotes: QuotationRow[] }) {
  return (
    <Panel title="Cotizaciones pendientes de pricing">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-3 pr-4">Número</th>
              <th className="pr-4">Cliente</th>
              <th className="pr-4">Tipo</th>
              <th className="pr-4">Fecha creación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <EmptyTable colSpan={5} />
            ) : (
              quotes.map((quote) => (
                <tr
                  key={quote.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">
                    {quote.quotation_number || 'Sin número'}
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {getClientName(quote)}
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {getQuoteType(quote)}
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {formatDate(quote.created_at)}
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/pricing-comparison?quoteId=${quote.id}`}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Pricing
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function StatusTable({
  rows,
  total,
}: {
  rows: Array<{ status: string; count: number }>
  total: number
}) {
  return (
    <Panel title="Cotizaciones por estado">
      <div className="space-y-3">
        {rows.map((row) => {
          const percentage = total > 0 ? (row.count / total) * 100 : 0

          return (
            <div key={row.status}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {row.status}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {row.count}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-2 rounded-full bg-blue-600 dark:bg-blue-400"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function TasksPanel({
  tasks,
  taskTitle,
  taskPriority,
  taskDueDate,
  loadingTasks,
  setTaskTitle,
  setTaskPriority,
  setTaskDueDate,
  createTask,
  toggleTask,
  deleteTask,
}: {
  tasks: UserTask[]
  taskTitle: string
  taskPriority: 'Baja' | 'Media' | 'Alta'
  taskDueDate: string
  loadingTasks: boolean
  setTaskTitle: (value: string) => void
  setTaskPriority: (value: 'Baja' | 'Media' | 'Alta') => void
  setTaskDueDate: (value: string) => void
  createTask: () => void
  toggleTask: (task: UserTask) => void
  deleteTask: (taskId: string) => void
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  return (
    <Panel
      title="Mis tareas"
      description="Pendientes personales del usuario conectado."
    >
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null) }}
        title="Eliminar tarea"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDeleteId) deleteTask(confirmDeleteId)
          setConfirmDeleteId(null)
        }}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_140px]">
        <input
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Nueva tarea..."
          className={fieldClass}
        />

        <select
          value={taskPriority}
          onChange={(event) =>
            setTaskPriority(event.target.value as 'Baja' | 'Media' | 'Alta')
          }
          className={fieldClass}
        >
          <option value="Baja">Baja</option>
          <option value="Media">Media</option>
          <option value="Alta">Alta</option>
        </select>

        <input
          type="date"
          value={taskDueDate}
          onChange={(event) => setTaskDueDate(event.target.value)}
          className={fieldClass}
        />

        <button
          type="button"
          onClick={createTask}
          disabled={loadingTasks || !taskTitle.trim()}
          className={primaryButtonClass}
        >
          {loadingTasks ? 'Agregando...' : 'Agregar'}
        </button>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No tienes tareas pendientes.
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
            >
              <div>
                <p
                  className={`text-sm font-medium ${
                    task.status === 'Completada'
                      ? 'text-slate-400 line-through'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {task.title}
                </p>
                <div className="mt-1 flex gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{task.priority}</span>
                  {task.due_date && <span>Vence: {formatDate(task.due_date)}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleTask(task)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {task.status === 'Pendiente' ? 'Completar' : 'Reabrir'}
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(task.id)}
                  className="rounded-lg border border-red-300 p-2 text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}
