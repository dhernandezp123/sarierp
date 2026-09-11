'use client'

import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  Target,
  Trash2,
  ArrowUpRight,
  Clock3,
} from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { calendarDaysUntil, formatDate, formatMoney as formatCurrency, toDateInputValue } from '@/src/lib/format'
import { commercialChange, isInCreationPeriod, openCommercialStatuses, previousCreationPeriod, summarizeCommercialQuotes } from '@/src/lib/commercial-dashboard'
import { allowedTransitions } from '@/src/lib/quotation-status'
import { canAccessPath } from '@/src/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import { supabase } from '@/src/lib/supabase/client'
import {
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass as baseSecondaryButtonClass,
} from '@/src/lib/ui-classes'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'

const secondaryButtonClass = `${baseSecondaryButtonClass} dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`
type TaskView = 'pending' | 'overdue' | 'completed'

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
  agent_quotes?: { valid_until: string | null; is_selected: boolean }[] | null
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
  clientKey: string
  clientName: string
  sale: number
  profit: number
}

type SellerSummary = {
  sellerKey: string
  sellerName: string
  won: number
  sale: number
  profit: number
}

type SellerBreakdown = {
  sellerKey: string
  sellerName: string
  total: number
  pipeline: number
  won: number
  lost: number
}

const trackedStatuses = Object.keys(allowedTransitions)

function resolveJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function formatPercent(value: number | null) {
  return value === null ? '—' : value.toFixed(2) + '%'
}

function getClientName(quote: QuotationRow) {
  return resolveJoin(quote.clientes || quote.cliente)?.nombre || 'Sin cliente'
}

function getClientKey(quote: QuotationRow) {
  return resolveJoin(quote.clientes || quote.cliente)?.id || 'unassigned'
}

function getSellerKey(quote: QuotationRow) {
  return quote.created_by || resolveJoin(quote.created_by_profile)?.id || 'unassigned'
}

