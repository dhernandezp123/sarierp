'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Printer } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { allowedTransitions, canTransition } from '@/src/lib/quotation-status'
import { secondaryButtonClass } from '@/src/lib/ui-classes'
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
  ...Object.keys(allowedTransitions),
]

const getServiceProductLabel = (value?: string | null) => {
  switch (value) {
    case 'miami_lcl':
      return 'Miami Consolidado LCL'
    case 'miami_air':
      return 'Miami Consolidado Aéreo'
    case 'other_origin_fcl':
      return 'Marítimo FCL'
    case 'other_origin_lcl':
      return 'Marítimo LCL'
    case 'courier':
      return 'Courier'
    default:
      return value || 'N/A'
  }
}

type QuotationChangeLog = {
  id: string
  change_type: string
  reason: string | null
  created_at: string
  changed_by: string | null
  field_name?: string | null
  user?: {
    nombre: string | null
    apellido: string | null
  } | null
}

type ActivityLog = {
  id: string
  action: string
  description: string | null
  created_at: string
  created_by_profile?: {
    nombre: string | null
    apellido: string | null
  } | null
}

type QuotationDetail = any & {
  duplicated_from: string | null
  duplicated_from_quote?: {
    id: string
    quotation_number: string | null
  } | null
}

type CargoLine = {
  id: string
  quantity: number
  package_type: string
  length: number | null
  width: number | null
  height: number | null
  dimension_unit: string
  weight_lbs: number | null
  ft3: number | null
  cbm: number | null
}

