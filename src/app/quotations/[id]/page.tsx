'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'
import {
  PDFDownloadLink,
  pdf,
} from '@react-pdf/renderer'

import QuotationPDF from '../../../components/pdf/quotation-pdf'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../components/ui/tabs'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'

import { Badge } from '../../../components/ui/badge'

export default function QuotationDetailPage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()

  const [quotation, setQuotation] = useState<any>(null)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)

  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])
  const [validations, setValidations] = useState<any[]>([])
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [changeLogs, setChangeLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchData(params.id as string)
      fetchChangeLogs()
    }
  }, [params.id])

  const fetchData = async (id: string) => {
    const { data: quoteData } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (*),
        profiles:created_by (
          nombre,
          apellido
        )
      `)
      .eq('id', id)
      .single()

    const { data: agentData } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })

    const { data: validationData } = await supabase
      .from('cost_validations')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })

    const { data: statusHistoryData } = await supabase
      .from('quotation_status_history')
      .select(`
        *,
        profiles:changed_by (
          nombre,
          apellido
        )
      `)
      .eq('quotation_id', id)
      .order('created_at', { ascending: false })

    const { data: pricingItemsData } = await supabase
      .from('pricing_items')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: true })

    const { data: quotationContainersData } = await supabase
      .from('quotation_containers')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: true })

    setQuotation(quoteData)
    setPricingItems(pricingItemsData || [])
    setQuotationContainers(quotationContainersData || [])
    const { data: selectedPricing } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', id)
      .eq('selected', true)
      .single()

    setSelectedAgent(selectedPricing)
    setAgentQuotes(agentData || [])
    setValidations(validationData || [])
    setStatusHistory(statusHistoryData || [])
    setLoading(false)
  }

  const fetchChangeLogs = async () => {
    const { data, error } = await supabase
      .from('quotation_change_logs')
      .select(`
        *,
        profiles (
          nombre,
          apellido
        )
      `)
      .eq('quotation_id', params.id)
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      return
    }

    setChangeLogs(data || [])
  }

  const handlePrintQuotation = async () => {
    const blob = await pdf(
      <QuotationPDF
        quotation={quotation}
        selectedAgent={selectedAgent}
        pricingItems={pricingItems}
        quotationContainers={quotationContainers}
      />
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  if (loading) {
    return <p className="p-8">Cargando detalle...</p>
  }

  if (!quotation) {
    return <p className="p-8">Cotización no encontrada.</p>
  }

  const formatCurrency = (value: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const pricingTotals = pricingItems.reduce(
  (acc, item) => {
    const qty = Number(item.quantity || 1)
    const sale = Number(item.sale_amount || 0)
    const cost = Number(item.cost_amount || 0)

    const subtotal = qty * sale
    const costTotal = qty * cost
    const tax = item.taxable ? subtotal * 0.15 : 0
    const total = subtotal + tax
    const profit = subtotal - costTotal

    acc.subtotal += subtotal
    acc.tax += tax
    acc.total += total
    acc.cost += costTotal
    acc.profit += profit

    return acc
  },
  { subtotal: 0, tax: 0, total: 0, cost: 0, profit: 0 }
)

const gpPercent =
  pricingTotals.subtotal > 0
    ? (pricingTotals.profit / pricingTotals.subtotal) * 100
    : 0

  return (
  <AppLayout role={profile?.rol || 'Ventas'}>
    <div className="space-y-6 !font-sans [&_*]:!font-sans">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 !font-sans">
            {quotation.quotation_number || 'Sin número'}
          </h1>

          <p className="text-gray-500 mt-2">
            Detalle de Cotización
          </p>
        </div>

        <div className="flex items-center gap-3">
          <PDFDownloadLink
            document={
              <QuotationPDF
                quotation={quotation}
                selectedAgent={selectedAgent}
                pricingItems={pricingItems}
                quotationContainers={quotationContainers}
              />
            }
            fileName={`${quotation?.quotation_number || 'cotizacion'}.pdf`}
            className="h-14 px-6 rounded-xl bg-black text-white hover:bg-gray-900 transition font-semibold shadow-sm flex items-center justify-center"
          >
            {({ loading }) =>
              loading ? 'Generando PDF...' : 'Descargar PDF'
            }
          </PDFDownloadLink>

          <button
            onClick={handlePrintQuotation}
            className="h-14 px-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition font-semibold shadow-sm flex items-center justify-center"
          >
            🖨️ Imprimir Cotización
          </button>

          <button
            onClick={() => router.push(`/pricing-comparison?quoteId=${quotation.id}`)}
            className="rounded-xl bg-black text-white px-6 py-3 font-semibold"
          >
            Trabajar Pricing
          </button>

          <Link
            href={`/quotations/${quotation.id}/edit`}
            className="h-14 px-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition font-semibold shadow-sm flex items-center justify-center"
          >
            Editar Qt.
          </Link>
        </div>
      </div>

      <Tabs defaultValue="resumen" className="space-y-6">
  <TabsList className="bg-white border rounded-xl p-1">
    <TabsTrigger value="resumen">Resumen</TabsTrigger>
    <TabsTrigger value="tarifas">Tarifas</TabsTrigger>
    <TabsTrigger value="validaciones">Validaciones</TabsTrigger>
    <TabsTrigger value="historial">Historial</TabsTrigger>
  </TabsList>

  <TabsContent value="resumen">
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Venta Total</p>
                <p className="text-2xl font-bold text-red-700 !font-sans">
                  USD {formatCurrency(pricingTotals.total)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Incluye ISV
                </p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Costo Total</p>
                <p className="text-2xl font-bold !font-sans">
                  USD {formatCurrency(pricingTotals.cost)}
                </p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Profit</p>
                <p className="text-2xl font-bold text-green-700 !font-sans">
                  USD {formatCurrency(pricingTotals.profit)}
                </p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">GP%</p>
                <p className="text-2xl font-bold !font-sans">
                  {gpPercent.toFixed(2)}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Sobre venta sin ISV
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Información General
                </CardTitle>
              </CardHeader>

              <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <p className="font-semibold text-slate-900">
                    <Badge>{quotation.status || 'Sin estado'}</Badge>
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.clientes
                      ? `${quotation.clientes.codigo_cliente} — ${quotation.clientes.nombre}`
                      : 'Sin cliente'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Teléfono</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.clientes?.telefono || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.clientes?.email_1 || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Ubicación</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.clientes
                      ? `${quotation.clientes.ciudad || 'N/A'}, ${quotation.clientes.pais || 'N/A'}`
                      : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Condición</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.clientes?.condicion_pago || 'N/A'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Detalles del Embarque
                </CardTitle>
              </CardHeader>

              <CardContent className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Tipo</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.quote_type || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Incoterm</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.incoterm || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Transporte</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.tipo_transporte || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Origen</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.origen || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Destino</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.destino || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Puerto Origen</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.puerto_origen || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Puerto Destino</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.puerto_destino || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Contenedor</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.container_type || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Peso</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.peso_kg || 'N/A'} KG
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">CBM</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.volumen_cbm || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Bultos</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.cantidad_bultos || 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Mercancía</p>
                  <p className="font-semibold text-slate-900">
                    {quotation.commodity || 'N/A'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Observaciones
                </CardTitle>
              </CardHeader>

              <CardContent>
                <p>{quotation.observaciones || 'Sin observaciones'}</p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Historial de Cambios</CardTitle>
              </CardHeader>

              <CardContent>
                {changeLogs.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No hay cambios registrados.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {changeLogs.map((log) => (
                      <div
                        key={log.id}
                        className="border rounded-xl p-3"
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <p className="font-semibold text-sm">
                              {log.change_type}
                            </p>

                            <p className="text-sm text-gray-600 mt-1">
                              {log.reason}
                            </p>

                            <p className="text-xs text-gray-400 mt-2">
                              Por:{' '}
                              {log.profiles
                                ? `${log.profiles.nombre} ${log.profiles.apellido}`
                                : 'Usuario'}
                            </p>
                          </div>

                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tarifas">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">
                Tarifas de Agentes
              </CardTitle>
            </CardHeader>

            <CardContent>
              {agentQuotes.length === 0 ? (
                <p className="text-gray-500">
                  No hay tarifas registradas.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-white">
                    <tr>
                      <th className="p-3">Agente</th>
                      <th className="p-3">Costo</th>
                      <th className="p-3">Moneda</th>
                      <th className="p-3">Tránsito</th>
                      <th className="p-3">Seleccionada</th>
                    </tr>
                  </thead>

                  <tbody>
                    {agentQuotes.map((agent) => (
                      <tr key={agent.id} className="border-b">
                        <td className="p-3">{agent.agente_nombre}</td>
                        <td className="p-3">{agent.costo}</td>
                        <td className="p-3">{agent.moneda}</td>
                        <td className="p-3">{agent.transit_time}</td>
                        <td className="p-3">
                          {agent.is_selected ? (
                            <Badge className="bg-green-600 text-white">Sí</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validaciones">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">
                Validaciones de Costos
              </CardTitle>
            </CardHeader>

            <CardContent>
              {validations.length === 0 ? (
                <p className="text-gray-500">
                  No hay validaciones registradas.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-white">
                    <tr>
                      <th className="p-3">Cotizado</th>
                      <th className="p-3">Facturado</th>
                      <th className="p-3">Diferencia</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3">Observaciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    {validations.map((validation) => (
                      <tr key={validation.id} className="border-b">
                        <td className="p-3">{validation.quoted_cost}</td>
                        <td className="p-3">{validation.invoiced_cost}</td>
                        <td className="p-3">{validation.difference}</td>
                        <td className="p-3">{validation.status}</td>
                        <td className="p-3">{validation.observations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-slate-900">
                Historial de Estados
              </CardTitle>
            </CardHeader>

            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-gray-500">
                  No hay cambios de estado registrados.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-zinc-950 text-white">
                    <tr>
                      <th className="p-3">Estado Anterior</th>
                      <th className="p-3">Nuevo Estado</th>
                      <th className="p-3">Usuario</th>
                      <th className="p-3">Fecha</th>
                    </tr>
                  </thead>

                  <tbody>
                    {statusHistory.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="p-3">
                          {item.old_status || 'Sin estado'}
                        </td>

                        <td className="p-3">
                          {item.new_status}
                        </td>

                        <td className="p-3">
                          {item.profiles
                            ? `${item.profiles.nombre} ${item.profiles.apellido}`
                            : 'Usuario no registrado'}
                        </td>

                        <td className="p-3">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </AppLayout>
)
}