function getSellerName(quote: QuotationRow) {
  const seller = resolveJoin(quote.created_by_profile)
  const fullName = `${seller?.nombre || ''} ${seller?.apellido || ''}`.trim()
  return fullName || seller?.email || 'Sin vendedor'
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
  const isPricing = role === 'Pricing'
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
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState('')
  const [retry, setRetry] = useState(0)
  const [tab, setTab] = useState('overview')
  const [detailFilter, setDetailFilter] = useState(isPricing ? 'pricing' : 'all')
  const [clientFilter, setClientFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [taskView, setTaskView] = useState<TaskView>('pending')

  // Date range filter — defaults to current month
  const today = new Date()
  const firstOfMonth = toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1))
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(toDateInputValue(today))
  const [activePreset, setActivePreset] = useState<'month' | 'quarter' | 'year' | 'all' | 'custom'>('month')

  const invalidPeriod = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const filteredQuotations = useMemo(() => quotations.filter((quote) =>
    isInCreationPeriod(quote.created_at, dateFrom, dateTo)
  ), [quotations, dateFrom, dateTo])
  const previousPeriod = previousCreationPeriod(dateFrom, dateTo)

  const showDetails = (filter: string, client = '', seller = '') => {
    setDetailFilter(filter)
    setClientFilter(client)
    setSellerFilter(seller)
    setTab('overview')
    requestAnimationFrame(() => document.getElementById('quotation-detail')?.focus())
  }

  const applyPreset = (preset: 'month' | 'quarter' | 'year' | 'all') => {
    setActivePreset(preset)
    const now = new Date()
    const to = toDateInputValue(now)
    if (preset === 'month') {
      setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
      setDateTo(to)
    } else if (preset === 'quarter') {
      setDateFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth() - 2, 1)))
      setDateTo(to)
    } else if (preset === 'year') {
      setDateFrom(`${now.getFullYear()}-01-01`)
      setDateTo(to)
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  const userId = user?.id
  const [taskRefresh, setTaskRefresh] = useState(0)
  const loadTasks = () => setTaskRefresh((value) => value + 1)

  useEffect(() => {
    if (userLoading || !userId || isOperations) return
    let cancelled = false
    const fetchDashboard = async () => {
      setLoading(true)
      setDashboardError(null)
      try {
        const visibleQuotes: QuotationRow[] = []
        const pageSize = 500
        // Aggregate every page, not only the API's first page.
        for (let offset = 0; ; offset += pageSize) {
          let query = supabase.from('quotations').select(`
            id, quotation_number, status, created_at, created_by, quote_type,
            tipo_transporte, total_sale, profit_amount, gp_percentage,
            clientes(id, nombre), agent_quotes(valid_until, is_selected),
            created_by_profile:profiles!quotations_created_by_fkey(id, nombre, apellido, email)
          `).is('deleted_at', null).order('created_at', { ascending: false }).order('id')
          if (isSales) query = query.eq('created_by', userId)
          const { data, error } = await query.range(offset, offset + pageSize - 1)
          if (cancelled) return
          if (error) throw error
          visibleQuotes.push(...(data || []) as QuotationRow[])
          if (!data || data.length < pageSize) break
        }
        const pricingData: PricingItemRow[] = []
        for (let start = 0; start < visibleQuotes.length; start += 100) {
          const ids = visibleQuotes.slice(start, start + 100).map((quote) => quote.id)
          for (let offset = 0; ; offset += pageSize) {
            const { data, error } = await supabase.from('pricing_items')
              .select('quotation_id, cost_amount, sale_amount, quantity')
              .in('quotation_id', ids).order('id').range(offset, offset + pageSize - 1)
            if (cancelled) return
            if (error) throw error
            pricingData.push(...(data || []) as PricingItemRow[])
            if (!data || data.length < pageSize) break
          }
        }
        if (!cancelled) {
          setQuotations(visibleQuotes)
          setPricingItems(pricingData)
        }
      } catch {
        if (!cancelled) setDashboardError('No se pudo cargar el resumen completo. Intenta nuevamente.')
      } finally {
        if (!cancelled) { setLoadedFor(userId + ':' + role); setLoading(false) }
      }
    }
    void fetchDashboard()
    return () => { cancelled = true }
  }, [userLoading, userId, role, isSales, isOperations, retry])

  const [tasksError, setTasksError] = useState(false)
  const [tasksOwner, setTasksOwner] = useState<string | null>(null)
  useEffect(() => {
    if (userLoading || !userId) return
    let cancelled = false
    const fetchTasks = async () => {
      try {
        const allTasks: UserTask[] = []
        const pageSize = 500
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from('user_tasks').select('*')
            .eq('user_id', userId).order('status', { ascending: false })
            .order('due_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: false }).order('id')
            .range(offset, offset + pageSize - 1)
          if (cancelled) return
          if (error) throw error
          allTasks.push(...(data || []) as UserTask[])
          if (!data || data.length < pageSize) break
        }
        if (!cancelled) { setTasks(allTasks); setTasksError(false) }
      } catch {
        if (!cancelled) setTasksError(true)
      } finally {
        if (!cancelled) setTasksOwner(userId)
      }
    }
    void fetchTasks()
    return () => { cancelled = true }
  }, [userLoading, userId, taskRefresh])

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
    if (!userId) return
    const nextStatus = task.status === 'Pendiente' ? 'Completada' : 'Pendiente'

    const { error } = await supabase
      .from('user_tasks')
      .update({ status: nextStatus })
      .eq('id', task.id)
      .eq('user_id', userId)

    if (error) { toast.error('No se pudo actualizar la tarea'); return }
    loadTasks()
  }

  const deleteTask = async (taskId: string) => {
    if (!userId) return
    const { error } = await supabase.from('user_tasks').delete().eq('id', taskId).eq('user_id', userId)

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

    const totalsByQuote = quotations.reduce<Record<string, QuoteTotals>>((acc, quote) => {
      acc[quote.id] = getQuoteTotals(quote, pricingByQuote)
      return acc
    }, {})

    const sentQuotes = filteredQuotations.filter((quote) => quote.status === 'Enviada al Cliente')
    const wonQuotes = filteredQuotations.filter((quote) => quote.status === 'Ganada')
    const lostQuotes = filteredQuotations.filter((quote) => quote.status === 'Perdida')
    const metrics = summarizeCommercialQuotes(filteredQuotations, (quote) => totalsByQuote[quote.id])
    const previous = previousCreationPeriod(dateFrom, dateTo)
    const previousMetrics = previous ? summarizeCommercialQuotes(
      quotations.filter((quote) => isInCreationPeriod(quote.created_at, previous.from, previous.to)),
      (quote) => totalsByQuote[quote.id]
    ) : null

    const topClients = Object.values(
      wonQuotes.reduce<Record<string, ClientSummary>>((acc, quote) => {
        const clientName = getClientName(quote)
        const clientKey = getClientKey(quote)
        const totals = totalsByQuote[quote.id]

        acc[clientKey] = acc[clientKey] || {
          clientKey, clientName,
          sale: 0,
          profit: 0,
        }
        acc[clientKey].sale += totals.sale
        acc[clientKey].profit += totals.profit

        return acc
      }, {})
    ).sort((a, b) => b.sale - a.sale)

    const topSellers = Object.values(
      wonQuotes.reduce<Record<string, SellerSummary>>((acc, quote) => {
        const sellerName = getSellerName(quote)
        const sellerKey = getSellerKey(quote)
        const totals = totalsByQuote[quote.id]

        acc[sellerKey] = acc[sellerKey] || {
          sellerKey, sellerName,
          won: 0,
          sale: 0,
          profit: 0,
        }
        acc[sellerKey].won += 1
        acc[sellerKey].sale += totals.sale
        acc[sellerKey].profit += totals.profit

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
        const sellerKey = getSellerKey(quote)
        acc[sellerKey] = acc[sellerKey] || { sellerKey, sellerName, total: 0, pipeline: 0, won: 0, lost: 0 }
        acc[sellerKey].total += 1
        if (quote.status === 'Ganada') acc[sellerKey].won += 1
        else if (quote.status === 'Perdida') acc[sellerKey].lost += 1
        else if (openCommercialStatuses.includes(quote.status || '')) acc[sellerKey].pipeline += 1
        return acc
      }, {})
    ).sort((a, b) => b.total - a.total)

    return {
      totalsByQuote, metrics, previousMetrics,
      sentQuotes: sentQuotes.length, wonQuotes: wonQuotes.length, lostQuotes: lostQuotes.length,
      topClients: topClients.slice(0, 6), topSellers: topSellers.slice(0, 6),
      statusRows, sellerBreakdown,
    }
  }, [filteredQuotations, quotations, pricingItems, dateFrom, dateTo])

  const oldestFirst = (a: QuotationRow, b: QuotationRow) => (a.created_at || '').localeCompare(b.created_at || '')
  const pendingPricing = quotations.filter((q) => q.status === 'Pendiente de Fijar Precios').sort(oldestFirst)
  const followUp = quotations.filter((q) => q.status === 'Enviada al Cliente').sort(oldestFirst)
  const expiringQuotes = quotations.filter((q) =>
    [...openCommercialStatuses, 'Ganada'].includes(q.status || '') &&
    q.agent_quotes?.some((rate) => rate.is_selected && rate.valid_until &&
      (calendarDaysUntil(rate.valid_until) ?? Infinity) <= 7)
  ).sort((a, b) => (a.agent_quotes?.find((r) => r.is_selected)?.valid_until || '')
    .localeCompare(b.agent_quotes?.find((r) => r.is_selected)?.valid_until || ''))
  const overdueTasks = tasks.filter((task) => task.status === 'Pendiente' &&
    task.due_date && (calendarDaysUntil(task.due_date) ?? 0) < 0)
  const attentionFilter = ['pricing', 'followup', 'expiring'].includes(detailFilter)
  const detailSource = detailFilter === 'pricing' ? pendingPricing
    : detailFilter === 'followup' ? followUp
    : detailFilter === 'expiring' ? expiringQuotes : filteredQuotations
  const detailQuotes = detailSource.filter((quote) => {
    if (clientFilter && getClientKey(quote) !== clientFilter) return false
    if (sellerFilter && getSellerKey(quote) !== sellerFilter) return false
    if (attentionFilter || detailFilter === 'all') return true
    if (detailFilter === 'open') return openCommercialStatuses.includes(quote.status || '')
    if (detailFilter === 'closed') return ['Ganada', 'Perdida'].includes(quote.status || '')
    return quote.status === detailFilter
  })
  const detailLabels: Record<string, string> = {
    all: 'Cotizaciones del período', open: 'Oportunidades abiertas', closed: 'Cotizaciones cerradas',
    pricing: 'Pendientes de pricing · todos los períodos', followup: 'Pendientes de respuesta · todos los períodos',
    expiring: 'Tarifas vencidas o por vencer en 7 días · todos los períodos',
  }
  const quoteHref = (quote: QuotationRow) => canAccessPath(role, '/quotations/' + quote.id)
    ? '/quotations/' + quote.id : canAccessPath(role, '/pricing-comparison')
      ? '/pricing-comparison?quoteId=' + quote.id : '/historico'

  if (!userLoading && !user) return null

  if (userLoading || (!isOperations && (loading || loadedFor !== userId + ':' + role))) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
          ))}
        </div>
        <div className="h-48 rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" />
      </div>
    )
  }

  if (!user) return null

  if (isOperations) {
    return (
      <div className="space-y-6">
        <Header
          subtitle="Control de bookings, documentos y tareas operativas."
          actionLabel="Abrir Operaciones"
          onNewQuote={() => router.push('/operations/dashboard')}
        />
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
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
        {tasksOwner !== userId ? <p role="status">Cargando tareas…</p> : tasksError ? (
          <Panel title="Tareas no disponibles"><button className={secondaryButtonClass} onClick={loadTasks}>Reintentar</button></Panel>
        ) : <TasksPanel
          view={taskView}
          onViewChange={setTaskView}
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
        />}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Header
        subtitle={
          isSales
            ? 'Resumen ejecutivo comercial de tus cotizaciones.'
            : isPricing ? 'Prioridades de pricing y vigencia de tarifas.' : 'Resumen ejecutivo comercial y gerencial.'
        }
        actionLabel={canAccessPath(role, '/quotations/new') ? 'Nueva cotización' : 'Dashboard financiero'}
        onNewQuote={() => router.push(canAccessPath(role, '/quotations/new') ? '/quotations/new' : '/financial-dashboard')}
      />

      {dashboardError ? (
        <Panel title="Resumen no disponible"><p role="alert">{dashboardError}</p>
          <button className={primaryButtonClass} onClick={() => setRetry((value) => value + 1)}>Reintentar</button>
        </Panel>
      ) : <>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Período:</span>
        {([
          { label: 'Este mes', preset: 'month' as const },
          { label: 'Últimos 3 meses', preset: 'quarter' as const },
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
          aria-label="Desde (fecha de creación)"
          max={dateTo || undefined}
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setActivePreset('custom') }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <span className="text-xs text-slate-400">—</span>
        <input
          type="date"
          aria-label="Hasta (fecha de creación)"
          min={dateFrom || undefined}
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setActivePreset('custom') }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <span className="ml-auto text-xs text-slate-400">
          {filteredQuotations.length} cotización{filteredQuotations.length !== 1 ? 'es' : ''} en período
        </span>
      </div>

      {invalidPeriod && <p role="alert" className="text-sm text-red-600">La fecha inicial debe ser anterior o igual a la final.</p>}

      <Panel title="Requiere atención" description="Pendientes de todos los períodos. Pricing y respuestas se ordenan por antigüedad de creación; las tarifas, por vencimiento.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Pendientes de pricing', count: pendingPricing.length, filter: 'pricing' },
            { label: 'Pendientes de respuesta', count: followUp.length, filter: 'followup' },
            { label: 'Tarifas vencidas o por vencer', count: expiringQuotes.length, filter: 'expiring' },
          ].map((item) => <button key={item.filter} onClick={() => showDetails(item.filter)} className={secondaryButtonClass + ' flex items-center justify-between gap-3 text-left'}>
            <span>{item.label}</span><strong className="text-xl">{item.count}</strong><ArrowUpRight className="h-4 w-4 shrink-0" />
          </button>)}
          <button onClick={() => { setTaskView('overdue'); setTab('tasks'); requestAnimationFrame(() => document.getElementById('dashboard-tasks')?.focus()) }} className={secondaryButtonClass + ' flex items-center justify-between gap-3 text-left'}>
            <span>Tareas vencidas</span><strong className="text-xl">{tasksError || tasksOwner !== userId ? '—' : overdueTasks.length}</strong><Clock3 className="h-4 w-4 shrink-0" />
          </button>
        </div>
        {pendingPricing[0] && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Pricing más antiguo: {pendingPricing[0].quotation_number || 'Sin número'} · creado el {formatDate(pendingPricing[0].created_at)}.</p>}
      </Panel>

      <div className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">Resultados actuales de cotizaciones creadas en el período. Los importes son cotizados; no representan facturación ni cobros.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Venta cotizada ganada" value={formatCurrency(dashboard.metrics.wonSale)} icon={<CircleDollarSign className="h-5 w-5" />} onClick={() => showDetails('Ganada')}
            description={dashboard.previousMetrics ? commercialChange(dashboard.metrics.wonSale, dashboard.previousMetrics.wonSale) + ' vs. período anterior' : 'Cotizaciones en estado Ganada'} />
          <MetricCard title="Utilidad cotizada ganada" value={formatCurrency(dashboard.metrics.wonProfit)} icon={<BarChart3 className="h-5 w-5" />} onClick={() => showDetails('Ganada')}
            description={'Margen global: ' + formatPercent(dashboard.metrics.margin) + (dashboard.previousMetrics ? ' · ' + commercialChange(dashboard.metrics.wonProfit, dashboard.previousMetrics.wonProfit) + ' vs. anterior' : '')} />
          <MetricCard title="Tasa de cierre" value={formatPercent(dashboard.metrics.closeRate)} icon={<Target className="h-5 w-5" />} onClick={() => showDetails('closed')}
            description={'Ganadas / (ganadas + perdidas)' + (dashboard.previousMetrics ? ' · ' + commercialChange(dashboard.metrics.closeRate, dashboard.previousMetrics.closeRate, true) + ' vs. anterior' : '')} />
          <MetricCard title="Oportunidades abiertas" value={formatCurrency(dashboard.metrics.openSale)} icon={<ClipboardList className="h-5 w-5" />} onClick={() => showDetails('open')}
            description={dashboard.previousMetrics ? commercialChange(dashboard.metrics.openSale, dashboard.previousMetrics.openSale) + ' vs. período anterior' : 'Pendientes de pricing, aprobadas y enviadas'} />
        </div>
        {previousPeriod && <p className="text-xs text-slate-500 dark:text-slate-400">Comparación por fecha de creación: {formatDate(previousPeriod.from)} al {formatDate(previousPeriod.to)}, con igual número de días. Se usa el estado actual en ambos períodos.</p>}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Creadas', count: filteredQuotations.length, filter: 'all' },
            { label: 'En espera del cliente', count: dashboard.sentQuotes, filter: 'Enviada al Cliente' },
            { label: 'Ganadas', count: dashboard.wonQuotes, filter: 'Ganada' },
            { label: 'Perdidas', count: dashboard.lostQuotes, filter: 'Perdida' },
          ].map((item) => <button key={item.filter} onClick={() => showDetails(item.filter)} className={secondaryButtonClass}>{item.label}: <strong>{item.count}</strong></button>)}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto dark:border-slate-700 dark:bg-slate-900">
          <TabsTrigger value="overview" className="dark:text-slate-200 dark:data-[state=active]:bg-slate-700 dark:hover:bg-slate-800">Cotizaciones</TabsTrigger>
          <TabsTrigger value="analysis" className="dark:text-slate-200 dark:data-[state=active]:bg-slate-700 dark:hover:bg-slate-800">Análisis</TabsTrigger>
          <TabsTrigger value="tasks" className="dark:text-slate-200 dark:data-[state=active]:bg-slate-700 dark:hover:bg-slate-800">Mis tareas</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div id="quotation-detail" tabIndex={-1} className="scroll-mt-6 rounded-2xl focus-visible:outline-2 focus-visible:outline-blue-500">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">{detailQuotes.length} resultados{clientFilter ? ' · ' + (dashboard.topClients.find((row) => row.clientKey === clientFilter)?.clientName || 'Cliente seleccionado') : ''}{sellerFilter ? ' · ' + (dashboard.sellerBreakdown.find((row) => row.sellerKey === sellerFilter)?.sellerName || 'Vendedor seleccionado') : ''}</p>
              <label className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto">Ver
                <select className={fieldClass + ' min-w-0'} value={detailFilter} onChange={(event) => showDetails(event.target.value)}>
                  <option value="all">Todas las del período</option><option value="open">Oportunidades abiertas</option><option value="closed">Cerradas</option>
                  {trackedStatuses.map((status) => <option key={status}>{status}</option>)}
                  <option value="pricing">Pricing · todos los períodos</option><option value="followup">Respuestas · todos los períodos</option><option value="expiring">Vencimientos · todos los períodos</option>
                </select>
              </label>
              {(detailFilter !== 'all' || clientFilter || sellerFilter) && <button className={secondaryButtonClass} onClick={() => showDetails('all')}>Limpiar selección</button>}
            </div>
            <LatestQuotesTable key={[detailFilter, clientFilter, sellerFilter, dateFrom, dateTo].join('|')} quotes={detailQuotes} totalsByQuote={dashboard.totalsByQuote} title={detailLabels[detailFilter] || detailFilter} quoteHref={quoteHref} showExpiry={detailFilter === 'expiring'} />
          </div>
        </TabsContent>
        <TabsContent value="analysis" className="grid gap-6 xl:grid-cols-2">
          <StatusTable rows={dashboard.statusRows} total={filteredQuotations.length} onSelect={showDetails} />
          <TopClientsTable rows={dashboard.topClients} onSelect={(name) => showDetails('Ganada', name)} />
          {!isSales && <TopSellersTable rows={dashboard.topSellers} onSelect={(name) => showDetails('Ganada', '', name)} />}
          {!isSales && <SellerBreakdownTable rows={dashboard.sellerBreakdown} onSelect={(name) => showDetails('all', '', name)} />}
        </TabsContent>
        <TabsContent value="tasks" id="dashboard-tasks" tabIndex={-1}>
          {tasksOwner !== userId ? <p role="status">Cargando tareas…</p> : tasksError ? <Panel title="Tareas no disponibles"><button className={secondaryButtonClass} onClick={loadTasks}>Reintentar</button></Panel> :
            <TasksPanel view={taskView} onViewChange={setTaskView} tasks={tasks} taskTitle={taskTitle} taskPriority={taskPriority} taskDueDate={taskDueDate} loadingTasks={loadingTasks} setTaskTitle={setTaskTitle} setTaskPriority={setTaskPriority} setTaskDueDate={setTaskDueDate} createTask={createTask} toggleTask={toggleTask} deleteTask={deleteTask} />}
        </TabsContent>
      </Tabs>
      </>}
    </div>
  )
}

