'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Download, ExternalLink, Plus, Printer, RefreshCw } from 'lucide-react'
import {
  PDFDownloadLink,
  pdf,
} from '@react-pdf/renderer'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { supabase } from '@/src/lib/supabase/client'
import { primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { CarrierBadge } from '@/src/components/ui/CarrierBadge'
import ShippingInstructionOrderPDF from '@/src/components/pdf/shipping-instruction-order-pdf'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

type OperationsUser = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
}

type Booking = {
  id: string
  shipping_instruction_id: string
  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null
  carrier: string | null
  vessel_name: string | null
  voyage: string | null
  etd: string | null
  eta: string | null
  shipment_status: string | null
  free_days: number | null
  created_at: string | null
  booking_containers?: Array<{
    container_type: string | null
    quantity: number | null
  }> | null
}

type OperationalTimelineEvent = {
  id: string
  source: 'shipping_instruction_events' | 'activity_logs'
  date: string
  eventType: string
  description: string
  userName?: string | null
  bookingLabel?: string | null
  metadata?: Record<string, unknown> | null
}

const SI_READY_FOR_BOOKING = 'Listo para Booking'
const SI_PENDING_VALIDATION = 'Pendiente Validación'
const SI_VALIDATED = 'Validada'
const SI_CANCELLED = 'Cancelada'

type ShippingInstruction = {
  id: string
  routing_number: string
  status: string
  shipment_status: string
  operational_status: string | null
  created_by: string | null
  operations_assigned_to: string | null
  quotation_id?: string | null
  cliente?: any
  quotation?: any
  quotation_number?: string | null
  client_name?: string | null
  incoterm?: string | null

  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  supplier_phone: string | null
  supplier_address: string | null

  origin_address: string | null
  destination_address: string | null

  container_qty: number | null
  container_type: string | null

  carrier: string | null
  agent_name: string | null
  agent_contact: string | null
  agent_email: string | null

  special_instructions: string | null

  booking_number: string | null
  carrier_booking: string | null
  master_bl: string | null
  house_bl: string | null

  etd: string | null
  eta: string | null
  estimated_transit_days?: number | null
  remaining_free_days?: number | null

  free_days: string | null
  free_days_destination?: string | null
  transit_time?: string | null
  transit?: string | null
  transshipment?: string | null

  freight_terms: string | null
  release_type: string | null
  hbl_freight_visibility: string | null
  printed_at_destination: boolean | null
  insurance_requested: boolean | null

  shipper: string | null
  consignee: string | null
  consignee_tax_id: string | null
  consignee_address: string | null
  consignee_contact: string | null
  consignee_email: string | null
  consignee_phone: string | null
  notify_party: string | null
  notify_party_tax_id: string | null
  notify_party_address: string | null
  notify_party_contact: string | null
  notify_party_email: string | null
  notify_party_phone: string | null

  sales_observations: string | null
  sales_submitted_at: string | null

  validated_at: string | null
  validated_by: string | null
}

type SalesInitialInfoField =
  | 'supplier_name'
  | 'supplier_contact'
  | 'supplier_email'
  | 'supplier_phone'
  | 'supplier_address'
  | 'sales_observations'
  | 'special_instructions'

const salesInitialInfoFields: SalesInitialInfoField[] = [
  'supplier_name',
  'supplier_contact',
  'supplier_email',
  'supplier_phone',
  'supplier_address',
  'sales_observations',
  'special_instructions',
]

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
        {value || 'N/A'}
      </p>
    </div>
  )
}

function InfoContent({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
        {children}
      </div>
    </div>
  )
}