const formatDisplayDate = (date?: string | null) => {
  if (!date) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export default function QuotationDetailPage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()
  const userRole = profile?.rol
  const canManagePricing = ['Admin', 'Pricing'].includes(userRole || '')
  const canGenerateSI = ['Admin', 'Ventas'].includes(userRole || '')
  const canEditQuotation = ['Admin', 'Ventas'].includes(userRole || '')

  const [quotation, setQuotation] = useState<QuotationDetail | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<any>(null)

  const [agentQuotes, setAgentQuotes] = useState<any[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])
  const [cargoLines, setCargoLines] = useState<CargoLine[]>([])
  const [validations, setValidations] = useState<any[]>([])
  const [statusHistory, setStatusHistory] = useState<any[]>([])
  const [changeLogs, setChangeLogs] = useState<QuotationChangeLog[]>([])
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([])
  const [openStatusMenu, setOpenStatusMenu] = useState(false)
  const [creatingRouting, setCreatingRouting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (params.id) {
      fetchData(params.id as string)
      fetchStatusHistory()
      loadChangeLogs()
    }
  }, [params.id])

  const fetchData = async (id: string) => {
    const { data: quoteData, error: quoteError } = await supabase
      .from('quotations')
      .select(`
        *,
        cliente:clientes (
          *,
          vendedor:profiles!clientes_vendedor_asignado_fkey (
            id,
            nombre,
            apellido
          )
        ),
        created_by_profile:profiles!quotations_created_by_fkey (
          nombre,
          apellido
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (quoteError) {
      console.error('Quotation detail error:', quoteError)
      toast.error('Error cargando cotización', {
        description: quoteError.message,
      })
      setLoading(false)
      return
    }

    let duplicatedFromQuote = null

    if (quoteData?.duplicated_from) {
      const { data } = await supabase
        .from('quotations')
        .select('id, quotation_number')
        .eq('id', quoteData.duplicated_from)
        .single()

      duplicatedFromQuote = data
    }

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

    const { data: cargoData, error: cargoError } = await supabase
      .from('quotation_cargo_lines')
      .select('*')
      .eq('quotation_id', id)
      .order('created_at', { ascending: true })

    const { data: logsData } = await supabase
      .from('activity_logs')
      .select(`
        id,
        action,
        description,
        created_at,
        created_by_profile:profiles!activity_logs_user_id_fkey (
          nombre,
          apellido
        )
      `)
      .eq('entity_type', 'quotation')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })

    setQuotation(
      quoteData
        ? {
            ...quoteData,
            clientes: quoteData.cliente,
            duplicated_from_quote: duplicatedFromQuote,
          }
        : null
    )
    setPricingItems(pricingItemsData || [])
    setQuotationContainers(quotationContainersData || [])
    setActivityLogs(
      (logsData || []).map((log) => ({
        ...log,
        created_by_profile: Array.isArray(log.created_by_profile)
          ? log.created_by_profile[0] || null
          : log.created_by_profile,
      }))
    )
    if (!cargoError && cargoData) {
      setCargoLines(cargoData)
    }
    const { data: selectedPricing } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', id)
      .eq('is_selected', true)
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
      toast.error(error.message)
      return
    }

    setStatusHistory(data || [])
  }

  const loadChangeLogs = async () => {
    const quotationId = params.id as string | undefined

    if (!quotationId) return

    const { data, error } = await supabase
      .from('quotation_change_logs')
      .select(`
        *,
        user:profiles!quotation_change_logs_changed_by_fkey (
          nombre,
          apellido
        )
      `)
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error cargando quotation_change_logs:', error)
      return
    }

    setChangeLogs((data || []) as QuotationChangeLog[])
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!quotation) return

    const oldStatus = quotation.status || 'Borrador'

    if (!canTransition(oldStatus, newStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${newStatus}`)
      return
    }

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
    await loadChangeLogs()
  }

  const handlePrintQuotation = async () => {
    const blob = await pdf(
      <QuotationPDF
        quotation={quotation}
        selectedAgent={selectedAgent}
        pricingItems={pricingItems}
        quotationContainers={quotationContainers}
        cargoLines={cargoLines}
      />
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const duplicateQuotation = async () => {
    if (!quotation || duplicating) return

    setDuplicating(true)

    try {
      const isMiami =
        quotation.service_product === 'miami_lcl' ||
        quotation.service_product === 'miami_air'

      const {
        id: _oldId,
        created_at,
        quotation_number,
        cliente,
        clientes,
        created_by_profile,
        ...quoteCopy
      } = quotation as any

      const { data: newQuote, error: quoteError } = await supabase
        .from('quotations')
        .insert({
          ...quoteCopy,
          quotation_number: null,
          duplicated_from: quotation.id,
          status: isMiami ? 'Pricing Aprobado' : 'Pendiente de Fijar Precios',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (quoteError || !newQuote) {
        toast.error('No se pudo duplicar la cotización')
        return
      }

      const copiedItems = pricingItems.map((item) => {
        const { id, created_at, ...copy } = item as any

        return {
          ...copy,
          quotation_id: newQuote.id,
        }
      })

      if (copiedItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('pricing_items')
          .insert(copiedItems)

        if (itemsError) {
          toast.error('La cotización se creó, pero no se pudieron copiar las líneas')
          return
        }
      }

      const copiedCargoLines = cargoLines.map((line) => {
        const { id, created_at, ...copy } = line as any

        return {
          ...copy,
          quotation_id: newQuote.id,
        }
      })

      if (copiedCargoLines.length > 0) {
        const { error: cargoError } = await supabase
          .from('quotation_cargo_lines')
          .insert(copiedCargoLines)

        if (cargoError) {
          toast.error('La cotización se creó, pero no se pudo copiar la carga')
          return
        }
      }

      await createActivityLog({
        module: 'quotations',
        action: 'quotation_duplicated',
        entityType: 'quotation',
        entityId: newQuote.id,
        description: `Cotización duplicada desde ${
          quotation.quotation_number || quotation.id
        }`,
        metadata: {
          sourceQuotationId: quotation.id,
          sourceQuotationNumber: quotation.quotation_number || null,
          pricingItems: copiedItems.length,
          cargoLines: copiedCargoLines.length,
        },
      })

      toast.success('Cotización duplicada')
      router.push(`/quotations/${newQuote.id}`)
    } finally {
      setDuplicating(false)
    }
  }

  const createRoutingInstruction = async () => {
    if (!quotation?.id || creatingRouting) return

    setCreatingRouting(true)

    const { data: existingSI, error: existingError } = await supabase
      .from('shipping_instructions')
      .select('id')
      .eq('quotation_id', quotation.id)
      .maybeSingle()

    if (existingError) {
      toast.error(existingError.message)
      setCreatingRouting(false)
      return
    }

    if (existingSI?.id) {
      toast.warning('Esta cotización ya tiene Shipping Instructions.')
      router.push(`/operations/routing/${existingSI.id}`)
      setCreatingRouting(false)
      return
    }

    const { data: selectedAgentQuote, error: agentError } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', quotation.id)
      .eq('is_selected', true)
      .maybeSingle()

    if (agentError) {
      toast.error(agentError.message)
      setCreatingRouting(false)
      return
    }

    if (!selectedAgentQuote) {
      toast.error('Selecciona una tarifa de agente antes de generar Shipping Instructions.')
      setCreatingRouting(false)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      toast.error('No se pudo validar el usuario')
      setCreatingRouting(false)
      return
    }

    const containerQty =
      quotationContainers.length > 0
        ? quotationContainers.reduce(
            (sum, container) => sum + Number(container.quantity || 0),
            0
          )
        : Number(quotation.containers_qty || 1)

    const containerType =
      quotationContainers.length > 0
        ? quotationContainers
            .map(
              (container) =>
                `${container.quantity || 1} x ${
                  container.container_type_name ||
                  container.container_type ||
                  'N/A'
                }`
            )
            .join(', ')
        : quotation.container_type || quotation.quote_type || null

    const { data: shippingInstruction, error } = await supabase
      .from('shipping_instructions')
      .insert({
        quotation_id: quotation.id,
        client_id: quotation.cliente_id || quotation.client_id || null,
        created_by: user.id,
        carrier: selectedAgentQuote.carrier || null,
        agent_name:
          selectedAgentQuote.agent_name ||
          selectedAgentQuote.agente_nombre ||
          selectedAgentQuote.agent ||
          null,
        agent_contact:
          selectedAgentQuote.agent_contact ||
          selectedAgentQuote.contact ||
          null,
        agent_email:
          selectedAgentQuote.agent_email ||
          selectedAgentQuote.email ||
          null,
        container_qty: quotation.total_containers || containerQty || null,
        container_type: quotation.container_type || containerType || null,
        origin_address: quotation.puerto_origen || quotation.origen || null,
        destination_address: quotation.puerto_destino || quotation.destino || null,
        free_days: selectedAgentQuote.free_days || null,
        freight_terms: selectedAgentQuote.freight_terms || 'Collect',
        release_type: 'Express Release',
        hbl_freight_visibility: 'No Freight Charges',
        printed_at_destination: true,
        shipment_status: 'Pendiente Validación',
        operational_status: 'Pendiente Validación',
      })
      .select('*')
      .single()

    if (error) {
      toast.error(error.message)
      setCreatingRouting(false)
      return
    }

    const routingCode =
      shippingInstruction.routing_number ||
      shippingInstruction.number ||
      shippingInstruction.id

    const { data: operationsUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('rol', 'Operaciones')
      .eq('is_active', true)

    await Promise.all(
      (operationsUsers || []).map((operationsUser) =>
        createNotification({
          userId: operationsUser.id,
          title: `Nueva Shipping Instruction ${routingCode} pendiente de validación`,
          message: `Cotización ${
            quotation.quotation_number || quotation.id
          } requiere validación operativa.`,
          type: 'info',
        })
      )
    )

    await createActivityLog({
      module: 'operations',
      action: 'shipping_instruction_created',
      entityType: 'shipping_instruction',
      entityId: shippingInstruction.id,
      description: `Shipping Instructions creadas para ${
        quotation.quotation_number || quotation.id
      }`,
      metadata: {
        quotationId: quotation.id,
        routingCode,
      },
    })

    toast.success('Shipping Instructions generadas')
    router.push(`/operations/routing/${shippingInstruction.id}`)
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

  const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
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

const hasPricingItems = pricingItems.length > 0

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

const serviceProductLabel = getServiceProductLabel(quotation.service_product)

const tradeDirectionLabel =
  quotation?.trade_direction === 'import'
    ? 'Importación'
    : quotation?.trade_direction === 'export'
      ? 'Exportación'
      : 'N/A'

const quoteType = quotation?.quote_type || ''
const transportType = quotation?.tipo_transporte || ''
const shouldShowCarrier =
  ['FCL', 'FTL'].includes(quoteType) &&
  ['Marítima', 'Maritima'].includes(transportType)
const etdLabel = formatDisplayDate(selectedAgent?.etd || quotation?.etd)
const transitDays =
  selectedAgent?.transit_time || quotation?.transit_time || null
const freeDays =
  selectedAgent?.free_days_destination ||
  selectedAgent?.free_days ||
  selectedAgent?.dias_libres ||
  null
const carrierLabel =
  selectedAgent?.carrier || quotation?.preferred_carrier || 'N/A'
const transshipmentLabel =
  selectedAgent?.transshipment || quotation?.transshipment || 'N/A'

const combinedTimeline = [
  ...(statusHistory || []).map((item) => ({
    type: 'status' as const,
    created_at: item.created_at,
    data: item,
  })),

  ...(changeLogs || []).map((item) => ({
    type: 'change' as const,
    created_at: item.created_at,
    data: item,
  })),
]
  .filter((item) => item.created_at)
  .sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

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
          {canEditQuotation && (
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
                  {statusOptions
                    .filter((status) =>
                      canTransition(quotation?.status || 'Borrador', status)
                    )
                    .map((status) => (
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
          )}

          <PDFDownloadLink
            document={
              <QuotationPDF
                quotation={quotation}
                selectedAgent={selectedAgent}
                pricingItems={pricingItems}
                quotationContainers={quotationContainers}
                cargoLines={cargoLines}
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

          {canManagePricing && (
            <Link
              href={`/pricing-comparison?quotation=${quotation.id}`}
              className="rounded-xl bg-black text-white px-6 py-3 font-semibold"
            >
              Gestionar Cotización
            </Link>
          )}

          {canEditQuotation && (
            <button
              type="button"
              onClick={duplicateQuotation}
              disabled={duplicating}
              className={secondaryButtonClass}
            >
              {duplicating ? 'Duplicando...' : 'Duplicar Cotización'}
            </button>
          )}

          {canGenerateSI && quotation.status === 'Ganada' && (
            <button
              type="button"
              onClick={createRoutingInstruction}
              disabled={creatingRouting}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {creatingRouting
                ? 'Generando...'
                : 'Generar Shipping Instructions'}
            </button>
          )}

          {canEditQuotation && (
            <Link
              href={`/quotations/${quotation.id}/edit`}
              className="h-14 px-6 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition font-semibold shadow-sm flex items-center justify-center"
            >
              Editar Qt.
            </Link>
          )}
        </div>
      </div>

      {quotation.duplicated_from && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Esta cotización fue duplicada desde{' '}
          <span className="font-semibold">
            {quotation.duplicated_from_quote?.quotation_number || 'otra cotización'}
          </span>.
        </div>
      )}

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
                  {hasPricingItems
                    ? `USD ${formatCurrency(pricingTotals.total)}`
                    : 'N/A'}
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
                  {hasPricingItems
                    ? `USD ${formatCurrency(pricingTotals.cost)}`
                    : 'N/A'}
                </p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">Profit</p>
                <p className="text-2xl font-bold text-green-700 !font-sans">
                  {hasPricingItems
                    ? `USD ${formatCurrency(pricingTotals.profit)}`
                    : 'N/A'}
                </p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 shadow-sm">
              <CardContent className="p-5">
                <p className="text-sm text-gray-500">GP%</p>
                <p className="text-2xl font-bold !font-sans">
                  {hasPricingItems ? `${gpPercent.toFixed(2)}%` : 'N/A'}
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
                  <p className="text-xs text-slate-500">Producto / Servicio</p>
                  <p className="font-semibold text-slate-900">
                    {serviceProductLabel}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Dirección Comercial</p>
                  <p className="font-semibold text-slate-900">
                    {tradeDirectionLabel}
                  </p>
                </div>

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
                  <p className="text-xs text-slate-500">Válida hasta</p>
                  <p className="font-semibold text-slate-900">
                    {formatDisplayDate(quotation.valid_until)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">ETD</p>
                  <p className="font-semibold text-slate-900">
                    {etdLabel}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Días tránsito</p>
                  <p className="font-semibold text-slate-900">
                    {transitDays ? `${transitDays} días` : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Días libres</p>
                  <p className="font-semibold text-slate-900">
                    {freeDays ? `${freeDays} días` : 'N/A'}
                  </p>
                </div>

                {shouldShowCarrier && (
                  <div>
                    <p className="text-xs text-slate-500">Carrier / Naviera</p>
                    <p className="font-semibold text-slate-900">
                      {carrierLabel}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-slate-500">Transbordo</p>
                  <p className="font-semibold text-slate-900">
                    {transshipmentLabel}
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

            {cargoLines.length > 0 && (
              <section className="col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Detalle de carga
                </h2>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-2">Cantidad</th>
                        <th>Tipo</th>
                        <th>Dimensiones</th>
                        <th>Peso unit.</th>
                        <th>Total lbs</th>
                        <th>FT3</th>
                        <th>CBM</th>
                      </tr>
                    </thead>

                    <tbody>
                      {cargoLines.map((line) => {
                        const lineTotalLbs =
                          Number(line.weight_lbs || 0) *
                          Number(line.quantity || 0)

                        return (
                          <tr
                            key={line.id}
                            className="border-t border-slate-100 dark:border-slate-800"
                          >
                            <td className="py-2">{line.quantity}</td>
                            <td>{line.package_type}</td>
                            <td>
                              {line.length} x {line.width} x {line.height}{' '}
                              {line.dimension_unit}
                            </td>
                            <td>{formatNumber(Number(line.weight_lbs || 0), 2)}</td>
                            <td>{formatNumber(lineTotalLbs, 2)}</td>
                            <td>{formatNumber(Number(line.ft3 || 0), 2)}</td>
                            <td>{formatNumber(Number(line.cbm || 0), 3)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Observaciones internas
                </CardTitle>
              </CardHeader>

              <CardContent>
                <p>
                  {quotation?.pricing_notes ||
                    quotation?.notes ||
                    quotation?.observaciones ||
                    'Sin observaciones internas'}
                </p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Observaciones para Cliente (PDF)
                </CardTitle>
              </CardHeader>

              <CardContent>
                <p>
                  {quotation?.client_notes ||
                    'Sin observaciones para cliente'}
                </p>
              </CardContent>
            </Card>

          </div>

          {activityLogs.length > 0 && (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">
                Activity Timeline
              </h2>

              <div className="mt-5 space-y-4">
                {activityLogs.map((log) => {
                  const userName = log.created_by_profile?.nombre
                    ? `${log.created_by_profile.nombre} ${
                        log.created_by_profile.apellido || ''
                      }`.trim()
                    : 'Sistema'

                  return (
                    <div key={log.id} className="flex gap-4">
                      <div className="mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />

                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {log.description || log.action}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {userName} · {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
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
              <CardTitle>Timeline de la Cotización</CardTitle>
            </CardHeader>

            <CardContent>
              {combinedTimeline.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No hay movimientos registrados.
                </p>
              ) : (
                <div className="space-y-4">
                  {combinedTimeline.map((item, index) => {
                    if (item.type === 'status') {
                      const log = item.data
                      const userName = log.profiles
                        ? `${log.profiles.nombre || ''} ${log.profiles.apellido || ''}`.trim()
                        : 'Usuario'

                      return (
                        <div key={`status-${log.id}`} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="mt-1 h-3 w-3 rounded-full bg-blue-600" />

                            {index !== combinedTimeline.length - 1 && (
                              <div className="min-h-[40px] w-px flex-1 bg-slate-300" />
                            )}
                          </div>

                          <div className="flex-1 rounded-xl border p-3">
                            <div className="flex justify-between gap-4">
                              <div>
                                <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">
                                  Cambio de estado
                                </span>

                                <p className="mt-2 text-sm font-semibold">
                                  {log.old_status || 'Sin estado'} a {log.new_status}
                                </p>

                                <p className="mt-1 text-sm text-gray-600">
                                  Cambio de estado de la cotización.
                                </p>

                                <p className="mt-2 text-xs text-gray-400">
                                  Por: {userName || 'Usuario'}
                                </p>
                              </div>

                              <p className="whitespace-nowrap text-xs text-gray-400">
                                {new Date(log.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    const log = item.data
                    const userName =
                      log.user?.nombre || log.user?.apellido
                        ? `${log.user?.nombre || ''} ${log.user?.apellido || ''}`.trim()
                        : 'Usuario no identificado'

                    return (
                      <div key={`change-${log.id}`} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="mt-1 h-3 w-3 rounded-full bg-amber-500" />

                          {index !== combinedTimeline.length - 1 && (
                            <div className="min-h-[40px] w-px flex-1 bg-slate-300" />
                          )}
                        </div>

                        <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                          <div className="flex justify-between gap-4">
                            <div>
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                                Cambio registrado
                              </span>

                              <p className="mt-2 text-sm font-semibold">
                                {log.change_type}
                              </p>

                              <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                                {log.reason || `${log.field_name || 'Campo'} actualizado`}
                              </p>

                              <p className="mt-2 text-xs text-gray-400">
                                Por: {userName}
                              </p>
                            </div>

                            <p className="whitespace-nowrap text-xs text-gray-400">
                              {new Date(log.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
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