function Header({
  subtitle,
  onNewQuote,
  actionLabel = 'Nueva cotización',
}: {
  subtitle: string
  onNewQuote: () => void
  actionLabel?: string
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
          {actionLabel}
        </button>
        <Link href="/historico" className={secondaryButtonClass}>
          Histórico
        </Link>
      </div>
    </div>
  )
}

function MetricCard({ title, value, icon, description, onClick }: {
  title: string; value: number | string; icon: React.ReactNode; description: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700/60 dark:bg-[#0b1220] dark:hover:border-blue-400">
      <div className="flex items-start justify-between gap-3"><span className="text-sm text-slate-500 dark:text-slate-400">{title}</span><span className="text-blue-600 dark:text-blue-400">{icon}</span></div>
      <p className="mt-3 break-words text-xl font-bold tabular-nums text-slate-900 dark:text-white 2xl:text-2xl">{value}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">Ver cotizaciones <ArrowUpRight className="h-3 w-3" /></span>
    </button>
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
  title,
  quoteHref,
  showExpiry,
}: {
  quotes: QuotationRow[]
  totalsByQuote: Record<string, QuoteTotals>
  title: string
  quoteHref: (quote: QuotationRow) => string
  showExpiry: boolean
}) {
  const [page, setPage] = useState(0)
  const pageSize = 10
  const pages = Math.max(1, Math.ceil(quotes.length / pageSize))
  const currentPage = Math.min(page, pages - 1)
  return (
    <Panel title={title} description="Abre una cotización para consultar su detalle y continuar el seguimiento.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-3 pr-4">Número</th>
              <th className="pr-4">Cliente</th>
              <th className="pr-4">Estado</th>
              <th className="pr-4 text-right">Venta cotizada</th>
              <th className="pr-4 text-right">Utilidad</th>
              <th className="pr-4">Vendedor</th>
              <th className="pr-4">{showExpiry ? 'Vigencia de tarifa' : 'Creada / antigüedad'}</th>
              <th className="relative"><span className="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 ? (
              <EmptyTable colSpan={8} />
            ) : (
              quotes.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((quote) => {
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
                        className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          quote.status
                        )}`}
                      >
                        {quote.status || 'N/A'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {formatCurrency(totals?.sale || 0)}
                    </td>
                    <td className="whitespace-nowrap pr-4 text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatCurrency(totals?.profit || 0)}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {getSellerName(quote)}
                    </td>
                    <td className="whitespace-nowrap pr-4 text-xs text-slate-500 dark:text-slate-400">
                      {showExpiry ? formatDate(quote.agent_quotes?.find((rate) => rate.is_selected)?.valid_until) : <>
                        {formatDate(quote.created_at)}<span className="mt-1 block">{quote.created_at ? Math.max(0, -(calendarDaysUntil(quote.created_at) ?? 0)) + ' días desde creación' : 'Sin fecha'}</span>
                      </>}
                    </td>
                    <td className="text-right">
                      <Link
                        href={quoteHref(quote)}
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">{quotes.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, quotes.length)} de {quotes.length}</span>
        <div className="flex gap-2">
          <button className={secondaryButtonClass} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <button className={secondaryButtonClass} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
        </div>
      </div>
    </Panel>
  )
}

function TopClientsTable({ rows, onSelect }: { rows: ClientSummary[]; onSelect: (name: string) => void }) {
  return (
    <Panel title="Top clientes por venta ganada">
      <SimpleRankingTable
        columns={['Cliente', 'Venta cotizada', 'Utilidad']}
        onSelect={(row) => onSelect(row.clientKey)}
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

function TopSellersTable({ rows, onSelect }: { rows: SellerSummary[]; onSelect: (name: string) => void }) {
  return (
    <Panel title="Top vendedores">
      <SimpleRankingTable
        columns={['Vendedor', 'Ganadas', 'Venta cotizada', 'Utilidad']}
        onSelect={(row) => onSelect(row.sellerKey)}
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
  onSelect,
}: {
  columns: string[]
  rows: T[]
  renderRow: (row: T) => string[]
  onSelect: (row: T) => void
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
                      {valueIndex === 0 ? <button className="text-left font-semibold text-blue-600 underline-offset-4 hover:underline dark:text-blue-400" onClick={() => onSelect(row)}>{value}</button> : <span className="whitespace-nowrap tabular-nums">{value}</span>}
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

function SellerBreakdownTable({ rows, onSelect }: { rows: SellerBreakdown[]; onSelect: (name: string) => void }) {
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
                    key={row.sellerKey}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">
                      <button className="text-left text-blue-600 hover:underline dark:text-blue-400" onClick={() => onSelect(row.sellerKey)}>{row.sellerName}</button>
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

function StatusTable({
  rows,
  total,
  onSelect,
}: {
  rows: Array<{ status: string; count: number }>
  total: number
  onSelect: (status: string) => void
}) {
  return (
    <Panel title="Cotizaciones por estado" description="Distribución actual de las cotizaciones creadas en el período; incluye borradores.">
      <div className="space-y-3">
        {rows.map((row) => {
          const percentage = total > 0 ? (row.count / total) * 100 : 0

          return (
            <div key={row.status}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <button className="text-left font-medium text-blue-600 hover:underline dark:text-blue-400" onClick={() => onSelect(row.status)}>{row.status}</button>
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
  view,
  onViewChange,
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
  view: TaskView
  onViewChange: (view: TaskView) => void
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
  const visibleTasks = tasks.filter((task) => view === 'completed'
    ? task.status === 'Completada'
    : task.status === 'Pendiente' && (view !== 'overdue' ||
      (task.due_date && (calendarDaysUntil(task.due_date) ?? 0) < 0)))

  return (
    <Panel
      title="Mis tareas"
      description="Pendientes personales del usuario conectado."
    >
      <label className="mb-4 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
        Mostrar
        <select className={fieldClass} value={view} onChange={(event) => onViewChange(event.target.value as TaskView)}>
          <option value="pending">Pendientes</option>
          <option value="overdue">Vencidas</option>
          <option value="completed">Completadas</option>
        </select>
      </label>
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

      <div className="mb-4 grid items-end gap-3 md:grid-cols-[1fr_140px]">
        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">Título
        <input
          aria-label="Título de la tarea"
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.target.value)}
          placeholder="Nueva tarea..."
          className={fieldClass}
        />
        </label>

        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">Prioridad
        <select
          aria-label="Prioridad de la tarea"
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
        </label>

        <label className="space-y-1 text-sm text-slate-700 dark:text-slate-200">Vencimiento
        <input
          type="date"
          aria-label="Fecha de vencimiento de la tarea"
          value={taskDueDate}
          onChange={(event) => setTaskDueDate(event.target.value)}
          className={fieldClass}
        />
        </label>

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
        {visibleTasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No hay tareas en esta vista.
          </p>
        ) : (
          visibleTasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
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
                  aria-label={"Eliminar tarea: " + task.title}
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
