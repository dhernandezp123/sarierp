'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'

export default function FinancialDashboardPage() {
  const { profile, loading: userLoading } = useUser()
  const router = useRouter()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isSales = role === 'Ventas'
  const isPricing = role === 'Pricing'
  const isFinance = role === 'Finanzas' || role === 'Contabilidad'

  const canEditPricing =
    isAdmin || isPricing
  const canEditCostValidation =
    isAdmin || isFinance
  const canEditFinance =
    isAdmin || isFinance
  const canEditQuotes =
    isAdmin || isSales
  const canViewFinancialDashboard =
    isAdmin || isFinance

  const [loading, setLoading] = useState(true)

  const [kpis, setKpis] = useState({
    expectedProfit: 0,
    realProfit: 0,
    totalVariance: 0,
    averageVariance: 0,
    pendingValidations: 0,
    lossQuotations: 0,
  })

  const [topLosses, setTopLosses] = useState<any[]>([])
  const [topClientsByProfit, setTopClientsByProfit] = useState<any[]>([])
  const [topNegativeVariances, setTopNegativeVariances] = useState<any[]>([])

  useEffect(() => {
    if (userLoading) return

    if (!canViewFinancialDashboard) {
      setLoading(false)
      return
    }

    fetchDashboard()
  }, [userLoading, canViewFinancialDashboard])

  const AccessDenied = () => (
    <>
      <div className="rounded-2xl border bg-white p-8">
        <h1 className="text-2xl font-bold">
          Acceso restringido
        </h1>

        <p className="text-gray-500 mt-2">
          No tienes permiso para ver este módulo.
        </p>
      </div>
    </>
  )

  const fetchDashboard = async () => {
    const { data: quotations, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          nombre
        )
      `)
      .eq('status', 'Ganada')
      .is('deleted_at', null)

    if (error) {
      alert(error.message)
      return
    }

    const quotationIds = quotations.map((q) => q.id)

    const { data: pricingItems } = await supabase
      .from('pricing_items')
      .select('*')
      .in('quotation_id', quotationIds)

    const { data: invoiceItems } = await supabase
      .from('provider_invoice_items')
      .select('*')
      .in('quotation_id', quotationIds)

    let expectedProfit = 0
    let realProfit = 0
    let totalVariance = 0

    const losses: any[] = []
    const profitByClientMap: any = {}
    const varianceByConceptMap: any = {}

    const normalizeDescription = (value: string) =>
      value
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')

    quotations.forEach((quote) => {
      const quotePricing = pricingItems?.filter(
        (p) => p.quotation_id === quote.id
      ) || []

      const quoteInvoices = invoiceItems?.filter(
        (i) => i.quotation_id === quote.id
      ) || []

      const quotedCost = quotePricing.reduce(
        (sum, item) =>
          sum +
          Number(item.cost_amount || 0) *
            Number(item.quantity || 1),
        0
      )

      const quotedSale = quotePricing.reduce(
        (sum, item) =>
          sum +
          Number(item.sale_amount || 0) *
            Number(item.quantity || 1),
        0
      )

      const realCost = quoteInvoices.reduce(
        (sum, item) =>
          sum +
          Number(item.total_cost || 0) +
          Number(item.tax_amount || 0),
        0
      )

      const quoteExpectedProfit =
        quotedSale - quotedCost

      const quoteRealProfit =
        quotedSale - realCost

      const variance =
        realCost - quotedCost

      expectedProfit += quoteExpectedProfit
      realProfit += quoteRealProfit
      totalVariance += variance

      const clientName = quote.clientes?.nombre || 'Sin cliente'

      if (!profitByClientMap[clientName]) {
        profitByClientMap[clientName] = {
          cliente: clientName,
          profit: 0,
        }
      }

      if (quoteInvoices.length > 0) {
        profitByClientMap[clientName].profit += quoteRealProfit
      }

      quotePricing.forEach((item) => {
        const concept = item.description || 'Sin descripción'
        const key = normalizeDescription(concept)
        const total =
          Number(item.cost_amount || 0) * Number(item.quantity || 1)

        if (!varianceByConceptMap[key]) {
          varianceByConceptMap[key] = {
            concepto: concept,
            cotizado: 0,
            real: 0,
          }
        }

        varianceByConceptMap[key].cotizado += total
      })

      quoteInvoices.forEach((item) => {
        const concept = item.description || 'Sin descripción'
        const key = normalizeDescription(concept)
        const total =
          Number(item.total_cost || 0) + Number(item.tax_amount || 0)

        if (!varianceByConceptMap[key]) {
          varianceByConceptMap[key] = {
            concepto: concept,
            cotizado: 0,
            real: 0,
          }
        }

        varianceByConceptMap[key].real += total
      })

      if (quoteRealProfit < 0) {
        losses.push({
          quotation: quote.quotation_number,
          client: quote.clientes?.nombre || 'Sin cliente',
          realProfit: quoteRealProfit,
          variance,
        })
      }
    })

    losses.sort(
      (a, b) => a.realProfit - b.realProfit
    )

    const pendingValidations =
      quotations.filter(
        (q) =>
          q.financial_validation_status !==
          'Validado'
      ).length

    const averageVariance =
      quotations.length > 0
        ? totalVariance / quotations.length
        : 0

    setKpis({
      expectedProfit,
      realProfit,
      totalVariance,
      averageVariance,
      pendingValidations,
      lossQuotations: losses.length,
    })

    setTopLosses(losses.slice(0, 10))
    setTopClientsByProfit(
      Object.values(profitByClientMap)
        .sort((a: any, b: any) => b.profit - a.profit)
        .slice(0, 5)
    )
    setTopNegativeVariances(
      Object.values(varianceByConceptMap)
        .map((item: any) => ({
          concepto: item.concepto,
          variacion: item.cotizado - item.real,
        }))
        .filter((item: any) => item.variacion < 0)
        .sort((a: any, b: any) => a.variacion - b.variacion)
        .slice(0, 5)
    )

    setLoading(false)
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const currencyTooltipFormatter = (value: any) => {
    return `USD ${formatCurrency(Number(value || 0))}`
  }

  if (userLoading || loading) {
    return (
      <div className="p-8">
        Cargando dashboard financiero...
      </div>
    )
  }

  if (!canViewFinancialDashboard) {
    return <AccessDenied />
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
          <h1 className="text-4xl font-bold">
            Dashboard Financiero
          </h1>

          <p className="text-gray-500 mt-2">
            Análisis financiero consolidado de operaciones ganadas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Profit Esperado
            </p>

            <p className="text-2xl font-bold text-green-600">
              USD {formatCurrency(kpis.expectedProfit)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Profit Real
            </p>

            <p className="text-2xl font-bold text-green-600">
              USD {formatCurrency(kpis.realProfit)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Variación Total
            </p>

            <p className="text-2xl font-bold text-red-600">
              USD {formatCurrency(kpis.totalVariance)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Variación Promedio
            </p>

            <p className="text-2xl font-bold">
              USD {formatCurrency(kpis.averageVariance)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Pendientes Validar
            </p>

            <p className="text-2xl font-bold text-yellow-600">
              {kpis.pendingValidations}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">
              Operaciones Pérdida
            </p>

            <p className="text-2xl font-bold text-red-600">
              {kpis.lossQuotations}
            </p>
          </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/cost-validation')}
            className="rounded-xl border px-5 py-3 font-semibold hover:bg-slate-900 hover:text-white"
          >
            Ir a Validación de Costos
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Top Clientes por Profit Real
            </h2>

            {topClientsByProfit.length === 0 ? (
              <p className="text-gray-500">
                No hay datos de profit real por cliente todavía.
              </p>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClientsByProfit}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="cliente" />
                    <YAxis />
                    <Tooltip formatter={currencyTooltipFormatter} />
                    <Bar dataKey="profit" fill="#16A34A" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Top Conceptos con Variación Negativa
            </h2>

            {topNegativeVariances.length === 0 ? (
              <p className="text-gray-500">
                No hay variaciones negativas detectadas.
              </p>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topNegativeVariances}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="concepto" />
                    <YAxis />
                    <Tooltip formatter={currencyTooltipFormatter} />
                    <Bar dataKey="variacion" fill="#DC2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold mb-4">
            Top Pérdidas Detectadas
          </h2>

          {topLosses.length === 0 ? (
            <p className="text-gray-500">
              No hay operaciones con pérdidas.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">
                      Cotización
                    </th>

                    <th className="p-3 text-left">
                      Cliente
                    </th>

                    <th className="p-3 text-right">
                      Variación
                    </th>

                    <th className="p-3 text-right">
                      Profit Real
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {topLosses.map((loss, index) => (
                    <tr
                      key={index}
                      className="border-b bg-red-50"
                    >
                      <td className="p-3 font-semibold">
                        {loss.quotation}
                      </td>

                      <td className="p-3">
                        {loss.client}
                      </td>

                      <td className="p-3 text-right text-red-600 font-semibold">
                        USD {formatCurrency(loss.variance)}
                      </td>

                      <td className="p-3 text-right text-red-600 font-bold">
                        USD {formatCurrency(loss.realProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
