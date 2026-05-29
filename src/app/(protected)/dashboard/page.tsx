'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts'

import { supabase } from '../../../lib/supabase/client'
import {
  fieldClass,
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'

type UserTask = {
  id: string
  title: string
  notes: string | null
  status: 'Pendiente' | 'Completada'
  priority: 'Baja' | 'Media' | 'Alta'
  due_date: string | null
}

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [quotations, setQuotations] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [invoiceItems, setInvoiceItems] = useState<any[]>([])
  const [tasks, setTasks] = useState<UserTask[]>([])
  const [taskTitle, setTaskTitle] = useState('')
  const [taskPriority, setTaskPriority] =
    useState<'Baja' | 'Media' | 'Alta'>('Media')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [loadingTasks, setLoadingTasks] = useState(false)

  useEffect(() => {
    fetchDashboard()
    loadTasks()
  }, [])

  const fetchDashboard = async () => {
    const { data: quotesData, error: quotesError } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          nombre
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (quotesError) {
      toast.error(quotesError.message)
      return
    }

    const { data: clientsData, error: clientsError } = await supabase
      .from('clientes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (clientsError) {
      toast.error(clientsError.message)
      return
    }

    const quoteIds = quotesData?.map((q) => q.id) || []

    let pricingData: any[] = []
    let invoiceData: any[] = []

    if (quoteIds.length > 0) {
      const { data: pricingResult } = await supabase
        .from('pricing_items')
        .select('*')
        .in('quotation_id', quoteIds)

      pricingData = pricingResult || []

      const { data: invoiceResult } = await supabase
        .from('provider_invoice_items')
        .select('*')
        .in('quotation_id', quoteIds)

      invoiceData = invoiceResult || []
    }

    setQuotations(quotesData || [])
    setClientes(clientsData || [])
    setPricingItems(pricingData)
    setInvoiceItems(invoiceData)
    setLoading(false)
  }

  const loadTasks = async () => {
    const { data: userData } = await supabase.auth.getUser()

    if (!userData.user) return

    const { data } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })

    if (data) {
      setTasks(data as UserTask[])
    }
  }

  const createTask = async () => {
    if (!taskTitle.trim()) return

    setLoadingTasks(true)

    const { data: userData } = await supabase.auth.getUser()

    if (!userData.user) {
      setLoadingTasks(false)
      return
    }

    const { error } = await supabase
      .from('user_tasks')
      .insert({
        user_id: userData.user.id,
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
    const nextStatus =
      task.status === 'Pendiente'
        ? 'Completada'
        : 'Pendiente'

    await supabase
      .from('user_tasks')
      .update({
        status: nextStatus,
      })
      .eq('id', task.id)

    loadTasks()
  }

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from('user_tasks')
      .delete()
      .eq('id', taskId)

    if (error) {
      toast.error('No se pudo eliminar la tarea')
      return
    }

    toast.success('Tarea eliminada')

    loadTasks()
  }

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const quotesThisMonth = quotations.filter((q) => {
    const date = q.created_at ? new Date(q.created_at) : null
    return (
      date &&
      date.getMonth() === currentMonth &&
      date.getFullYear() === currentYear
    )
  })

  const clientsThisMonth = clientes.filter((c) => {
    const date = c.created_at ? new Date(c.created_at) : null
    return (
      date &&
      date.getMonth() === currentMonth &&
      date.getFullYear() === currentYear
    )
  })

  const wonQuotes = quotations.filter((q) => q.status === 'Ganada')
  const pendingPricing = quotations.filter(
    (q) => q.status === 'Pendiente de Fijar Precios'
  )
  const sentQuotes = quotations.filter((q) => q.status === 'Enviada al Cliente')
  const draftQuotes = quotations.filter((q) => q.status === 'Borrador')

  const statusData = [
    { name: 'Ganadas', value: wonQuotes.length },
    { name: 'Pendientes Pricing', value: pendingPricing.length },
    { name: 'Enviadas', value: sentQuotes.length },
    { name: 'Borradores', value: draftQuotes.length },
  ].filter((item) => item.value > 0)

  const COLORS = ['#16A34A', '#CA8A04', '#2563EB', '#64748B']

  const quotedCost = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
    0
  )

  const quotedSale = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
    0
  )

  const expectedProfit = quotedSale - quotedCost

  const quoteIdsWithRealCosts = new Set(
    invoiceItems.map((item) => item.quotation_id)
  )

  const pricingItemsWithRealCosts = pricingItems.filter((item) =>
    quoteIdsWithRealCosts.has(item.quotation_id)
  )

  const quotedSaleWithRealCosts = pricingItemsWithRealCosts.reduce(
    (sum, item) =>
      sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
    0
  )

  const realCost = invoiceItems.reduce(
    (sum, item) =>
      sum + Number(item.total_cost || 0) + Number(item.tax_amount || 0),
    0
  )

  const realProfit = quotedSaleWithRealCosts - realCost

  const profitComparisonData = [
    {
      name: 'Profit',
      Esperado: Number(expectedProfit.toFixed(2)),
      Real: Number(realProfit.toFixed(2)),
    },
  ]

  const monthlyQuotesMap = quotations.reduce((acc: any, quote) => {
    if (!quote.created_at) return acc

    const date = new Date(quote.created_at)

    const key = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, '0')}`

    if (!acc[key]) {
      acc[key] = {
        month: key,
        cotizaciones: 0,
        ganadas: 0,
      }
    }

    acc[key].cotizaciones += 1

    if (quote.status === 'Ganada') {
      acc[key].ganadas += 1
    }

    return acc
  }, {})

  const monthlyQuotesData = Object.values(monthlyQuotesMap).sort(
    (a: any, b: any) => a.month.localeCompare(b.month)
  )

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const currencyTooltipFormatter = (value: any) => {
    return `USD ${formatCurrency(Number(value || 0))}`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Ganada':
        return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'

      case 'Pendiente de Fijar Precios':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'

      case 'Enviada al Cliente':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'

      case 'Solicitud':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  const pendingFinancialValidation = wonQuotes.filter(
    (q) => q.financial_validation_status !== 'Validado'
  )

  const latestQuotes = quotations.slice(0, 6)

  if (loading) {
    return <div className="p-8">Cargando dashboard...</div>
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
              Dashboard
            </h1>

            <p className="mt-2 text-slate-500 dark:text-slate-400">
              Resumen ejecutivo comercial, pricing y financiero.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/quotations/new')}
              className={primaryButtonClass}
            >
              Nueva Cotización
            </button>

            <button
              type="button"
              onClick={() => router.push('/clientes/nuevo')}
              className={secondaryButtonClass}
            >
              Nuevo Cliente
            </button>

            <button
              type="button"
              onClick={() => router.push('/financial-dashboard')}
              className={secondaryButtonClass}
            >
              Finanzas
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Cotizaciones Mes
            </p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {quotesThisMonth.length}
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ganadas
            </p>
            <p className="text-3xl font-bold text-green-600">
              {wonQuotes.length}
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pendientes Pricing
            </p>
            <p className="text-3xl font-bold text-yellow-600">
              {pendingPricing.length}
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Clientes Nuevos Mes
            </p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">
              {clientsThisMonth.length}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Profit Esperado
            </p>
            <p className="text-2xl font-bold text-green-600">
              USD {formatCurrency(expectedProfit)}
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Profit Real
            </p>
            <p
              className={`text-2xl font-bold ${
                realProfit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              USD {formatCurrency(realProfit)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Solo operaciones con costos reales
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pendientes Validar
            </p>
            <p className="text-2xl font-bold text-orange-600">
              {pendingFinancialValidation.length}
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Enviadas al Cliente
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {sentQuotes.length}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Cotizaciones por Estado
            </h2>

            {statusData.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">
                No hay datos para mostrar.
              </p>
            ) : (
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={110}
                      label={{ fill: '#64748b' }}
                    >
                      {statusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>

                    <Tooltip />
                    <Legend wrapperStyle={{ color: '#64748b' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Profit Esperado vs Profit Real
            </h2>

            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitComparisonData}>
                  <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b' }} />
                  <YAxis tick={{ fill: '#64748b' }} />
                  <Tooltip formatter={currencyTooltipFormatter} />
                  <Legend wrapperStyle={{ color: '#64748b' }} />

                  <Bar dataKey="Esperado" fill="#16A34A" />
                  <Bar
                    dataKey="Real"
                    fill={
                      realProfit >= expectedProfit
                        ? '#16A34A'
                        : '#DC2626'
                    }
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Valores en USD
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Cotizaciones por Mes
            </h2>

            {monthlyQuotesData.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">
                No hay datos para mostrar.
              </p>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyQuotesData}>
                    <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#64748b' }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ color: '#64748b' }} />

                    <Line
                      type="monotone"
                      dataKey="cotizaciones"
                      stroke="#2563EB"
                      strokeWidth={3}
                    />

                    <Line
                      type="monotone"
                      dataKey="ganadas"
                      stroke="#16A34A"
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className={cardClass}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Mis tareas
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Pendientes personales del usuario conectado.
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-[1fr_140px]">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Nueva tarea..."
                className={fieldClass}
              />

              <select
                value={taskPriority}
                onChange={(e) =>
                  setTaskPriority(e.target.value as 'Baja' | 'Media' | 'Alta')
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
                onChange={(e) => setTaskDueDate(e.target.value)}
                className={fieldClass}
              />

              <button
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
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
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
                        {task.due_date && <span>- Vence: {task.due_date}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleTask(task)}
                        className={`${secondaryButtonClass} rounded-lg px-3 py-2 text-xs`}
                      >
                        {task.status === 'Pendiente' ? 'Completar' : 'Reabrir'}
                      </button>

                      <button
                        onClick={() => deleteTask(task.id)}
                        className="rounded-lg border border-red-300 p-2 text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Últimas Cotizaciones
            </h2>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">No.</th>
                    <th className="p-3 text-left">Cliente</th>
                    <th className="p-3 text-left">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>

                <tbody className="text-slate-900 dark:text-white">
                  {latestQuotes.map((quote) => (
                    <tr key={quote.id} className="border-b border-slate-200 hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-800">
                      <td className="p-3 font-semibold">
                        {quote.quotation_number || 'Sin número'}
                      </td>

                      <td className="p-3">
                        {quote.clientes?.nombre || 'Sin cliente'}
                      </td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadge(
                            quote.status
                          )}`}
                        >
                          {quote.status}
                        </span>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/quotations/${quote.id}`)
                          }
                          className={secondaryButtonClass}
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
              Pendientes de Pricing
            </h2>

            {pendingPricing.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">
                No hay cotizaciones pendientes de pricing.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingPricing.slice(0, 6).map((quote) => (
                  <div
                    key={quote.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 p-3 dark:border-slate-700/60"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {quote.quotation_number || 'Sin número'}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {quote.clientes?.nombre || 'Sin cliente'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/pricing-comparison?quoteId=${quote.id}`)
                      }
                      className={secondaryButtonClass}
                    >
                      Trabajar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </div>
  )
}
