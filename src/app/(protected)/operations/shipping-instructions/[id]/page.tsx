'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { CustomsServicePanel } from '@/src/components/operations/CustomsServicePanel'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Info as InfoIcon,
  Lock,
  MessageSquareText,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Ship,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react'
import { PdfDownloadButton } from '@/src/components/pdf/PdfDownloadButton'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { createNotification } from '@/src/lib/notifications'
import { supabase } from '@/src/lib/supabase/client'
import { aggregateBookingStatus as deriveBookingAggregateStatus } from '@/src/lib/booking-status'
import {
  loadShipmentContext,
  type ShipmentContext,
} from '@/src/lib/shipment-service'
import { secondaryButtonClass } from '@/src/lib/ui-classes'
import { cn } from '@/src/lib/utils'
import { FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { CostNotice } from '@/src/components/pricing/CostStatus'
import {
  OperationSaveBar,
  OperationSectionTitle,
  OperationStatusBadge,
  OperationStepper,
  operationDangerButtonClass,
  operationDangerSolidButtonClass,
  operationPrimaryButtonClass,
  operationSecondaryButtonClass,
  operationStatusPresentation,
  type OperationStep,
} from '@/src/components/operations/OperationsWorkspace'
import { UnsavedChangesGuard } from '@/src/components/ui/UnsavedChangesGuard'
import { resolveShippingInstructionStatus } from '@/src/lib/operation-status'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { CreateContextTaskDialog } from '@/src/components/tasks/CreateContextTaskDialog'
import { SectionNav } from '@/src/components/ui/SectionNav'
import { CarrierBadge } from '@/src/components/ui/CarrierBadge'
import ShippingInstructionOrderPDF from '@/src/components/pdf/shipping-instruction-order-pdf'
import {
  type CompanyBranding,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import { OperationDialogContent } from '@/src/components/operations/OperationDialog'
import { formatDate } from '@/src/lib/format'
import { operationsReturnHref } from '@/src/lib/operations-navigation'
import { loadCurrentCompanySettings } from '@/src/lib/company-settings'
import {
  getShippingInstructionClient,
  getShippingInstructionHandoffAccess,
  mergeShippingInstructionMutation,
} from '@/src/lib/shipping-instruction-state'

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
const SI_VALIDATED = 'Validada'
const SI_CANCELLED = 'Cancelada'

function isShippingInstructionVersionConflict(error: {
  code?: string
  message?: string
}) {
  return (
    error.code === '40001' ||
    error.message?.includes('SHIPPING_INSTRUCTION_VERSION_CONFLICT')
  )
}

const shippingInstructionSections = [
  { href: '#si-overview' as const, label: 'Resumen' },
  { href: '#si-bookings' as const, label: 'Bookings' },
  { href: '#si-information' as const, label: 'Información' },
  { href: '#si-timeline' as const, label: 'Historial' },
]

type ShippingInstruction = {
  id: string
  routing_number: string
  status: string
  shipment_status: string
  operational_status: string | null
  created_by: string | null
  operations_assigned_to: string | null
  operations_accepted_at: string | null
  operations_accepted_by: string | null
  quotation_id?: string | null
  // Compatibility shape consumed by the existing PDF and legacy detail fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cliente?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  updated_at: string | null
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

// Campos que el usuario puede editar en esta pantalla; definen "cambios sin guardar".
const editableRoutingFields = [
  'supplier_name', 'supplier_contact', 'supplier_email', 'supplier_phone',
  'supplier_address', 'freight_terms', 'release_type', 'hbl_freight_visibility',
  'printed_at_destination', 'insurance_requested', 'sales_observations',
  'special_instructions',
] as const

function routingSnapshot(routing: object | null) {
  if (!routing) return ''
  const values = routing as Record<string, unknown>
  return JSON.stringify(editableRoutingFields.map((field) => values[field] ?? null))
}

type RoutingPrimaryAction = {
  kind: 'submit' | 'accept' | 'validate' | 'finalize' | 'booking'
  label: string
  icon: LucideIcon
  disabled: boolean
  title?: string
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
        {value || '—'}
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
  return formatDate(date, 'N/A')
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
    shipping_instruction_accepted: { icon: '✅', title: 'Expediente aceptado por Operaciones' },
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
  const returnHref = typeof window === 'undefined'
    ? '/operations/shipping-instructions'
    : operationsReturnHref(
        new URLSearchParams(window.location.search).get('returnTo')
      )
  const bookingsSectionRef = useRef<HTMLElement | null>(null)
  const { user, profile, loading: userLoading } = useUser()

  const [routing, setRouting] = useState<ShippingInstruction | null>(null)
  const [shipmentContext, setShipmentContext] = useState<ShipmentContext | null>(null)
  // Selected agent quotes still expose legacy columns without a generated type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [operationalEvents, setOperationalEvents] = useState<OperationalTimelineEvent[]>([])
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false)
  const [quotedContainerTotal, setQuotedContainerTotal] = useState(0)
  const [operationsUsers, setOperationsUsers] = useState<OperationsUser[]>([])
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [creatingBooking, setCreatingBooking] = useState(false)
  const [refreshingPricingData, setRefreshingPricingData] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding>(normalizeCompanyBranding(null))

  const bookingDetailHref = (targetBookingId: string) => {
    const path = `/operations/shipping-instructions/${id}/bookings/${targetBookingId}`
    return returnHref.startsWith('/operations/dashboard')
      ? `${path}?returnTo=${encodeURIComponent(returnHref)}`
      : path
  }

  const canManageRouting = profile?.rol === 'Admin' || profile?.rol === 'Operaciones'
  const canViewRouting =
    !!routing && (canManageRouting || routing.created_by === user?.id)
  const { canSubmit: canSalesEditInitialInfo, canAccept: canAcceptHandoff } =
    getShippingInstructionHandoffAccess(profile?.rol, user?.id, routing)
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
  const assignedOperationsUser = operationsUsers.find(
    (operationsUser) => operationsUser.id === routing?.operations_assigned_to
  )
  const assignedOperationsName = assignedOperationsUser
    ? `${assignedOperationsUser.nombre || ''} ${assignedOperationsUser.apellido || ''}`.trim()
      || assignedOperationsUser.email
      || 'Operativo asignado'
    : routing?.operations_assigned_to === user?.id && profile?.rol === 'Admin'
      ? 'Administrador (tú)'
      : routing?.operations_assigned_to
      ? 'Operativo asignado'
      : 'Sin asignar'

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
      try {
        setShipmentContext(await loadShipmentContext(data.id))
      } catch (shipmentError) {
        toast.error('No se pudo cargar el shipment canónico', {
          description:
            shipmentError instanceof Error ? shipmentError.message : undefined,
        })
        setShipmentContext(null)
      }

      const { data: companyData } = await loadCurrentCompanySettings(supabase)

      setCompanyBranding(normalizeCompanyBranding(companyData))

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
      setSavedSnapshot(routingSnapshot(data))
    }

    setLoading(false)
    return !error && data ? (data as ShippingInstruction) : null
  }

  // Aplica la fila devuelta por una RPC y marca sus valores como guardados.
  const applyRoutingMutation = (updated: ShippingInstruction) => {
    setRouting((current) => mergeShippingInstructionMutation(current, updated))
    setSavedSnapshot(routingSnapshot(updated))
    return mergeShippingInstructionMutation(routing, updated)
  }

  const syncRoutingFromPricing = async () => {
    if (!routing?.id || !routing.quotation_id || refreshingPricingData) return

    setRefreshingPricingData(true)

    try {
      const { data, error } = await supabase.rpc(
        'sync_shipping_instruction_from_selected_agent_quote_v2',
        {
          p_shipping_instruction_id: routing.id,
          p_reason: 'Actualizacion manual desde Shipping Instruction',
        }
      )

      if (error) {
        toast.error(error.message || 'No se pudo sincronizar la Shipping Instruction')
        return
      }

      const result = (
        data as Array<{
          updated_bookings?: number
          skipped_count?: number
        }> | null
      )?.[0]
      const updatedBookings = result?.updated_bookings ?? 0
      const skippedBookings = result?.skipped_count ?? 0

      toast.success(
        updatedBookings > 0
          ? `Información sincronizada desde Pricing: ${updatedBookings} booking${updatedBookings === 1 ? '' : 's'} actualizado${updatedBookings === 1 ? '' : 's'}${skippedBookings > 0 ? `, ${skippedBookings} omitido${skippedBookings === 1 ? '' : 's'}` : ''}`
          : skippedBookings > 0
            ? `SI sincronizada desde Pricing; ${skippedBookings} booking${skippedBookings === 1 ? '' : 's'} omitido${skippedBookings === 1 ? '' : 's'}`
            : 'Información sincronizada desde Pricing'
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
      // Supabase returns this legacy event table without generated row types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // The embedded profile relation is polymorphic in the generated response.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    if (!routing) return

    try {
      const { error } = await supabase.rpc('record_operational_event', {
        p_shipping_instruction_id: routing.id,
        p_booking_id: null,
        p_booking_container_id: null,
        p_event_code: 'OPERATIONAL_NOTE',
        p_event_label: eventType,
        p_occurred_at: new Date().toISOString(),
        p_location: null,
        p_notes: notes,
        p_metadata: metadata || {},
      })

      if (error) throw error
    } catch {
      // event creation failure is non-fatal
    }
  }

  const saveRouting = async (): Promise<ShippingInstruction | null | undefined> => {
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

    const { data, error } = await supabase.rpc(
      'save_shipping_instruction_operations_details',
      {
        p_shipping_instruction_id: routing.id,
        p_expected_updated_at: routing.updated_at,
        p_changes: {
          supplier_name: routing.supplier_name,
          supplier_contact: routing.supplier_contact,
          supplier_email: routing.supplier_email,
          supplier_phone: routing.supplier_phone,
          supplier_address: routing.supplier_address,

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
        },
      }
    )

    setSaving(false)

    if (error) {
      toast.error(
        isShippingInstructionVersionConflict(error)
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de guardar.'
          : error.message || 'No se pudieron guardar las Shipping Instructions'
      )
      return
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null

    const updated = result?.shipping_instruction
      ? applyRoutingMutation(result.shipping_instruction)
      : await loadRouting()

    toast.success('Cambios guardados')
    return updated
  }

  const saveSalesInitialInfo = async (submitToOperations = false): Promise<ShippingInstruction | null | undefined> => {
    if (!routing) return
    if (!canSalesEditInitialInfo) {
      toast.error('No tienes permisos para editar esta información')
      return
    }

    setSaving(true)

    const { data, error } = await supabase.rpc(
      'save_shipping_instruction_sales_initial',
      {
        p_shipping_instruction_id: routing.id,
        p_expected_updated_at: routing.updated_at,
        p_changes: {
          supplier_name: routing.supplier_name,
          supplier_contact: routing.supplier_contact,
          supplier_email: routing.supplier_email,
          supplier_phone: routing.supplier_phone,
          supplier_address: routing.supplier_address,
          sales_observations: routing.sales_observations,
          special_instructions: routing.special_instructions,
        },
        p_submit_to_operations: submitToOperations,
      }
    )

    setSaving(false)

    if (error) {
      toast.error(
        isShippingInstructionVersionConflict(error)
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de guardar.'
          : error.message || 'No se pudo guardar la información inicial'
      )
      return
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null

    const updated = result?.shipping_instruction
      ? applyRoutingMutation(result.shipping_instruction)
      : await loadRouting()
    toast.success(
      submitToOperations
        ? 'Información enviada a Operaciones'
        : 'Información inicial guardada'
    )
    return updated
  }

  const validateRouting = async (target: ShippingInstruction | null = routing) => {
    const routing = target
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para validar esta Shipping Instruction')
      return
    }
    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction está cancelada')
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
    if (!routing.operations_accepted_at || !routing.operations_accepted_by) {
      toast.error('Acepta formalmente el expediente antes de validarlo')
      return
    }

    setValidating(true)

    const { data, error } = await supabase.rpc('validate_shipping_instruction', {
      p_shipping_instruction_id: routing.id,
      p_expected_updated_at: routing.updated_at,
    })

    setValidating(false)

    if (error) {
      toast.error(
        isShippingInstructionVersionConflict(error)
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de validar.'
          : error.message || 'No se pudo validar la Shipping Instruction'
      )
      return
    }

    if (routing.created_by) {
      await createNotification({
        userId: routing.created_by,
        title: 'Shipping Instructions validadas',
        message: `Operaciones validó la Shipping Instruction ${routing.routing_number}`,
        type: 'success',
      })
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null

    if (result?.shipping_instruction) {
      applyRoutingMutation(result.shipping_instruction!)
    } else {
      await loadRouting()
    }

    toast.success('Shipping Instructions listas para booking')
  }

  const acceptOperationsHandoff = async (target: ShippingInstruction | null = routing) => {
    const routing = target
    if (!routing || !canAcceptHandoff) return

    setAccepting(true)
    const { data, error } = await supabase.rpc(
      'accept_shipping_instruction_handoff',
      {
        p_shipping_instruction_id: routing.id,
        p_expected_updated_at: routing.updated_at,
      }
    )
    setAccepting(false)

    if (error) {
      toast.error(
        isShippingInstructionVersionConflict(error)
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de aceptar.'
          : error.message || 'No se pudo aceptar el expediente'
      )
      return
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null

    if (result?.shipping_instruction) {
      applyRoutingMutation(result.shipping_instruction!)
    } else {
      await loadRouting()
    }
    await loadOperationalTimeline(routing, bookings)
    toast.success('Expediente aceptado; ahora puedes validarlo')
  }

  const assignOperationsUser = async (userId: string, target: ShippingInstruction | null = routing) => {
    const routing = target
    if (!routing) return

    if (!canManageRouting) {
      toast.error('No tienes permisos para asignar esta Shipping Instruction')
      return
    }

    setAssigning(true)

    const { data, error } = await supabase.rpc('assign_shipping_instruction', {
      p_shipping_instruction_id: routing.id,
      p_operations_user_id: userId || null,
      p_expected_updated_at: routing.updated_at,
    })

    setAssigning(false)

    if (error) {
      toast.error(
        isShippingInstructionVersionConflict(error)
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de asignar.'
          : error.message || 'No se pudo asignar el operativo'
      )
      return
    }

    if (userId) {
      await createNotification({
        userId,
        title: 'Shipping Instructions asignadas',
        message: `Se te asignó la Shipping Instruction ${routing.routing_number}`,
        type: 'info',
      })
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null

    if (result?.shipping_instruction) {
      applyRoutingMutation(result.shipping_instruction!)
    } else {
      await loadRouting()
    }

    toast.success('Operativo asignado')
  }

  const finalizeRouting = async (target: ShippingInstruction | null = routing) => {
    const routing = target
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para finalizar esta Shipping Instruction')
      return
    }
    if (routing.shipment_status === SI_CANCELLED || routing.operational_status === SI_CANCELLED) {
      toast.error('Esta Shipping Instruction está cancelada')
      return
    }

    setFinalizing(true)

    const { data, error } = await supabase.rpc(
      'finalize_shipping_instruction_canonical',
      {
        p_shipping_instruction_id: routing.id,
        p_expected_updated_at: routing.updated_at,
      }
    )

    setFinalizing(false)

    if (error) {
      const conflict =
        error.code === '40001' ||
        error.message?.includes('SHIPPING_INSTRUCTION_VERSION_CONFLICT')

      toast.error(
        conflict
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de finalizar.'
          : error.message || 'No se pudo finalizar la Shipping Instruction'
      )
      return
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null

    if (result?.shipping_instruction) {
      applyRoutingMutation(result.shipping_instruction!)
    } else {
      await loadRouting()
    }
    setShipmentContext(await loadShipmentContext(routing.id))
    await loadOperationalTimeline(routing, bookings)

    toast.success('Operación finalizada; Finanzas ya puede revisar costos')
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

    const { data, error } = await supabase.rpc('cancel_shipping_instruction', {
      p_shipping_instruction_id: routing.id,
      p_expected_updated_at: routing.updated_at,
      p_reason: reason,
    })

    setCancelling(false)

    if (error) {
      toast.error(
        isShippingInstructionVersionConflict(error)
          ? 'La Shipping Instruction cambió en otra sesión. Recarga antes de cancelar.'
          : error.message || 'No se pudo cancelar la Shipping Instruction'
      )
      return
    }

    const result = data as {
      shipping_instruction?: ShippingInstruction
    } | null
    const updatedRouting = result?.shipping_instruction || routing

    if (result?.shipping_instruction) {
      applyRoutingMutation(result.shipping_instruction!)
    } else {
      await loadRouting()
    }
    setShipmentContext(await loadShipmentContext(routing.id))
    await loadOperationalTimeline(updatedRouting, bookings)
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

    const { data, error } = await supabase.rpc(
      'create_booking_for_shipping_instruction',
      {
        p_shipping_instruction_id: routing.id,
      }
    )

    setCreatingBooking(false)

    if (error) {
      toast.error(error.message || 'No se pudo crear el booking')
      return null
    }

    const createdBooking = Array.isArray(data) ? data[0] : data
    if (!createdBooking?.id) {
      toast.error('El booking fue creado, pero no se recibió su identificador')
      return null
    }

    await loadBookings()

    toast.success('Booking creado')
    return createdBooking as { id: string }
  }

  const handleCreateBookingChild = async () => {
    const newBooking = await createBookingChild()
    if (!routing || !newBooking) return

    router.push(bookingDetailHref(newBooking.id))
  }

  const handleOpenBooking = async () => {
    if (!routing) return
    if (!canManageRouting) {
      toast.error('No tienes permisos para crear o abrir booking desde esta Shipping Instruction')
      return
    }

    if (bookings.length === 1) {
      router.push(bookingDetailHref(bookings[0].id))
      return
    }

    if (bookings.length > 1) {
      bookingsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      toast.info('Selecciona el booking que deseas abrir')
      return
    }

    const newBooking = await createBookingChild()
    if (!newBooking) return

    router.push(bookingDetailHref(newBooking.id))
  }

  const handlePrintRoutingPdf = async () => {
    if (!routing) return

    const blob = await pdf(
      <ShippingInstructionOrderPDF
        routing={routing}
        quotation={routing.quotation}
        cliente={getShippingInstructionClient(routing)}
        selectedAgent={selectedAgent}
        company={companyBranding}
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
    const timer = window.setTimeout(() => {
      void loadRouting()
      void loadBookings()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- Loaders refresh only when the route identity changes.

  useEffect(() => {
    if (!canManageRouting) return
    const timer = window.setTimeout(() => { void loadOperationsUsers() }, 0)
    return () => window.clearTimeout(timer)
  }, [canManageRouting])

  useEffect(() => {
    if (!routing) return
    const timer = window.setTimeout(() => {
      void loadOperationalTimeline(routing, bookings)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [routing?.id, routing?.quotation_id, routing?.routing_number, bookings.map((booking) => booking.id).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps -- Timeline identity is derived from stable row keys.

  if (loading || userLoading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando Shipping Instructions...</p>
  }

  if (!routing) {
    return <p className="text-sm text-red-500">Shipping Instructions no encontradas.</p>
  }

  if (!canViewRouting) {
    return <p className="text-sm text-red-500">No tienes permisos para ver esta Shipping Instruction.</p>
  }

  if (routing.quotation?.service_product === 'customs_only') {
    return <CustomsServicePanel key={routing.id} id={routing.id} number={routing.routing_number}
      status={routing.operational_status || 'Pendiente Validación'} updatedAt={routing.updated_at}
      quotation={routing.quotation} canManage={canManageRouting} reload={async () => { await loadRouting() }} />
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
    bookings.length > 0 || routing.operational_status === 'En Booking'

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
  const aggregateBookingStatus = deriveBookingAggregateStatus(bookings, 'Sin bookings')
  const assignedContainerTotal = countAssignedBookingContainers(bookings)
  const containerAssignmentSummary =
    quotedContainerTotal > 0
      ? `${assignedContainerTotal} / ${quotedContainerTotal}`
      : `${assignedContainerTotal} / N/A`
  const canSave = canManageRouting ? !isRoutingCancelled && !isRoutingFinalized : canSalesEditInitialInfo
  const isDirty = canSave && Boolean(savedSnapshot) && routingSnapshot(routing) !== savedSnapshot
  // Las acciones del servidor leen la fila guardada: se guarda primero lo editado.
  const runWithSavedRouting = async (action: (current: ShippingInstruction) => Promise<unknown>) => {
    let current: ShippingInstruction | null | undefined = routing
    if (isDirty) {
      current = await (canManageRouting ? saveRouting() : saveSalesInitialInfo(false))
      if (!current) return
    }
    await action(current)
  }
  const clientName = getShippingInstructionClient(routing)?.nombre || routing.client_name || 'Sin cliente'
  const originLabel = routing.quotation?.puerto_origen || routing.origin_address || 'Origen sin definir'
  const destinationLabel = routing.quotation?.puerto_destino || routing.destination_address || 'Destino sin definir'
  const displayStatus = isRoutingCancelled
    ? 'Cancelada'
    : isRoutingFinalized
      ? 'Finalizado'
      : shipmentContext?.shipment.derived_operational_status ||
        resolveShippingInstructionStatus(routing)
  const isValidated = Boolean(routing.validated_at) ||
    [SI_READY_FOR_BOOKING, 'En Booking'].includes(routing.operational_status || '') ||
    routing.shipment_status === SI_VALIDATED || bookings.length > 0 || isRoutingFinalized
  const bookingConfirmedStatuses = ['Booking Confirmado', 'Documentación Pendiente', 'Listo para Embarque', 'Embarcado', 'En Tránsito', 'Arribo Parcial', 'Arribado', 'Finalizado']
  const departedStatuses = ['Embarcado', 'En Tránsito', 'Arribo Parcial', 'Arribado', 'Finalizado']
  const arrivedStatuses = ['Arribado', 'Finalizado']
  const allBookingsClosed = bookings.length > 0 && aggregateBookingStatus === 'Finalizado'
  const stepDone = [
    Boolean(routing.sales_submitted_at) || Boolean(routing.operations_accepted_at) || isValidated,
    Boolean(routing.operations_accepted_at) || isValidated,
    isValidated,
    bookingConfirmedStatuses.includes(aggregateBookingStatus),
    departedStatuses.includes(aggregateBookingStatus),
    arrivedStatuses.includes(aggregateBookingStatus),
    isRoutingFinalized,
  ]
  const currentStepIndex = stepDone.findIndex((done) => !done)
  const operationSteps: OperationStep[] = [
    { label: 'Enviada a Operaciones', detail: routing.sales_submitted_at ? formatDisplayDate(routing.sales_submitted_at) : 'Ventas completa el proveedor' },
    { label: 'Aceptada', detail: routing.operations_accepted_at ? assignedOperationsName : 'Responsable de Operaciones' },
    { label: 'Validada', detail: isValidated ? 'Lista para booking' : 'Datos del proveedor completos' },
    { label: 'Booking confirmado', detail: bookings.length ? `${bookings.length} booking${bookings.length === 1 ? '' : 's'} · ${aggregateBookingStatus}` : 'Sin bookings' },
    { label: 'Embarcada', detail: 'Salida real registrada' },
    { label: 'Arribada', detail: 'Arribo real registrado' },
    { label: 'Cerrada', detail: isRoutingFinalized ? 'Finanzas puede revisar costos' : 'Cierre de la operación' },
  ].map((step, index) => ({
    ...step,
    state: stepDone[index]
      ? 'done'
      : index === currentStepIndex
        ? isRoutingCancelled ? 'blocked' : 'current'
        : 'pending',
  }))
  const primaryActionKind: RoutingPrimaryAction['kind'] | null =
    isRoutingCancelled || isRoutingFinalized
      ? null
      : canSalesEditInitialInfo
        ? 'submit'
        : !canManageRouting
          ? null
          : routing.sales_submitted_at && !routing.operations_accepted_at && canAcceptHandoff
            ? 'accept'
            : !isValidated
              ? 'validate'
              : allBookingsClosed
                ? 'finalize'
                : canCreateBooking || hasBooking
                  ? 'booking'
                  : null
  const primaryAction: RoutingPrimaryAction | null = primaryActionKind === 'submit'
    ? { kind: 'submit', label: saving ? 'Enviando...' : 'Enviar expediente a Operaciones', icon: Send, disabled: saving }
    : primaryActionKind === 'accept'
      ? { kind: 'accept', label: accepting ? 'Aceptando...' : profile?.rol === 'Admin' ? 'Aceptar y asumir expediente' : 'Aceptar expediente', icon: UserCheck, disabled: accepting }
      : primaryActionKind === 'validate'
        ? { kind: 'validate', label: validating ? 'Validando...' : 'Validar SI', icon: ShieldCheck, disabled: validating || !routing.operations_accepted_at, title: !routing.operations_accepted_at ? 'Acepta el expediente antes de validarlo' : undefined }
        : primaryActionKind === 'finalize'
          ? { kind: 'finalize', label: finalizing ? 'Finalizando...' : 'Finalizar operación', icon: CheckCircle2, disabled: finalizing }
          : primaryActionKind === 'booking'
            ? { kind: 'booking', label: creatingBooking ? 'Creando...' : hasBooking ? bookings.length > 1 ? 'Ver bookings' : 'Abrir booking' : 'Crear booking', icon: hasBooking ? ArrowRight : Plus, disabled: creatingBooking }
            : null
  const runPrimaryAction = (kind: RoutingPrimaryAction['kind']) => {
    if (kind === 'submit') return void saveSalesInitialInfo(true)
    if (kind === 'accept') return void runWithSavedRouting(acceptOperationsHandoff)
    if (kind === 'validate') return void runWithSavedRouting(validateRouting)
    if (kind === 'finalize') return void runWithSavedRouting(finalizeRouting)
    return void runWithSavedRouting(async () => { await handleOpenBooking() })
  }
  const PrimaryIcon = primaryAction?.icon
  const canFinalizeAsSecondary = canManageRouting && !isRoutingCancelled && !isRoutingFinalized && !allBookingsClosed && bookings.length > 0
  const statusTone = operationStatusPresentation(displayStatus).tone
  const noteLabelClass = 'text-xs font-semibold'

  return (
    <div>
      <UnsavedChangesGuard active={canSave} dirty={isDirty} />
      <Breadcrumbs
        items={[
          {
            label: returnHref.startsWith('/operations/dashboard')
              ? 'Control Tower'
              : 'Shipping Instructions',
            href: returnHref,
          },
          { label: routing.routing_number || 'Detalle' },
        ]}
      />

      <div className="mb-6 mt-4">
        <FinancePageHeader
          eyebrow="Operaciones · Shipping Instruction"
          icon={ClipboardList}
          title={<span className="flex flex-wrap items-center gap-3">SI {routing.routing_number}<OperationStatusBadge status={displayStatus} /></span>}
          description={<>{clientName} · {originLabel} → {destinationLabel}</>}
          actions={<>
            <CreateContextTaskDialog
              context={{
                entityType: 'shipping_instruction',
                entityId: routing.id,
                entityLabel: routing.routing_number || 'Shipping Instruction',
                sourceModule: 'operations',
                sourcePath: `/operations/shipping-instructions/${routing.id}`,
              }}
              suggestedTitle={`Revisar ${routing.routing_number || 'Shipping Instruction'}`}
            />
            {canDownloadRoutingPdf && (
              <>
                <PdfDownloadButton
                  document={
                    <ShippingInstructionOrderPDF
                      routing={routing}
                      quotation={routing.quotation}
                      cliente={getShippingInstructionClient(routing)}
                      selectedAgent={selectedAgent}
                      company={companyBranding}
                    />
                  }
                  fileName={routingPdfFileName}
                  className={financeActionClass}
                >
                  {({ loading }) => (
                    <>
                      <Download aria-hidden="true" className="h-4 w-4" />
                      {loading ? 'Generando...' : 'Descargar PDF'}
                    </>
                  )}
                </PdfDownloadButton>
                <button type="button" onClick={handlePrintRoutingPdf} className={financeActionClass}>
                  <Printer aria-hidden="true" className="h-4 w-4" />
                  Imprimir
                </button>
              </>
            )}
            {canManageRouting && !isRoutingCancelled && (
              <button
                type="button"
                onClick={() => void runWithSavedRouting(syncRoutingFromPricing)}
                disabled={refreshingPricingData}
                className={financeActionClass}
              >
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${refreshingPricingData ? 'animate-spin motion-reduce:animate-none' : ''}`} />
                {refreshingPricingData ? 'Sincronizando...' : 'Actualizar desde Pricing'}
              </button>
            )}
          </>}
        />
      </div>

      <section
        aria-labelledby="si-status-title"
        className={cn(
          'mb-6 rounded-2xl border bg-white p-5 shadow-sm dark:bg-[#0b1220] sm:p-6',
          statusTone === 'red' ? 'border-red-200 dark:border-red-900/60' : statusTone === 'emerald' ? 'border-emerald-200 dark:border-emerald-900/60' : 'border-slate-200 dark:border-slate-700/60'
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3282D] dark:text-rose-300">Ruta de la operación</p>
            <h2 id="si-status-title" className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {shipmentContext ? `Operación ${shipmentContext.shipment.shipment_number}` : 'Estado de la operación'}
            </h2>
          </div>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Responsable</dt>
              <dd className="mt-1">
                {canManageRouting && !isRoutingCancelled ? (
                  <select
                    data-unsaved-ignore
                    aria-label="Asignar operativo"
                    value={routing.operations_assigned_to || ''}
                    onChange={(e) => { const value = e.target.value; void runWithSavedRouting((current) => assignOperationsUser(value, current)) }}
                    disabled={assigning}
                    className="h-9 min-w-[200px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="">Sin asignar</option>
                    {routing.operations_assigned_to && !assignedOperationsUser && (
                      <option value={routing.operations_assigned_to} disabled>
                        {assignedOperationsName}
                      </option>
                    )}
                    {operationsUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-semibold text-slate-900 dark:text-white">{assignedOperationsName}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Envío de Ventas</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{routing.sales_submitted_at ? formatDisplayDate(routing.sales_submitted_at) : 'Pendiente'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Aceptación</dt>
              <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{routing.operations_accepted_at ? formatDisplayDate(routing.operations_accepted_at) : 'Pendiente'}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
          <OperationStepper steps={operationSteps} label="Avance de la operación" />
        </div>

        {routing.sales_submitted_at && !routing.operations_accepted_at && canManageRouting && !isRoutingCancelled && (
          <CostNotice tone="amber" icon={Clock3} className="mt-5">
            <p className="font-semibold">Expediente pendiente de aceptación</p>
            <p className="mt-0.5">
              {canAcceptHandoff
                ? 'Acéptalo con el botón principal de la barra inferior para poder validarlo y crear el booking.'
                : `Está asignado a ${assignedOperationsName}; solo esa persona o Admin puede aceptarlo.`}
            </p>
          </CostNotice>
        )}
        {!canManageRouting && canSalesEditInitialInfo && (
          <CostNotice tone="sky" icon={InfoIcon} className="mt-5">
            Completa la información del proveedor y envíala a Operaciones desde la barra inferior.
          </CostNotice>
        )}
        {!canManageRouting && routing.sales_submitted_at && (
          <CostNotice tone="slate" icon={Lock} className="mt-5">
            Información enviada a Operaciones. Ventas ya no puede modificar esta Shipping Instruction.
          </CostNotice>
        )}
        {!canManageRouting && !canSalesEditInitialInfo && !routing.sales_submitted_at && (
          <CostNotice tone="slate" icon={Lock} className="mt-5">
            Modo lectura: las acciones operativas son de Operaciones o Admin.
          </CostNotice>
        )}
        {isRoutingCancelled && (
          <CostNotice tone="red" icon={Ban} className="mt-5">
            Esta Shipping Instruction está cancelada. Los datos se conservan solo como consulta.
          </CostNotice>
        )}
      </section>

      <div className="mb-6">
        <SectionNav
          items={shippingInstructionSections}
          label="Secciones de la Shipping Instruction"
        />
      </div>

      <section
        id="si-overview"
        className="mb-6 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]"
      >
        <OperationSectionTitle
          icon={FileText}
          title="Datos de la cotización"
          description="Referencia comercial y operativa tomada de la cotización y la tarifa seleccionada."
          actions={quotationHref ? (
            <Link href={quotationHref} className={financeActionClass}>
              Ver cotización {quotationNumber}
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : undefined}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <Info label="Cliente" value={clientName} />
          <Info label="Incoterm" value={routing.quotation?.incoterm || routing.incoterm} />
          <Info label="Negociación" value={routing.freight_terms} />
          <InfoContent label="Naviera">
            {routing.carrier ? <CarrierBadge code={routing.carrier} showName size="sm" /> : '—'}
          </InfoContent>
          <Info label="Agente" value={routing.agent_name} />
          <Info label="Puerto de origen" value={originLabel} />
          <Info label="Puerto de destino" value={destinationLabel} />
          <Info label="Contenedores" value={formatContainerSummary(routing)} />
          <Info label="ETD estimado" value={referenceEtd ? formatDisplayDate(referenceEtd) : undefined} />
          <Info label="Días de tránsito" value={referenceTransit} />
          <Info label="Días libres" value={referenceFreeDays} />
          <Info label="Transbordo" value={referenceTransshipment} />
          <div className="sm:col-span-2 md:col-span-3 xl:col-span-3">
            <Info label="Dirección de entrega" value={referenceDeliveryAddress} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
            <p className={cn(noteLabelClass, 'flex items-center gap-1.5 text-slate-600 dark:text-slate-300')}><Lock aria-hidden="true" className="h-3.5 w-3.5" />Observaciones internas · no salen en PDF</p>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-800 dark:text-slate-200">{referenceInternalNotes}</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/60 dark:bg-sky-950/30">
            <p className={cn(noteLabelClass, 'flex items-center gap-1.5 text-sky-800 dark:text-sky-200')}><FileText aria-hidden="true" className="h-3.5 w-3.5" />Observaciones para el cliente · salen en PDF</p>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-800 dark:text-slate-200">{referenceClientNotes}</p>
          </div>
        </div>
      </section>

      <section
        id="si-bookings"
        ref={bookingsSectionRef}
        className="mb-6 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]"
      >
        <OperationSectionTitle
          icon={Ship}
          tone="sky"
          title="Bookings"
          description="Se crean cuando la naviera o el agente confirma espacio."
          actions={canCreateBooking && bookings.length > 0 ? (
            <button
              type="button"
              onClick={() => void runWithSavedRouting(async () => { await handleCreateBookingChild() })}
              disabled={creatingBooking}
              className={operationSecondaryButtonClass}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {creatingBooking ? 'Creando...' : 'Agregar booking'}
            </button>
          ) : undefined}
        />

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <InfoContent label="Estado de los bookings">
            <OperationStatusBadge status={aggregateBookingStatus} />
          </InfoContent>
          <Info label="Bookings" value={String(bookings.length)} />
          <Info label="Contenedores asignados / cotizados" value={containerAssignmentSummary} />
        </div>

        <div
          className="relative mt-5 overflow-x-auto"
          role="region"
          aria-label="Bookings asociados"
          tabIndex={bookings.length > 0 ? 0 : undefined}
        >
          {bookings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {isValidated ? 'Todavía no hay bookings.' : 'El booking se habilita después de validar la SI.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-3 pr-4">Booking</th>
                  <th scope="col" className="pr-4">Ref. naviera</th>
                  <th scope="col" className="pr-4">Master BL</th>
                  <th scope="col" className="pr-4">House BL</th>
                  <th scope="col" className="pr-4">Estado</th>
                  <th scope="col" className="pr-4">ETD</th>
                  <th scope="col" className="pr-4">ETA</th>
                  <th scope="col" className="pr-4">Días libres</th>
                  <th scope="col" className="pr-4">Contenedores</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-t border-slate-100 dark:border-slate-800">
                    <th scope="row" className="whitespace-nowrap py-3 pr-4 text-left font-semibold text-slate-900 dark:text-white">
                      {booking.booking_number || 'Sin número'}
                    </th>
                    <td className="whitespace-nowrap pr-4 text-slate-700 dark:text-slate-300">{booking.carrier_booking || '—'}</td>
                    <td className="whitespace-nowrap pr-4 text-slate-700 dark:text-slate-300">{booking.master_bl || '—'}</td>
                    <td className="whitespace-nowrap pr-4 text-slate-700 dark:text-slate-300">{booking.house_bl || '—'}</td>
                    <td className="pr-4"><OperationStatusBadge status={booking.shipment_status} className="whitespace-nowrap" /></td>
                    <td className="whitespace-nowrap pr-4 tabular-nums text-slate-700 dark:text-slate-300">{booking.etd ? formatDisplayDate(booking.etd) : '—'}</td>
                    <td className="whitespace-nowrap pr-4 tabular-nums text-slate-700 dark:text-slate-300">{booking.eta ? formatDisplayDate(booking.eta) : '—'}</td>
                    <td className="pr-4 tabular-nums text-slate-700 dark:text-slate-300">{booking.free_days ?? '—'}</td>
                    <td className="pr-4 text-slate-700 dark:text-slate-300">{formatBookingContainers(booking.booking_containers)}</td>
                    <td className="py-2 text-right">
                      <Link
                        href={bookingDetailHref(booking.id)}
                        aria-label={`Abrir booking ${booking.booking_number || booking.carrier_booking || ''}`.trim()}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Abrir <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div id="si-information" className="scroll-mt-28 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <OperationSectionTitle icon={Building2} tone="amber" title="Proveedor (Shipper)" description="Obligatorio para validar: proveedor, contacto, email y dirección." />
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Proveedor *</span>
              <input value={routing.supplier_name || ''} onChange={(e) => updateRouting('supplier_name', e.target.value)} disabled={!canEditSupplierInfo} className={inputClassName} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Contacto *</span>
              <input value={routing.supplier_contact || ''} onChange={(e) => updateRouting('supplier_contact', e.target.value)} disabled={!canEditSupplierInfo} className={inputClassName} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Email *</span>
              <input type="email" value={routing.supplier_email || ''} onChange={(e) => updateRouting('supplier_email', e.target.value)} disabled={!canEditSupplierInfo} className={inputClassName} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Teléfono</span>
              <input value={routing.supplier_phone || ''} onChange={(e) => updateRouting('supplier_phone', e.target.value)} disabled={!canEditSupplierInfo} className={inputClassName} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Dirección *</span>
              <input value={routing.supplier_address || ''} onChange={(e) => updateRouting('supplier_address', e.target.value)} disabled={!canEditSupplierInfo} className={inputClassName} />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <OperationSectionTitle icon={MessageSquareText} title="Comentarios" description="Instrucciones del cliente o información adicional del proveedor." />
          <textarea
            aria-label="Comentarios"
            value={routing.sales_observations || ''}
            onChange={(e) => updateRouting('sales_observations', e.target.value)}
            disabled={!canEditSupplierInfo}
            rows={8}
            placeholder="Notas comerciales, instrucciones del cliente, información adicional del proveedor..."
            className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </section>

        {canManageRouting && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] lg:col-span-2">
            <OperationSectionTitle icon={FileText} tone="sky" title="Instrucciones de BL" description="Valores por defecto para los bookings y BL de esta operación." />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Términos de flete</span>
                <select value={routing.freight_terms || ''} disabled={isRoutingCancelled} onChange={(e) => setRouting({ ...routing, freight_terms: e.target.value })} className={inputClassName}>
                  <option value="">Seleccionar</option>
                  <option value="Collect">Collect</option>
                  <option value="Prepaid">Prepaid</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Tipo de liberación</span>
                <select value={routing.release_type || ''} disabled={isRoutingCancelled} onChange={(e) => setRouting({ ...routing, release_type: e.target.value })} className={inputClassName}>
                  <option value="">Seleccionar</option>
                  <option value="Express Release">Express Release</option>
                  <option value="Original BL">BL original</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Flete en el HBL</span>
                <select value={routing.hbl_freight_visibility || ''} disabled={isRoutingCancelled} onChange={(e) => setRouting({ ...routing, hbl_freight_visibility: e.target.value })} className={inputClassName}>
                  <option value="">Seleccionar</option>
                  <option value="No Freight Charges">No mostrar flete</option>
                  <option value="Show Freight Charges">Mostrar flete</option>
                </select>
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Seguro</span>
                <select value={routing.insurance_requested ? 'Yes' : 'No'} disabled={isRoutingCancelled} onChange={(e) => setRouting({ ...routing, insurance_requested: e.target.value === 'Yes' })} className={inputClassName}>
                  <option value="No">No</option>
                  <option value="Yes">Sí</option>
                </select>
              </label>
              <label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={routing.printed_at_destination || false} disabled={isRoutingCancelled} onChange={(e) => setRouting({ ...routing, printed_at_destination: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                BL impreso en destino
              </label>
            </div>
          </section>
        )}
      </div>

      <section
        id="si-timeline"
        className="mt-6 scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Historial operativo ({operationalEvents.length} eventos)
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

      {(canSave || primaryAction || canCancelRouting || canFinalizeAsSecondary || isRoutingFinalized) && (
        <div id="si-actions" className="scroll-mt-28">
          <OperationSaveBar
            dirty={isDirty}
            saving={saving}
            disabled={!canSave}
            onSave={() => void (canManageRouting ? saveRouting() : saveSalesInitialInfo(false))}
          >
            {isRoutingFinalized && !isRoutingCancelled && (
              <OperationStatusBadge status="Finalizado" />
            )}
            {canCancelRouting && (
              <button type="button" onClick={() => setCancelDialogOpen(true)} className={operationDangerButtonClass}>
                <Ban aria-hidden="true" className="h-4 w-4" />
                Cancelar SI
              </button>
            )}
            {canFinalizeAsSecondary && (
              <button type="button" onClick={() => void runWithSavedRouting(finalizeRouting)} disabled={finalizing} className={operationSecondaryButtonClass}>
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                {finalizing ? 'Finalizando...' : 'Finalizar operación'}
              </button>
            )}
            {primaryAction && PrimaryIcon && (
              <button type="button" onClick={() => runPrimaryAction(primaryAction.kind)} disabled={primaryAction.disabled} title={primaryAction.title} className={operationPrimaryButtonClass}>
                <PrimaryIcon aria-hidden="true" className="h-4 w-4" />
                {primaryAction.label}
              </button>
            )}
          </OperationSaveBar>
        </div>
      )}


      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open)

          if (!open && !cancelling) {
            setCancelReason('')
          }
        }}
      >
        <OperationDialogContent icon={Ban} tone="red" eyebrow={`SI ${routing.routing_number}`}>
          <DialogHeader>
            <DialogTitle>Cancelar Shipping Instruction</DialogTitle>
            <DialogDescription>
              Esta acción marcará la Shipping Instruction como cancelada. No eliminará la cotización ni los datos operativos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label htmlFor="si-cancel-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Motivo de cancelación *
            </label>
            <textarea
              id="si-cancel-reason"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Ej. Cliente canceló la operación antes de confirmar booking."
            />
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelling}
              className={operationSecondaryButtonClass}
            >
              Volver
            </button>
            <button
              type="button"
              onClick={cancelRouting}
              disabled={cancelling || !cancelReason.trim()}
              className={operationDangerSolidButtonClass}
            >
              {cancelling ? 'Cancelando...' : 'Confirmar cancelación'}
            </button>
          </DialogFooter>
        </OperationDialogContent>
      </Dialog>
    </div>
  )
}
