'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import {
  PDFDownloadLink,
  pdf,
} from '@react-pdf/renderer'

import QuotationPDF from '../../../../components/pdf/quotation-pdf'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../../../components/ui/tabs'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card'

import { Badge } from '../../../../components/ui/badge'

const statusOptions = [
  'Borrador',
  'Pendiente de Fijar Precios',
  'Enviada al Cliente',
  'En Negociación',
  'Ganada',
  'Perdida',
  'Tarifa Alta',
  'Enviada tarde',
  'No tenemos agente',
]

export default function QuotationDetailPage() {
  const { profile } = useUser()
  const params = useParams()
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

  const [quotation, setQuotation] = useState<any>(null)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)

  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])
  const [validations, setValidations] = useState<any[]>([])
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [changeLogs, setChangeLogs] = useState<any[]>([])
  const [activityLogs, setActivityLogs] = useState<any[]>([])
  const [openStatusMenu, setOpenStatusMenu] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchData(params.id as string)
      fetchStatusHistory()
      fetchChangeLogs()
      fetchActivityLogs(params.id as string)
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
    setLoading(false)
  }

  const fetchStatusHistory = async () => {
    const { data, error } = await supabase
      .from('quotation_status_history')
      .select(`
        *,
        profiles (
          nombre,
          apellido
        )
      `)
      .eq('quotation_id', params.id)
      .order('created_at', { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setStatusHistory(data || [])
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

  const fetchActivityLogs = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
        *,
        user:profiles!activity_logs_user_id_fkey (
          nombre,
          apellido
        )
      `)
      .eq('entity_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error.message)
      return
    }

    setActivityLogs(data || [])
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!quotation) return

    const oldStatus = quotation.status || 'Sin estado'

    const { error } = await supabase
      .from('quotations')
      .update({ status: newStatus })
      .eq('id', quotation.id)

    if (error) {
      toast.error(error.message)
      return
    }

    await supabase.from('quotation_status_history').insert([
      {
        quotation_id: quotation.id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: profile?.id,
      },
    ])

    await createActivityLog({
      module: 'quotations',
      action: 'status_changed',
      entityType: 'quotation',
      entityId: quotation.id,
      description: `Estado actualizado de ${oldStatus} a ${newStatus}`,
      metadata: {
        oldStatus,
        newStatus,
      },
    })

    toast.success('Estado actualizado')

    setQuotation({
      ...quotation,
      status: newStatus,
    })

    await fetchStatusHistory()
    await fetchActivityLogs(quotation.id)
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

const isLooseCargo = ['LCL', 'LTL', 'Consolidado', 'Courier'].includes(
  quotation?.quote_type || ''
)

const clientTaxId =
  quotation?.clientes?.rtn ||
  quotation?.clientes?.nit ||
  quotation?.clientes?.ruc ||
  'N/A'

const paymentTerms =
  quotation?.clientes?.condicion_pago ||
  quotation?.clientes?.payment_terms ||
  'Contado'

const originPort =
  quotation?.origin_port ||
  quotation?.puerto_origen ||
  'N/A'

const destinationPort =
  quotation?.destination_port ||
  quotation?.puerto_destino ||
  'N/A'

const quotationTimeline = [
  ...statusHistory.map((log) => ({
    id: `status-${log.id}`,
    type: 'Cambio de estado',
    title: `${log.old_status || 'Sin estado'} a ${log.new_status}`,
    description: 'Cambio de estado de la cotización.',
    user: log.profiles
      ? `${log.profiles.nombre} ${log.profiles.apellido}`
      : 'Usuario',
    date: log.created_at,
  })),

  ...changeLogs.map((log) => ({
    id: `change-${log.id}`,
    type: 'Cambio registrado',
    title: log.change_type,
    description:
      log.reason ||
      `${log.field_name || 'Campo'} actualizado`,
    user: log.profiles
      ? `${log.profiles.nombre} ${log.profiles.apellido}`
      : 'Usuario',
    date: log.created_at,
  })),
]
  .filter((event) => event.date)
  .sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
  )

const getActivityTone = (activity: any) => {
  const text = `${activity.action || ''} ${activity.description || ''}`.toLowerCase()

  if (text.includes('perdida')) return 'bg-red-500'
  if (text.includes('ganada')) return 'bg-green-500'
  if (text.includes('costo') || text.includes('cost')) return 'bg-emerald-500'
  if (text.includes('cliente')) return 'bg-blue-500'
  if (text.includes('pricing')) return 'bg-amber-500'
  if (text.includes('cread')) return 'bg-slate-500'

  return 'bg-slate-400'
}

const getActivityLabel = (activity: any) => {
  if (activity.description) return activity.description

  const labels: Record<string, string> = {
    create: 'Cotización creada',
    created: 'Cotización creada',
    send_to_pricing: 'Enviada a Pricing',
    resend_to_pricing: 'Enviada nuevamente a Pricing',
    pricing_approved: 'Pricing aprobado',
    sent_to_client: 'Enviada al cliente',
    won: 'Ganada',
    lost: 'Perdida',
  }

  return labels[activity.action] || activity.action || 'Actividad registrada'
}

const getActivityUser = (activity: any) => {
  if (activity.user) {
    return `${activity.user.nombre || ''} ${activity.user.apellido || ''}`.trim()
  }

  return 'Sistema'
}

const formatActivityDate = (date?: string) => {
  if (!date) return 'Sin fecha'

  return new Date(date).toLocaleString('es-HN', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

  return (
  <>
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenStatusMenu(!openStatusMenu)}
              className="inline-flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0b1220] dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <span>{quotation?.status || 'Sin estado'}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {openStatusMenu && (
              <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#0b1220]">
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={async () => {
                      await handleStatusChange(status)
                      setOpenStatusMenu(false)
                    }}
                    className="block w-full px-4 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>

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
            className="h-14 px-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition font-semibold shadow-sm flex items-center justify-center gap-2"
          >
            <Printer className="h-4 w-4" />
            <span>Imprimir Cotización</span>
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

          {changeLogs.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 mb-6">
              <p className="font-semibold">
                Esta cotización tiene {changeLogs.length} cambio
                {changeLogs.length === 1 ? '' : 's'} registrado
                {changeLogs.length === 1 ? '' : 's'} después de ser enviada/aprobada.
              </p>

              <p className="text-sm mt-1">
                Revisa el Historial de Cambios para validar los motivos.
              </p>
            </div>
          )}

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
                      ? `${quotation.clientes.codigo_cliente} - ${quotation.clientes.nombre}`
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
                    {paymentTerms}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">
                    RTN / NIT
                  </p>

                  <p className="font-medium">
                    {clientTaxId}
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
                    {originPort}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Puerto Destino</p>
                  <p className="font-semibold text-slate-900">
                    {destinationPort}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">
                    Contenedores / Unidades
                  </p>

                  {quotationContainers.length > 0 ? (
                    <div className="font-medium space-y-1">
                      {quotationContainers.map((container) => (
                        <p key={container.id}>
                          - {container.quantity} x {container.container_type || container.container_type_name}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="font-medium">
                      {quotation.container_type || 'N/A'}
                    </p>
                  )}
                </div>

                {isLooseCargo && (
                  <>
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
                  </>
                )}

                <div>
                  <p className="text-xs text-slate-500">
                    Commodity / Descripción de la carga
                  </p>
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
                <p>
                  {quotation?.pricing_notes ||
                    quotation?.observaciones ||
                    'Sin observaciones'}
                </p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Historial de la Cotización</CardTitle>
              </CardHeader>

              <CardContent>
                {quotationTimeline.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No hay movimientos registrados.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {quotationTimeline.map((event, index) => (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-3 w-3 rounded-full mt-1 ${
                              event.type === 'Cambio de estado'
                                ? 'bg-blue-600'
                                : 'bg-amber-500'
                            }`}
                          />

                          {index !== quotationTimeline.length - 1 && (
                            <div className="w-px flex-1 bg-slate-300 min-h-[40px]" />
                          )}
                        </div>

                        <div className="flex-1 rounded-xl border p-3">
                          <div className="flex justify-between gap-4">
                            <div>
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                  event.type === 'Cambio de estado'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {event.type}
                              </span>

                              <p className="mt-2 text-sm font-semibold">
                                {event.title}
                              </p>

                              <p className="mt-1 text-sm text-gray-600">
                                {event.description}
                              </p>

                              <p className="mt-2 text-xs text-gray-400">
                                Por: {event.user}
                              </p>
                            </div>

                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              {new Date(event.date).toLocaleString()}
                            </p>
                          </div>
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700/60 dark:bg-[#0b1220]">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Actividad
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Secuencia operativa registrada para esta cotización.
              </p>
            </div>

            {activityLogs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No hay actividad registrada.
              </p>
            ) : (
              <div className="relative space-y-5">
                <div className="absolute left-[11px] top-0 h-full w-px bg-slate-200 dark:bg-slate-700" />

                {activityLogs.map((activity) => (
                  <div key={activity.id} className="relative flex gap-4">
                    <div
                      className={`relative z-10 h-6 w-6 shrink-0 rounded-full border-4 border-white dark:border-[#0b1220] ${getActivityTone(
                        activity
                      )}`}
                    />

                    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {getActivityLabel(activity)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            por {getActivityUser(activity)}
                          </p>
                        </div>

                        <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                          {formatActivityDate(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Historial de la Cotización</CardTitle>
            </CardHeader>

            <CardContent>
              {quotationTimeline.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No hay movimientos registrados.
                </p>
              ) : (
                <div className="space-y-4">
                  {quotationTimeline.map((event, index) => (
                    <div key={event.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div
                          className={`h-3 w-3 rounded-full mt-1 ${
                            event.type === 'Cambio de estado'
                              ? 'bg-blue-600'
                              : 'bg-amber-500'
                          }`}
                        />

                        {index !== quotationTimeline.length - 1 && (
                          <div className="w-px flex-1 bg-slate-300 min-h-[40px]" />
                        )}
                      </div>

                      <div className="flex-1 rounded-xl border p-3">
                        <div className="flex justify-between gap-4">
                          <div>
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                event.type === 'Cambio de estado'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {event.type}
                            </span>

                            <p className="mt-2 text-sm font-semibold">
                              {event.title}
                            </p>

                            <p className="mt-1 text-sm text-gray-600">
                              {event.description}
                            </p>

                            <p className="mt-2 text-xs text-gray-400">
                              Por: {event.user}
                            </p>
                          </div>

                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {new Date(event.date).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  </>
)
}