function formatDisplayDate(date?: string | null) {
  if (!date) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatContainerSummary(routing: ShippingInstruction) {
  const containerType = routing.container_type?.trim()
  const containerQty = routing.container_qty

  if (containerType && /^\d+\s*x\s+/i.test(containerType)) {
    return containerType
  }

  if (containerQty && containerType) {
    return `${containerQty} x ${containerType}`
  }

  if (containerType) {
    return containerType
  }

  return 'N/A'
}

function formatBookingContainers(
  containers?: Array<{ container_type: string | null; quantity: number | null }> | null
) {
  if (!containers || containers.length === 0) return 'Sin asignar'

  const grouped = containers.reduce<Record<string, { label: string; quantity: number }>>(
    (acc, container) => {
      const label = container.container_type?.trim()
      const quantity = Number(container.quantity || 0)
      if (!label || quantity <= 0) return acc

      const key = label.toLowerCase()
      acc[key] = {
        label: acc[key]?.label || label,
        quantity: (acc[key]?.quantity || 0) + quantity,
      }

      return acc
    },
    {}
  )

  const values = Object.values(grouped)
  if (values.length === 0) return 'Sin asignar'

  return values.map((container) => `${container.quantity} x ${container.label}`).join(', ')
}

function getBookingStatusBadgeClass(status?: string | null) {
  switch (status) {
    case 'Finalizado':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Arribado':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
    case 'En Tránsito':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'Embarcado':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Booking Confirmado':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    case 'Booking Solicitado':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Documentación Pendiente':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
    case 'Listo para Embarque':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function getRoutingAggregateStatus(bookings: Booking[]) {
  if (bookings.length === 0) return 'Sin bookings'

  const statuses = bookings.map((booking) => booking.shipment_status || '')

  if (statuses.every((status) => status === 'Finalizado')) return 'Finalizado'
  if (statuses.some((status) => status === 'En Tránsito')) return 'En Tránsito'
  if (statuses.some((status) => status === 'Embarcado')) return 'Embarcado'

  const confirmedCount = statuses.filter((status) => status === 'Booking Confirmado').length
  const requestedCount = statuses.filter((status) => status === 'Booking Solicitado').length

  if (confirmedCount > 0 && requestedCount > 0) return 'Parcialmente Confirmado'
  if (confirmedCount === statuses.length) return 'Booking Confirmado'
  if (requestedCount > 0) return 'Booking Solicitado'

  return 'En proceso'
}

function parseQuotedContainerTotal(routing: ShippingInstruction) {
  const containerType = routing.container_type?.trim()
  const containerQty = Number(routing.container_qty || 0)

  if (containerQty > 0) return containerQty

  if (containerType) {
    const match = containerType.match(/^(\d+)\s*x\s+/i)
    if (match) return Number(match[1])
  }

  return 0
}

function countAssignedBookingContainers(bookings: Booking[]) {
  return bookings.reduce((total, booking) => {
    const bookingContainers = booking.booking_containers || []
    return total + bookingContainers.reduce(
      (bookingTotal, container) => bookingTotal + Number(container.quantity || 0),
      0
    )
  }, 0)
}

function looksLikeUuid(value: unknown) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isReadableUserName(value?: string | null) {
  return Boolean(value && !looksLikeUuid(value))
}

function getMetadataValue(metadata: Record<string, unknown>, keys: string[]) {
  return keys
    .map((key) => metadata[key])
    .find((value) => value !== null && value !== undefined && value !== '')
}

function formatMetadataSummary(metadata?: Record<string, unknown> | null) {
  if (!metadata) return null

  const summaryParts: string[] = []
  const previousStatus = getMetadataValue(metadata, ['oldStatus', 'previous_status', 'previousStatus'])
  const newStatus = getMetadataValue(metadata, ['newStatus', 'new_status'])

  if (previousStatus && newStatus) {
    summaryParts.push(`Estado: ${String(previousStatus)} → ${String(newStatus)}`)
  }

  const businessFields: Array<[string, string]> = [
    ['routingCode', 'SI'],
    ['routing_number', 'SI'],
    ['quotationNumber', 'Cotización'],
    ['quotation_number', 'Cotización'],
    ['booking_number', 'Booking'],
    ['carrier', 'Carrier'],
    ['bookings_count', 'Bookings asociados'],
    ['confirmed_bookings_count', 'Bookings confirmados'],
    ['total_containers', 'Contenedores'],
    ['reason', 'Motivo'],
    ['location', 'Ubicación'],
  ]

  businessFields.forEach(([key, label]) => {
    const value = metadata[key]
    if (value === null || value === undefined || value === '' || looksLikeUuid(value)) return
    summaryParts.push(`${label}: ${String(value)}`)
  })

  if (summaryParts.length === 0) return null

  return summaryParts.slice(0, 6)
}

function formatOperationalEvent(event: OperationalTimelineEvent) {
  const metadataSummary = formatMetadataSummary(event.metadata)
  const titleByAction: Record<string, { icon: string; title: string }> = {
    send_to_pricing: { icon: '📄', title: 'Cotización enviada a Pricing' },
    status_changed: { icon: '🔁', title: 'Estado actualizado' },
    pricing_approved: { icon: '💰', title: 'Pricing aprobado' },
    sent_to_client: { icon: '📄', title: 'Cotización enviada al cliente' },
    quotation_reopened_for_repricing: { icon: '🔁', title: 'Cotización reabierta para repricing' },
    repricing_approved_with_operational_sync: { icon: '💰', title: 'Repricing aprobado y operación actualizada' },
    repricing_approved_without_operational_sync: { icon: '💰', title: 'Repricing aprobado sin actualizar operación' },
    post_approval_change: { icon: '🔁', title: 'Cambio posterior a aprobación' },
    shipping_instruction_created: { icon: '🚢', title: 'Shipping Instruction creada' },
    shipping_instruction_updated: { icon: '🚢', title: 'Información operativa actualizada' },
    shipping_instruction_validated: { icon: '✅', title: 'SI validada por Operaciones' },
    shipping_instruction_assigned: { icon: '👤', title: 'Operativo asignado' },
    shipping_instruction_finalized: { icon: '🚢', title: 'Shipping Instruction finalizada' },
    shipping_instruction_cancelled: { icon: '🚫', title: 'Shipping Instruction cancelada' },
    booking_created: { icon: '📦', title: 'Booking creado' },
    'Booking creado': { icon: '📦', title: 'Booking creado' },
    booking_confirmed: { icon: '📦', title: 'Booking confirmado' },
    booking_child_updated: { icon: '📦', title: 'Booking actualizado' },
    booking_updated: { icon: '📦', title: 'Booking actualizado' },
    booking_containers_assigned: { icon: '🚚', title: 'Contenedores asignados' },
    'Routing PDF generado': { icon: '🖨️', title: 'SI PDF generado' },
    shipment_event_created: { icon: '🚢', title: 'Evento de embarque registrado' },
    'Shipping Instruction finalizada': { icon: '🚢', title: 'Shipping Instruction finalizada' },
    'Shipping Instruction cancelada': { icon: '🚫', title: 'Shipping Instruction cancelada' },
  }
  const mappedEvent = titleByAction[event.eventType]

  return {
    title: mappedEvent ? `${mappedEvent.icon} ${mappedEvent.title}` : event.eventType,
    description: event.description,
    metadataSummary,
  }
}

export default function RoutingDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id
  const bookingsSectionRef = useRef<HTMLElement | null>(null)
  const { user, profile, loading: userLoading } = useUser()

  const [routing, setRouting] = useState<ShippingInstruction | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [operationalEvents, setOperationalEvents] = useState<OperationalTimelineEvent[]>([])
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false)
  const [quotedContainerTotal, setQuotedContainerTotal] = useState(0)
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([])
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [creatingBooking, setCreatingBooking] = useState(false)
  const [refreshingPricingData, setRefreshingPricingData] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [loading, setLoading] = useState(true)

  const canManageRouting = profile?.rol === 'Admin' || profile?.rol === 'Operaciones'
  const canViewRouting =
    !!routing && (canManageRouting || routing.created_by === user?.id)
  const canSalesEditInitialInfo =
    profile?.rol === 'Ventas' &&
    routing?.created_by === user?.id &&
    !routing?.sales_submitted_at &&
    routing?.operational_status === SI_PENDING_VALIDATION
  const visibleOperationalEvents = isTimelineExpanded
    ? operationalEvents
    : operationalEvents.slice(0, 3)
  const shouldShowTimelineToggle = operationalEvents.length > 3
  const canEditSupplierInfo =
    (canManageRouting &&
      routing?.shipment_status !== 'Finalizado' &&
      routing?.shipment_status !== SI_CANCELLED &&
      routing?.operational_status !== SI_CANCELLED) ||
    canSalesEditInitialInfo

  const parseIntegerValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null

    const numericValue = Number(value)
    if (!Number.isFinite(numericValue)) return null

    return Math.trunc(numericValue)
  }

  const loadRouting = async () => {
    // TODO: Reforzar esta misma regla en Supabase RLS para shipping_instructions.
    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        *,
        cliente:clientes (*),
        quotation:quotations (
          *,
          cliente:clientes (*)
        )
      `)
      .eq('id', id)
      .single()

    if (!error && data) {
      const quotationId = data.quotation_id || data.quotation?.id

      if (quotationId) {
        const { data: selectedAgentData } = await supabase
          .from('agent_quotes')
          .select('*')
          .eq('quotation_id', quotationId)
          .eq('is_selected', true)
          .maybeSingle()

        setSelectedAgent(selectedAgentData || null)

        const { data: quotationContainersData, error: quotationContainersError } = await supabase
          .from('quotation_containers')
          .select('quantity')
          .eq('quotation_id', quotationId)

        if (quotationContainersError) {
          // non-fatal: containers section just won't render
        }

        const quotationContainerTotal = (quotationContainersData || []).reduce(
          (total, container) => total + Number(container.quantity || 0),
          0
        )

        setQuotedContainerTotal(
          quotationContainerTotal > 0
            ? quotationContainerTotal
            : parseQuotedContainerTotal(data as ShippingInstruction)
        )
      } else {
        setSelectedAgent(null)
        setQuotedContainerTotal(parseQuotedContainerTotal(data as ShippingInstruction))
      }

      setRouting(data)
    }

    setLoading(false)
  }

  const syncRoutingFromPricing = async () => {
    if (!routing?.id || !routing.quotation_id || refreshingPricingData) return

    setRefreshingPricingData(true)

    try {
      const { data, error } = await supabase.rpc(
        'sync_shipping_instruction_from_selected_agent_quote',
        {
          p_shipping_instruction_id: routing.id,
          p_reason: 'Actualizacion manual desde Shipping Instruction',
        }
      )

      if (error) {
        toast.error(error.message || 'No se pudo sincronizar la Shipping Instruction')
        return
      }

      const updatedBookings =
        (data as Array<{ updated_bookings?: number }> | null)?.[0]?.updated_bookings ?? 0

      toast.success(
        updatedBookings > 0
          ? `Informacion sincronizada desde Pricing (${updatedBookings} booking${updatedBookings === 1 ? '' : 's'} actualizado${updatedBookings === 1 ? '' : 's'})`
          : 'Informacion sincronizada desde Pricing'
      )

      await loadRouting()
      await loadBookings()
      return
    } finally {
      setRefreshingPricingData(false)
    }
  }

  const loadBookings = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        shipping_instruction_id,
        booking_number,
        carrier_booking,
        master_bl,
        house_bl,
        carrier,
        vessel_name,
        voyage,
        etd,
        eta,
        shipment_status,
        free_days,
        created_at,
        booking_containers (
          container_type,
          quantity
        )
      `)
      .eq('shipping_instruction_id', id)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error('No se pudieron cargar los bookings asociados')
      return
    }

    setBookings((data || []) as Booking[])
  }

  const loadOperationsUsers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, email')
      .eq('rol', 'Operaciones')
      .eq('is_active', true)

    if (!error && data) {
      setOperationsUsers(data)
    }
  }

  const loadOperationalTimeline = async (
    routingData: ShippingInstruction,
    bookingRows: Booking[]
  ) => {
    const timelineEvents: OperationalTimelineEvent[] = []

    const { data: shippingEventsData, error: shippingEventsError } = await supabase
      .from('shipping_instruction_events')
      .select('*')
      .eq('shipping_instruction_id', routingData.id)
      .order('event_date', { ascending: false })

    if (shippingEventsError) {
      // timeline continues with available data
    }

    timelineEvents.push(
      ...(shippingEventsData || []).map((event: any) => ({
        id: `shipping-event-${event.id}`,
        source: 'shipping_instruction_events' as const,
        date: event.event_date || event.created_at,
        eventType: event.event_type,
        description: event.notes || event.location || event.event_type,
        userName: isReadableUserName(event.created_by) ? event.created_by : null,
        bookingLabel: null,
        metadata: event.location ? { location: event.location } : null,
      }))
    )

    const relatedEntityIds = [
      routingData.id,
      routingData.quotation_id,
      ...bookingRows.map((booking) => booking.id),
    ].filter(Boolean) as string[]

    if (relatedEntityIds.length > 0) {
      const { data: activityLogsData, error: activityLogsError } = await supabase
        .from('activity_logs')
        .select(`
          id,
          action,
          description,
          metadata,
          entity_type,
          entity_id,
          created_at,
          created_by_profile:profiles!activity_logs_user_id_fkey (
            nombre,
            apellido
          )
        `)
        .in('entity_id', relatedEntityIds)
        .order('created_at', { ascending: false })

      if (activityLogsError) {
        // timeline continues without activity logs
      }

      const activityTimelineEvents = (activityLogsData || []).map((log: any) => {
          const profile = Array.isArray(log.created_by_profile)
            ? log.created_by_profile[0] || null
            : log.created_by_profile
          const userName = profile?.nombre
            ? `${profile.nombre} ${profile.apellido || ''}`.trim()
            : null
          const relatedBooking = bookingRows.find((booking) => booking.id === log.entity_id)

          return {
            id: `activity-log-${log.id}`,
            source: 'activity_logs' as const,
            date: log.created_at,
            eventType: log.action,
            description: log.description,
            userName,
            bookingLabel: relatedBooking
              ? relatedBooking.booking_number || 'Sin booking'
              : null,
            metadata: log.metadata || null,
          }
        })

      timelineEvents.push(...activityTimelineEvents)
    }

    setOperationalEvents(
      timelineEvents.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    )
  }

  const recordOperationalEvent = async ({
    eventType,
    notes,
    metadata,
  }: {
    eventType: string
    notes: string
    metadata?: Record<string, unknown>
  }) => {
    if (!routing || !user?.id) return

    try {
      const { error } = await supabase
        .from('shipping_instruction_events')
        .insert({
          shipping_instruction_id: routing.id,
          event_type: eventType,
          notes,
          created_by: user.id,
        })

      if (metadata) {
        await createActivityLog({
          module: 'operations_timeline',
          action: eventType,
          entityType: 'shipping_instruction',
          entityId: routing.id,
          description: notes,
          metadata,
        })
      }
    } catch {
      // event creation failure is non-fatal
    }
  }

  const saveRouting = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para editar esta Shipping Instruction')
      return
    }
    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction está cancelada')
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        supplier_name: routing.supplier_name,
        supplier_contact: routing.supplier_contact,
        supplier_email: routing.supplier_email,
        supplier_phone: routing.supplier_phone,
        supplier_address: routing.supplier_address,

        booking_number: routing.booking_number,
        carrier_booking: routing.carrier_booking,
        master_bl: routing.master_bl,
        house_bl: routing.house_bl,

        etd: routing.etd,
        eta: routing.eta,

        free_days: routing.free_days,

        freight_terms: routing.freight_terms,
        release_type: routing.release_type,
        hbl_freight_visibility: routing.hbl_freight_visibility,
        printed_at_destination: routing.printed_at_destination,
        insurance_requested: routing.insurance_requested,

        shipper: routing.shipper,
        consignee: routing.consignee,
        consignee_tax_id: routing.consignee_tax_id,
        consignee_address: routing.consignee_address,
        consignee_contact: routing.consignee_contact,
        consignee_email: routing.consignee_email,
        consignee_phone: routing.consignee_phone,

        notify_party: routing.notify_party,
        notify_party_tax_id: routing.notify_party_tax_id,
        notify_party_address: routing.notify_party_address,
        notify_party_contact: routing.notify_party_contact,
        notify_party_email: routing.notify_party_email,
        notify_party_phone: routing.notify_party_phone,

        sales_observations: routing.sales_observations,

        special_instructions: routing.special_instructions,
      })
      .eq('id', routing.id)

    setSaving(false)

    if (error) {
      toast.error(error.message || 'No se pudieron guardar las Shipping Instructions')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_updated',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instructions ${routing.routing_number} actualizadas`,
      metadata: {
        updated_by: user?.id,
      },
    })

    toast.success('Shipping Instructions actualizadas')
  }

  const saveSalesInitialInfo = async (submitToOperations = false) => {
    if (!routing) return
    if (!canSalesEditInitialInfo) {
      toast.error('No tienes permisos para editar esta información')
      return
    }

    setSaving(true)

    const updateData: Record<string, any> = {
      supplier_name: routing.supplier_name,
      supplier_contact: routing.supplier_contact,
      supplier_email: routing.supplier_email,
      supplier_phone: routing.supplier_phone,
      supplier_address: routing.supplier_address,
      sales_observations: routing.sales_observations,
    }

    if (submitToOperations) {
      updateData.sales_submitted_at = new Date().toISOString()
      updateData.operational_status = SI_PENDING_VALIDATION
    }

    const { error } = await supabase
      .from('shipping_instructions')
      .update(updateData)
      .eq('id', routing.id)

    setSaving(false)

    if (error) {
      toast.error(error.message || 'No se pudo guardar la información inicial')
      return
    }

    await loadRouting()
    toast.success(
      submitToOperations
        ? 'Información enviada a Operaciones'
        : 'Información inicial guardada'
    )
  }

  const validateRouting = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para validar esta Shipping Instruction')
      return
    }
    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction está cancelada')
      return
    }

    setValidating(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      toast.error('No se pudo validar el usuario')
      setValidating(false)
      return
    }

    const requiredFields = [
      routing.supplier_name,
      routing.supplier_contact,
      routing.supplier_email,
      routing.supplier_address,
    ]

    const hasMissingFields = requiredFields.some(
      (field) => !field || field === ''
    )

    if (hasMissingFields) {
      toast.error('Completa los datos obligatorios antes de validar.')
      setValidating(false)
      return
    }

    const validatedAt = new Date().toISOString()

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        shipment_status: SI_VALIDATED,
        operational_status: SI_READY_FOR_BOOKING,
        validated_at: validatedAt,
        validated_by: user.id,
      })
      .eq('id', routing.id)

    setValidating(false)

    if (error) {
      toast.error('No se pudo validar la Shipping Instruction')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_validated',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instructions ${routing.routing_number} validadas`,
    })

    if (routing.created_by) {
      await createNotification({
        userId: routing.created_by,
        title: 'Shipping Instructions validadas',
        message: `Operaciones validó la Shipping Instruction ${routing.routing_number}`,
        type: 'success',
      })
    }

    setRouting({
      ...routing,
      shipment_status: SI_VALIDATED,
      operational_status: SI_READY_FOR_BOOKING,
      validated_at: validatedAt,
      validated_by: user.id,
    })

    toast.success('Shipping Instructions listas para booking')
  }

  const assignOperationsUser = async (userId: string) => {
    if (!routing) return

    if (!canManageRouting) {
      toast.error('No tienes permisos para asignar esta Shipping Instruction')
      return
    }

    setAssigning(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        operations_assigned_to: userId || null,
        operational_status: userId ? 'Asignado' : SI_PENDING_VALIDATION,
      })
      .eq('id', routing.id)

    setAssigning(false)

    if (error) {
      toast.error('No se pudo asignar el operativo')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_assigned',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instructions ${routing.routing_number} asignadas a operaciones`,
      metadata: {
        assigned_to: userId,
      },
    })

    if (userId) {
      await createNotification({
        userId,
        title: 'Shipping Instructions asignadas',
        message: `Se te asignó la Shipping Instruction ${routing.routing_number}`,
        type: 'info',
      })
    }

    setRouting({
      ...routing,
      operations_assigned_to: userId || null,
      operational_status: userId ? 'Asignado' : SI_PENDING_VALIDATION,
    })

    toast.success('Operativo asignado')
  }

  const validateCanFinalizeRouting = () => {
    if (!routing) return 'No se encontró la Shipping Instruction.'
    if (bookings.length === 0) {
      return 'No se puede finalizar: debes crear al menos un booking hijo.'
    }

    const bookingsWithoutContainers = bookings.filter(
      (booking) => !booking.booking_containers || booking.booking_containers.length === 0
    )

    if (bookingsWithoutContainers.length > 0) {
      return 'No se puede finalizar: todos los bookings deben tener contenedores asignados.'
    }

    if (quotedContainerTotal > 0 && assignedContainerTotal < quotedContainerTotal) {
      return `No se puede finalizar: faltan ${
        quotedContainerTotal - assignedContainerTotal
      } contenedores por asignar.`
    }

    if (quotedContainerTotal > 0 && assignedContainerTotal > quotedContainerTotal) {
      return 'No se puede finalizar: hay más contenedores asignados que cotizados.'
    }

    const nonFinalizedBookings = bookings.filter(
      (booking) => booking.shipment_status !== 'Finalizado'
    )

    if (nonFinalizedBookings.length > 0) {
      return 'No se puede finalizar: todos los bookings deben estar en estado Finalizado.'
    }

    return null
  }

  const finalizeRouting = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para finalizar esta Shipping Instruction')
      return
    }
    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction está cancelada')
      return
    }

    const validationError = validateCanFinalizeRouting()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setFinalizing(true)

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        shipment_status: 'Finalizado',
        operational_status: 'Finalizado',
      })
      .eq('id', routing.id)

    setFinalizing(false)

    if (error) {
      toast.error(error.message || 'No se pudo finalizar la Shipping Instruction')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_finalized',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instruction ${routing.routing_number} finalizada`,
      metadata: {
        routing_number: routing.routing_number,
        total_bookings: bookings.length,
        total_containers: assignedContainerTotal,
        finalized_by: user?.id,
      },
    })

    await recordOperationalEvent({
      eventType: 'Shipping Instruction finalizada',
      notes: `Shipping Instruction ${routing.routing_number} finalizada`,
      metadata: {
        routing_number: routing.routing_number,
        total_bookings: bookings.length,
        total_containers: assignedContainerTotal,
      },
    })

    setRouting({
      ...routing,
      shipment_status: 'Finalizado',
      operational_status: 'Finalizado',
    })

    toast.success('Shipping Instruction finalizada')
  }

  const cancelRouting = async () => {
    if (!routing) return

    if (!canManageRouting) {
      toast.error('No tienes permisos para cancelar esta Shipping Instruction')
      return
    }

    const reason = cancelReason.trim()

    if (!reason) {
      toast.error('Ingresa el motivo de cancelación')
      return
    }

    if (bookings.length > 0) {
      toast.error('No se puede cancelar desde aquí porque ya existen bookings')
      return
    }

    if (routing.shipment_status === 'Finalizado' || routing.operational_status === 'Finalizado') {
      toast.error('No se puede cancelar una Shipping Instruction finalizada')
      return
    }

    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction ya está cancelada')
      return
    }

    setCancelling(true)

    const previousShipmentStatus = routing.shipment_status
    const previousOperationalStatus = routing.operational_status

    const { error } = await supabase
      .from('shipping_instructions')
      .update({
        shipment_status: SI_CANCELLED,
        operational_status: SI_CANCELLED,
      })
      .eq('id', routing.id)

    setCancelling(false)

    if (error) {
      toast.error(error.message || 'No se pudo cancelar la Shipping Instruction')
      return
    }

    await createActivityLog({
      module: 'operations_routing',
      action: 'shipping_instruction_cancelled',
      entityType: 'shipping_instruction',
      entityId: routing.id,
      description: `Shipping Instruction ${routing.routing_number} cancelada`,
      metadata: {
        routing_number: routing.routing_number,
        previous_shipment_status: previousShipmentStatus,
        previous_operational_status: previousOperationalStatus,
        reason,
        cancelled_by: user?.id,
      },
    })

    await recordOperationalEvent({
      eventType: 'Shipping Instruction cancelada',
      notes: `Shipping Instruction ${routing.routing_number} cancelada. Motivo: ${reason}`,
      metadata: {
        routing_number: routing.routing_number,
        reason,
      },
    })

    setRouting({
      ...routing,
      shipment_status: SI_CANCELLED,
      operational_status: SI_CANCELLED,
    })
    setCancelDialogOpen(false)
    setCancelReason('')
    toast.success('Shipping Instruction cancelada')
  }

  const createBookingChild = async () => {
    if (!routing) return null
    if (!canManageRouting) {
      toast.error('No tienes permisos para crear booking desde esta Shipping Instruction')
      return null
    }
    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction está cancelada')
      return null
    }
    if (!user?.id) {
      toast.error('No se pudo validar el usuario')
      return null
    }

    setCreatingBooking(true)

    const freeDays =
      parseIntegerValue(selectedAgent?.free_days_destination) ??
      parseIntegerValue(selectedAgent?.free_days) ??
      parseIntegerValue(selectedAgent?.dias_libres) ??
      parseIntegerValue(routing.free_days_destination) ??
      parseIntegerValue(routing.free_days)
    const estimatedTransitDays =
      parseIntegerValue(selectedAgent?.transit_time) ??
      parseIntegerValue(selectedAgent?.transit) ??
      parseIntegerValue(routing.transit_time) ??
      parseIntegerValue(routing.transit) ??
      parseIntegerValue(routing.estimated_transit_days)
    const quotation = routing.quotation || {}

    const bookingPayload = {
      shipping_instruction_id: routing.id,
      carrier:
        selectedAgent?.carrier ||
        routing.carrier ||
        quotation.preferred_carrier ||
        null,
      etd: selectedAgent?.etd || routing.etd || null,
      eta: routing.eta || null,
      estimated_transit_days: estimatedTransitDays,
      free_days: freeDays,
      remaining_free_days: parseIntegerValue(routing.remaining_free_days) ?? freeDays,
      freight_terms: routing.freight_terms,
      release_type: routing.release_type,
      hbl_freight_visibility: routing.hbl_freight_visibility,
      printed_at_destination: routing.printed_at_destination ?? true,
      shipment_status: 'Booking Solicitado',
      created_by: user.id,
    }

    const { error } = await supabase
      .from('bookings')
      .insert(bookingPayload)

    setCreatingBooking(false)

    if (error) {
      toast.error(error.message || 'No se pudo crear el booking')
      return null
    }

    const { data, error: selectError } = await supabase
      .from('bookings')
      .select('id')
      .eq('shipping_instruction_id', routing.id)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (selectError) {
      toast.error(selectError.message || 'No se pudo crear el booking')
      return null
    }

    await recordOperationalEvent({
      eventType: 'Booking creado',
      notes: `Booking hijo creado para ${routing.routing_number}`,
      metadata: {
        routing_number: routing.routing_number,
        booking_id: data.id,
      },
    })

    await loadBookings()

    return data as { id: string }
  }

  const handleCreateBookingChild = async () => {
    const newBooking = await createBookingChild()
    if (!routing || !newBooking) return

    router.push(`/operations/shipping-instructions/${routing.id}/bookings/${newBooking.id}`)
  }

  const handleOpenBooking = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para crear o abrir booking desde esta Shipping Instruction')
      return
    }

    if (bookings.length === 1) {
      router.push(`/operations/shipping-instructions/${routing.id}/bookings/${bookings[0].id}`)
      return
    }

    if (bookings.length > 1) {
      bookingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      toast.info('Selecciona el booking que deseas abrir')
      return
    }

    const newBooking = await createBookingChild()
    if (!newBooking) return

    router.push(`/operations/shipping-instructions/${routing.id}/bookings/${newBooking.id}`)
  }

  const handlePrintRoutingPdf = async () => {
    if (!routing) return

    const blob = await pdf(
      <ShippingInstructionOrderPDF
        routing={routing}
        quotation={routing.quotation}
        cliente={routing.quotation?.cliente || routing.cliente}
        selectedAgent={selectedAgent}
      />
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')

    await recordOperationalEvent({
      eventType: 'Routing PDF generado',
      notes: `Routing PDF generado para ${routing.routing_number}`,
      metadata: {
        routing_number: routing.routing_number,
      },
    })
  }

  useEffect(() => {
    loadRouting()
    loadBookings()
  }, [id])

  useEffect(() => {
    if (canManageRouting) {
      loadOperationsUsers()
    }
  }, [canManageRouting])

  useEffect(() => {
    if (routing) {
      loadOperationalTimeline(routing, bookings)
    }
  }, [routing?.id, routing?.quotation_id, routing?.routing_number, bookings.map((booking) => booking.id).join('|')])

  if (loading || userLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando Shipping Instructions...</p>
  }

  if (!routing) {
    return <p className="text-sm text-red-500">Shipping Instructions no encontradas.</p>
  }

  if (!canViewRouting) {
    return <p className="text-sm text-red-500">No tienes permisos para ver esta Shipping Instruction.</p>
  }

  const inputClassName =
    'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900'

  const updateRouting = (field: keyof ShippingInstruction, value: string) => {
    const isSalesInitialInfoField = salesInitialInfoFields.includes(
      field as SalesInitialInfoField
    )

    if (isSalesInitialInfoField && !canEditSupplierInfo) {
      return
    }

    if (
      !isSalesInitialInfoField &&
      (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED)
    ) {
      return
    }

    if (!isSalesInitialInfoField && !canManageRouting) {
      return
    }

    setRouting({
      ...routing,
      [field]: value,
    })
  }

  const isRoutingFinalized =
    routing.shipment_status === 'Finalizado' ||
    routing.operational_status === 'Finalizado'
  const isRoutingCancelled =
    routing.shipment_status === SI_CANCELLED ||
    routing.operational_status === SI_CANCELLED
  const canCancelRouting =
    canManageRouting &&
    bookings.length === 0 &&
    !isRoutingFinalized &&
    !isRoutingCancelled
  const canCreateBooking =
    canManageRouting && !isRoutingCancelled && routing.operational_status === SI_READY_FOR_BOOKING

  const hasBooking =
    bookings.length > 0 ||
    !!routing.booking_number ||
    routing.operational_status === 'En Booking'

  const quotation = routing.quotation || {}
  const quotationId = routing.quotation_id || quotation.id
  const quotationHref = quotationId ? `/quotations/${quotationId}` : null
  const quotationNumber =
    routing.quotation?.quotation_number || routing.quotation_number || 'N/A'
  const referenceFreeDays =
    selectedAgent?.free_days_destination ||
    selectedAgent?.free_days ||
    selectedAgent?.dias_libres ||
    routing.free_days_destination ||
    routing.free_days ||
    'N/A'
  const referenceEtd = selectedAgent?.etd || routing.etd
  const referenceTransit =
    selectedAgent?.transit_time ||
    selectedAgent?.transit ||
    routing.transit_time ||
    routing.transit ||
    'N/A'
  const referenceTransshipment =
    selectedAgent?.transshipment ||
    selectedAgent?.transbordo ||
    routing.transshipment ||
    'N/A'
  const referenceDeliveryAddress =
    quotation.delivery_address ||
    quotation.direccion_entrega ||
    routing.cliente?.direccion ||
    'No especificada'
  const referenceInternalNotes =
    quotation.pricing_notes ||
    quotation.notes ||
    quotation.observaciones ||
    'N/A'
  const referenceClientNotes = quotation.client_notes || 'N/A'
  const canDownloadRoutingPdf =
    canManageRouting || (profile?.rol === 'Ventas' && routing.created_by === user?.id)
  const routingPdfFileName = `SI-${routing.routing_number || 'shipping-instruction'}.pdf`
  const aggregateBookingStatus = getRoutingAggregateStatus(bookings)
  const assignedContainerTotal = countAssignedBookingContainers(bookings)
  const containerAssignmentSummary =
    quotedContainerTotal > 0
      ? `${assignedContainerTotal} / ${quotedContainerTotal}`
      : `${assignedContainerTotal} / N/A`
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: 'Shipping Instructions', href: '/operations/shipping-instructions' },
          { label: routing.routing_number || 'Detalle' },
        ]}
      />

      <div className="mb-6 mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Shipping Instructions {routing.routing_number}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Validación operativa previa al booking.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {canDownloadRoutingPdf && (
            <>
              <PDFDownloadLink
                document={
                    <ShippingInstructionOrderPDF
                      routing={routing}
                      quotation={routing.quotation}
                      cliente={routing.quotation?.cliente || routing.cliente}
                      selectedAgent={selectedAgent}
                    />
                }
                fileName={routingPdfFileName}
                className="flex h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {({ loading }) => (
                  <>
                    <Download className="h-4 w-4" />
                    {loading ? 'Generando...' : 'Descargar SI PDF'}
                  </>
                )}
              </PDFDownloadLink>

              <button
                type="button"
                onClick={handlePrintRoutingPdf}
                className="flex h-9 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <Printer className="h-4 w-4" />
                Imprimir SI
              </button>
            </>
          )}

          {canManageRouting && !isRoutingCancelled && (
            <button
              type="button"
              onClick={syncRoutingFromPricing}
              disabled={refreshingPricingData}
              className="flex h-9 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${refreshingPricingData ? 'animate-spin' : ''}`} />
              {refreshingPricingData ? 'Sincronizando...' : 'Actualizar desde Pricing'}
            </button>
          )}

          {canManageRouting && !isRoutingCancelled && (
            <select
              value={routing.operations_assigned_to || ''}
              onChange={(e) => assignOperationsUser(e.target.value)}
              disabled={assigning}
              className="h-9 min-w-[200px] rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Sin asignar</option>
              {operationsUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Datos de Cotización
          </h2>

          {quotationHref && (
            <Link
              href={quotationHref}
              className={`${secondaryButtonClass} inline-flex items-center justify-center gap-2 px-4 py-2`}
            >
              Ver cotización
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <InfoContent label="No. Cotización">
            {quotationHref ? (
              <Link
                href={quotationHref}
                className="inline-flex items-center gap-1 text-slate-900 transition hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400"
              >
                {quotationNumber}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : (
              quotationNumber
            )}
          </InfoContent>
          <Info
            label="Cliente"
            value={routing.cliente?.nombre || routing.client_name || 'N/A'}
          />
          <Info
            label="Incoterm"
            value={routing.quotation?.incoterm || routing.incoterm || 'N/A'}
          />
          <Info label="Negociación" value={routing.freight_terms} />
          <InfoContent label="Carrier / Naviera">
            {routing.carrier ? (
              <CarrierBadge code={routing.carrier} showName size="sm" />
            ) : (
              'N/A'
            )}
          </InfoContent>
          <Info label="Agente" value={routing.agent_name} />
          <Info
            label="Puerto Origen"
            value={routing.quotation?.puerto_origen || routing.origin_address || 'N/A'}
          />
          <Info
            label="Puerto Destino"
            value={routing.quotation?.puerto_destino || routing.destination_address || 'N/A'}
          />
          <Info
            label="Contenedores"
            value={formatContainerSummary(routing)}
          />
          <Info label="Días libres" value={referenceFreeDays} />
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Información Operativa de Referencia
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Info
            label="ETD"
            value={referenceEtd ? formatDisplayDate(referenceEtd) : 'N/A'}
          />
          <Info label="Días tránsito" value={referenceTransit} />
          <Info label="Días libres" value={referenceFreeDays} />
          <Info label="Transbordo" value={referenceTransshipment} />
          <Info
            label="Dirección de entrega"
            value={referenceDeliveryAddress}
          />
          <Info label="Observaciones internas" value={referenceInternalNotes} />
          <Info
            label="Observaciones para cliente/PDF"
            value={referenceClientNotes}
          />
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="grid gap-4 md:grid-cols-3">
          <Info label="Estado operativo" value={routing.operational_status || 'N/A'} />
          <Info label="Estado embarque" value={routing.shipment_status || 'N/A'} />
          <Info
            label="Envío a Operaciones"
            value={
              routing.sales_submitted_at
                ? `Enviada a Operaciones el ${formatDisplayDate(routing.sales_submitted_at)}`
                : profile?.rol === 'Ventas'
                  ? 'Completa la información inicial del proveedor y envíala a Operaciones.'
                  : 'Pendiente'
            }
          />
        </div>
      </section>

      <section
        ref={bookingsSectionRef}
        className="mb-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Bookings asociados
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Bookings hijos vinculados a esta Shipping Instruction.
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Los bookings se crean por Operaciones cuando la naviera/agente confirma espacio.
            </p>
          </div>

          {canManageRouting && !isRoutingCancelled && (
            <button
              type="button"
              onClick={handleCreateBookingChild}
              disabled={creatingBooking}
              className={`${primaryButtonClass} inline-flex items-center justify-center gap-2 px-4 py-2`}
            >
              <Plus className="h-4 w-4" />
              {creatingBooking ? 'Creando...' : 'Nuevo Booking'}
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Estado agregado de bookings
            </p>
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingStatusBadgeClass(
                aggregateBookingStatus
              )}`}
            >
              {aggregateBookingStatus}
            </span>
          </div>
          <Info label="Total bookings" value={bookings.length === 0 ? '0' : bookings.length} />
          <Info
            label="Contenedores asignados / total cotizado"
            value={containerAssignmentSummary}
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          {bookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {canManageRouting
                  ? 'No hay bookings asociados.'
                  : 'No hay bookings creados todavía.'}
              </p>
              {canManageRouting && !isRoutingCancelled && (
                <button
                  type="button"
                  onClick={handleCreateBookingChild}
                  disabled={creatingBooking}
                  className={`${primaryButtonClass} mt-4 inline-flex items-center justify-center gap-2 px-4 py-2`}
                >
                  <Plus className="h-4 w-4" />
                  {creatingBooking ? 'Creando...' : 'Nuevo Booking'}
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 pr-4">Booking</th>
                  <th className="pr-4">Carrier Booking</th>
                  <th className="pr-4">Master BL</th>
                  <th className="pr-4">House BL</th>
                  <th className="pr-4">Estado</th>
                  <th className="pr-4">ETD</th>
                  <th className="pr-4">ETA</th>
                  <th className="pr-4">Dias libres</th>
                  <th className="pr-4">Contenedores</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">
                      {booking.booking_number || 'Sin booking'}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {booking.carrier_booking || 'N/A'}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {booking.master_bl || 'N/A'}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {booking.house_bl || 'N/A'}
                    </td>
                    <td className="pr-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingStatusBadgeClass(
                          booking.shipment_status
                        )}`}
                      >
                        {booking.shipment_status || 'N/A'}
                      </span>
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {formatDisplayDate(booking.etd)}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {formatDisplayDate(booking.eta)}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {booking.free_days ?? 'N/A'}
                    </td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">
                      {formatBookingContainers(booking.booking_containers)}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/operations/shipping-instructions/${routing.id}/bookings/${booking.id}`}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {!canManageRouting && canSalesEditInitialInfo && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
          Completa la información inicial del proveedor y envíala a Operaciones.
        </div>
      )}

      {!canManageRouting && routing.sales_submitted_at && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Información enviada a Operaciones. Ventas ya no puede modificar esta Shipping Instruction.
        </div>
      )}

      {!canManageRouting && !canSalesEditInitialInfo && !routing.sales_submitted_at && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          Modo lectura: Ventas puede consultar la Shipping Instruction creada, pero las acciones operativas son de Operaciones/Admin.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Proveedor / Shipper Contact
          </h2>

          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Proveedor
              </label>
              <input
                value={routing.supplier_name || ''}
                onChange={(e) => updateRouting('supplier_name', e.target.value)}
                disabled={!canEditSupplierInfo}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Contacto
              </label>
              <input
                value={routing.supplier_contact || ''}
                onChange={(e) => updateRouting('supplier_contact', e.target.value)}
                disabled={!canEditSupplierInfo}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Email
              </label>
              <input
                value={routing.supplier_email || ''}
                onChange={(e) => updateRouting('supplier_email', e.target.value)}
                disabled={!canEditSupplierInfo}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Teléfono
              </label>
              <input
                value={routing.supplier_phone || ''}
                onChange={(e) => updateRouting('supplier_phone', e.target.value)}
                disabled={!canEditSupplierInfo}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Dirección
              </label>
              <input
                value={routing.supplier_address || ''}
                onChange={(e) => updateRouting('supplier_address', e.target.value)}
                disabled={!canEditSupplierInfo}
                className={inputClassName}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Comentarios / Remarks
          </h2>

          <textarea
            value={routing.sales_observations || ''}
            onChange={(e) => updateRouting('sales_observations', e.target.value)}
            disabled={!canEditSupplierInfo}
            rows={10}
            placeholder="Notas comerciales, instrucciones del cliente, información adicional del proveedor..."
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </section>

        {canManageRouting && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Instrucciones BL
            </h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Freight Terms
                </label>

                <select
                  value={routing.freight_terms || ''}
                  onChange={(e) =>
                    setRouting({
                      ...routing,
                      freight_terms: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Seleccionar</option>
                  <option value="Collect">Collect</option>
                  <option value="Prepaid">Prepaid</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Release Type
                </label>

                <select
                  value={routing.release_type || ''}
                  onChange={(e) =>
                    setRouting({
                      ...routing,
                      release_type: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Seleccionar</option>
                  <option value="Express Release">Express Release</option>
                  <option value="Original BL">Original BL</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  HBL Freight Visibility
                </label>

                <select
                  value={routing.hbl_freight_visibility || ''}
                  onChange={(e) =>
                    setRouting({
                      ...routing,
                      hbl_freight_visibility: e.target.value,
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Seleccionar</option>
                  <option value="No Freight Charges">
                    No mostrar flete
                  </option>
                  <option value="Show Freight Charges">
                    Mostrar flete
                  </option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  checked={routing.printed_at_destination || false}
                  onChange={(e) =>
                    setRouting({
                      ...routing,
                      printed_at_destination: e.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300"
                />

                <label className="text-sm text-slate-700 dark:text-slate-300">
                  Printed at destination
                </label>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Insurance
                </label>

                <select
                  value={routing.insurance_requested ? 'Yes' : 'No'}
                  onChange={(e) =>
                    setRouting({
                      ...routing,
                      insurance_requested: e.target.value === 'Yes',
                    })
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
          </section>
        )}

        <section className="hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] lg:col-span-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Shipping Instructions
          </h2>

          <div className="mt-4 grid gap-3 text-sm lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Shipper
              </label>
              <input
                value={routing.shipper || ''}
                onChange={(e) => updateRouting('shipper', e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Consignee
              </label>
              <input
                value={routing.consignee || ''}
                onChange={(e) => updateRouting('consignee', e.target.value)}
                className={inputClassName}
              />
            </div>

            <input
              value={routing.consignee_tax_id || ''}
              onChange={(e) => setRouting({ ...routing, consignee_tax_id: e.target.value })}
              placeholder="RTN / Tax ID Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_address || ''}
              onChange={(e) => setRouting({ ...routing, consignee_address: e.target.value })}
              placeholder="Dirección Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_contact || ''}
              onChange={(e) => setRouting({ ...routing, consignee_contact: e.target.value })}
              placeholder="Contacto Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_email || ''}
              onChange={(e) => setRouting({ ...routing, consignee_email: e.target.value })}
              placeholder="Email Consignee"
              className={inputClassName}
            />

            <input
              value={routing.consignee_phone || ''}
              onChange={(e) => setRouting({ ...routing, consignee_phone: e.target.value })}
              placeholder="Teléfono Consignee"
              className={inputClassName}
            />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">
                Notify Party
              </label>
              <input
                value={routing.notify_party || ''}
                onChange={(e) => updateRouting('notify_party', e.target.value)}
                className={inputClassName}
              />
            </div>

            <input
              value={routing.notify_party_tax_id || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_tax_id: e.target.value })}
              placeholder="RTN / Tax ID Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_address || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_address: e.target.value })}
              placeholder="Dirección Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_contact || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_contact: e.target.value })}
              placeholder="Contacto Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_email || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_email: e.target.value })}
              placeholder="Email Notify Party"
              className={inputClassName}
            />

            <input
              value={routing.notify_party_phone || ''}
              onChange={(e) => setRouting({ ...routing, notify_party_phone: e.target.value })}
              placeholder="Teléfono Notify Party"
              className={inputClassName}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          {canCancelRouting && (
            <button
              type="button"
              onClick={() => setCancelDialogOpen(true)}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              Cancelar SI
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isRoutingCancelled && (
            <span className="inline-flex items-center rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
              Cancelada
            </span>
          )}

          {isRoutingFinalized && !isRoutingCancelled && (
            <span className="inline-flex items-center rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              ✓ Finalizado
            </span>
          )}

          {canSalesEditInitialInfo && (
            <button
              type="button"
              onClick={() => saveSalesInitialInfo(true)}
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {saving ? 'Enviando...' : 'Enviar a Operaciones'}
            </button>
          )}

          {canManageRouting && !isRoutingCancelled && (
            <>
              {routing.operational_status !== SI_READY_FOR_BOOKING &&
                routing.shipment_status !== SI_VALIDATED && (
                  <button
                    type="button"
                    onClick={validateRouting}
                    disabled={validating}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {validating ? 'Validando...' : 'Validar SI'}
                  </button>
                )}

              {(routing.operational_status === SI_READY_FOR_BOOKING ||
                routing.shipment_status === SI_VALIDATED) && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Listo para Booking
                </span>
              )}

              {!isRoutingFinalized && (
                <button
                  type="button"
                  onClick={finalizeRouting}
                  disabled={finalizing}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {finalizing ? 'Finalizando...' : 'Finalizar SI'}
                </button>
              )}

              {(canCreateBooking || hasBooking) && (
                <button
                  type="button"
                  onClick={handleOpenBooking}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {hasBooking ? 'Abrir Booking' : 'Crear Booking'}
                </button>
              )}

              <button
                type="button"
                onClick={saveRouting}
                disabled={saving || isRoutingCancelled}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {saving ? 'Guardando...' : 'Guardar SI'}
              </button>
            </>
          )}
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Timeline Operativo ({operationalEvents.length} eventos)
          </h2>

          {shouldShowTimelineToggle && (
            <button
              type="button"
              onClick={() => setIsTimelineExpanded((current) => !current)}
              className={`${secondaryButtonClass} inline-flex items-center justify-center px-4 py-2 text-sm`}
            >
              {isTimelineExpanded ? 'Ocultar historial' : 'Ver historial completo'}
            </button>
          )}
        </div>

        <div className="mt-5">
          {operationalEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Aún no hay eventos operativos registrados.
              </p>
            </div>
          ) : (
            <div className="relative space-y-4">
              <div className="absolute bottom-4 left-3 top-4 w-px bg-slate-200 dark:bg-slate-800" />
              {visibleOperationalEvents.map((event) => {
                const formattedEvent = formatOperationalEvent(event)

                return (
                  <div
                    key={event.id}
                    className="relative pl-9"
                  >
                    <span className="absolute left-0 top-5 h-6 w-6 rounded-full border-4 border-white bg-blue-600 shadow-sm dark:border-[#0b1220]" />
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {formattedEvent.title}
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {formattedEvent.description}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                          {new Date(event.date).toLocaleString('es-HN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {event.userName && (
                          <span className="rounded-full bg-white px-2 py-1 dark:bg-slate-900">
                            Usuario: {event.userName}
                          </span>
                        )}
                        {event.bookingLabel && (
                          <span className="rounded-full bg-white px-2 py-1 dark:bg-slate-900">
                            Booking: {event.bookingLabel}
                          </span>
                        )}
                        {formattedEvent.metadataSummary?.map((detail) => (
                          <span
                            key={detail}
                            className="rounded-full bg-white px-2 py-1 dark:bg-slate-900"
                          >
                            {detail}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open)

          if (!open && !cancelling) {
            setCancelReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar Shipping Instruction</DialogTitle>
            <DialogDescription>
              Esta acción marcará la Shipping Instruction como cancelada. No eliminará la cotización ni los datos operativos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Motivo de cancelación
            </label>
            <textarea
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Ej. Cliente canceló la operación antes de confirmar booking."
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelling}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={cancelRouting}
              disabled={cancelling}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {cancelling ? 'Cancelando...' : 'Confirmar cancelación'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
