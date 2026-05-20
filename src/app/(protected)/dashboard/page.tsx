'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useUser } from '../../../hooks/useUser'

export default function DashboardPage() {
  const { profile } = useUser()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [quotations, setQuotations] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [invoiceItems, setInvoiceItems] = useState<any[]>([])

  useEffect(() => {
    fetchDashboard()
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
      .order('created_at', { ascending: false })

    if (quotesError) {
      alert(quotesError.message)
      return
    }

    const { data: clientsData, error: clientsError } = await supabase
      .from('clientes')
      .select('*')
      .order('created_at', { ascending: false })

    if (clientsError) {
      alert(clientsError.message)
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
        return 'bg-green-100 text-green-700'

      case 'Pendiente de Fijar Precios':
        return 'bg-yellow-100 text-yellow-700'

      case 'Enviada al Cliente':
        return 'bg-blue-100 text-blue-700'

      case 'Solicitud':
        return 'bg-slate-100 text-slate-700'

      default:
        return 'bg-gray-100 text-gray-700'
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
            <h1 className="text-4xl font-bold">
              Dashboard
            </h1>

            <p className="text-gray-500 mt-2">
              Resumen ejecutivo comercial, pricing y financiero.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/quotations/new')}
              className="rounded-xl bg-black px-5 py-3 text-white font-semibold"
            >
              Nueva Cotización
            </button>

            <button
              type="button"
              onClick={() => router.push('/clientes/nuevo')}
              className="rounded-xl border px-5 py-3 font-semibold hover:bg-black hover:text-white"
            >
              Nuevo Cliente
            </button>

            <button
              type="button"
              onClick={() => router.push('/financial-dashboard')}
              className="rounded-xl border px-5 py-3 font-semibold hover:bg-black hover:text-white"
            >
              Finanzas
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Cotizaciones Mes
            </p>
            <p className="text-3xl font-bold">
              {quotesThisMonth.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Ganadas
            </p>
            <p className="text-3xl font-bold text-green-600">
              {wonQuotes.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Pendientes Pricing
            </p>
            <p className="text-3xl font-bold text-yellow-600">
              {pendingPricing.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Clientes Nuevos Mes
            </p>
            <p className="text-3xl font-bold">
              {clientsThisMonth.length}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Profit Esperado
            </p>
            <p className="text-2xl font-bold text-green-600">
              USD {formatCurrency(expectedProfit)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Profit Real
            </p>
            <p
              className={`text-2xl font-bold ${
                realProfit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              USD {formatCurrency(realProfit)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Solo operaciones con costos reales
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Pendientes Validar
            </p>
            <p className="text-2xl font-bold text-orange-600">
              {pendingFinancialValidation.length}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Enviadas al Cliente
            </p>
            <p className="text-2xl font-bold text-blue-600">
              {sentQuotes.length}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Cotizaciones por Estado
            </h2>

            {statusData.length === 0 ? (
              <p className="text-gray-500">
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
                      label
                    >
                      {statusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>

                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Profit Esperado vs Profit Real
            </h2>

            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={currencyTooltipFormatter} />
                  <Legend />

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

            <p className="mt-2 text-xs text-gray-400">
              Valores en USD
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Cotizaciones por Mes
            </h2>

            {monthlyQuotesData.length === 0 ? (
              <p className="text-gray-500">
                No hay datos para mostrar.
              </p>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyQuotesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />

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
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Últimas Cotizaciones
            </h2>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">No.</th>
                    <th className="p-3 text-left">Cliente</th>
                    <th className="p-3 text-left">Estado</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {latestQuotes.map((quote) => (
                    <tr key={quote.id} className="border-b hover:bg-slate-50">
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
                          className="rounded-xl border px-3 py-2 font-semibold hover:bg-black hover:text-white"
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

          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Pendientes de Pricing
            </h2>

            {pendingPricing.length === 0 ? (
              <p className="text-gray-500">
                No hay cotizaciones pendientes de pricing.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingPricing.slice(0, 6).map((quote) => (
                  <div
                    key={quote.id}
                    className="flex items-center justify-between rounded-xl border p-3"
                  >
                    <div>
                      <p className="font-semibold">
                        {quote.quotation_number || 'Sin número'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {quote.clientes?.nombre || 'Sin cliente'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/pricing-comparison?quoteId=${quote.id}`)
                      }
                      className="rounded-xl border px-3 py-2 font-semibold hover:bg-black hover:text-white"
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
