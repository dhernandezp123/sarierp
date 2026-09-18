'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileWarning,
  PackageOpen,
  RefreshCw,
  Search,
  Ship,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import {
  aggregateBookingStatus,
  isFinalBookingStatus,
} from '@/src/lib/booking-status'
import {
  deriveBookingOperationalState,
  type BookingOperationalState,
} from '@/src/lib/booking-operational-state'
import { formatDate } from '@/src/lib/format'
import {
  buildOperationsControlTower,
  filterOperationsControlTower,
  type OperationsQueueFilter,
  type OperationsWorkItem,
  type ReadinessWorkAlert,
} from '@/src/lib/operations-control-tower'
import { operationsDashboardHref } from '@/src/lib/operations-navigation'

type ClientJoin = {
  nombre: string | null
}

type QuotationJoin = {
  id: string
  origen: string | null
  destino: string | null
  tipo_transporte: string | null
  quote_type: string | null
  cliente: ClientJoin | ClientJoin[] | null
}

type ShippingInstructionJoin = {
  id: string
  routing_number: string | null
  operational_status: string | null
  operations_assigned_to: string | null
  container_qty: number | null
  container_type: string | null
  quotation_id: string | null
  supplier_name: string | null
  quotation: QuotationJoin | QuotationJoin[] | null
}

type ShipmentJoin = {
  requires_hbl: boolean | null
  service_type: string | null
}

type BookingContainerJoin = {
  container_type: string | null
  quantity: number | null
}

type BookingDocumentJoin = {
  document_type: string | null
}

type BillOfLadingJoin = {
  bl_type: string | null
  status: string | null
}

type OperationalEventJoin = {
  event_code: string
  event_label: string
  occurred_at: string | null
  created_at: string | null
}

type BookingRow = {
  id: string
  shipment_id: string | null
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
  actual_etd: string | null
  actual_eta: string | null
  shipment_status: string | null
  free_days: number | null
  remaining_free_days: number | null
  created_at: string | null
  updated_at: string | null
  shipment: ShipmentJoin | ShipmentJoin[] | null
  shipping_instruction: ShippingInstructionJoin | ShippingInstructionJoin[] | null
  booking_containers: BookingContainerJoin[] | null
  booking_documents: BookingDocumentJoin[] | null
  bills_of_lading: BillOfLadingJoin[] | null
  operational_events: OperationalEventJoin[] | null
}

type QuotationContainerRow = {
  quotation_id: string | null
  quantity: number | null
}

type RoutingContainerGap = {
  routingId: string
  routingNumber: string
  clientName: string
  expected: number
  assigned: number
  missing: number
}

type DocumentationGap = {
  booking: BookingRow
  state: BookingOperationalState
  missing: string[]
}

type OperationalBooking = {
  booking: BookingRow
  state: BookingOperationalState
}

type ReadinessOverview = {
  booking_id: string
  shipment_id: string
  booking_number: string | null
  mode: string
  ready: boolean
  blocking_count: number
  warning_count: number
  next_cutoff: string | null
  overdue_cutoff_count: number
  missing_vgm_count: number
  active_exception: boolean
  evaluated_at: string
}

function resolveJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeStatus(status?: string | null) {
  return (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isFinalStatus(status?: string | null) {
  const normalized = normalizeStatus(status)
  return (
    isFinalBookingStatus(status) || normalized === 'Convertida a Shipment'
  )
}

type ReadinessAlertRow = ReadinessWorkAlert & {
  shipment_id: string
  booking_id: string
  booking_container_id: string | null
  cutoff_id: string | null
}

const OPERATIONS_QUEUE_FILTERS: Array<{
  value: OperationsQueueFilter
  label: string
}> = [
  { value: 'all', label: 'Todo' },
  { value: 'attention', label: 'Atención inmediata' },
  { value: 'unassigned', label: 'Sin asignar' },
  { value: 'departures', label: 'Próximas salidas' },
  { value: 'arrivals', label: 'Próximos arribos' },
  { value: 'documentation', label: 'Documentación' },
  { value: 'exceptions', label: 'Excepciones' },
  { value: 'recently_completed', label: 'Completadas recientes' },
]

function initialOperationsQueueState() {
  if (typeof window === 'undefined') {
    return { filter: 'all' as OperationsQueueFilter, search: '' }
  }
  const params = new URLSearchParams(window.location.search)
  const requestedFilter = params.get('queue') as OperationsQueueFilter | null
  return {
    filter: requestedFilter && OPERATIONS_QUEUE_FILTERS.some(({ value }) => value === requestedFilter)
      ? requestedFilter
      : 'all',
    search: params.get('q') || '',
  }
}

function isInTransit(status?: string | null) {
  return normalizeStatus(status) === 'En Transito'
}

function isArrived(status?: string | null) {
  return normalizeStatus(status) === 'Arribado'
}

function getFreeDaysDisplay(booking: BookingRow) {
  const hasDateBase = Boolean(booking.actual_eta || booking.eta)
  const hasReliableArrival =
    Boolean(booking.actual_eta) ||
    isArrived(booking.shipment_status) ||
    isFinalStatus(booking.shipment_status)
  const remaining = Number(booking.remaining_free_days)
  const hasExpiringValue =
    Number.isFinite(remaining) && remaining >= 0 && remaining <= 7

  if (!hasDateBase) {
    return {
      label: 'Pendiente de ETA',
      sortValue: 99,
      isRealAlert: false,
      includeInExpiring: hasExpiringValue,
    }
  }

  if (!hasReliableArrival) {
    return {
      label: 'Pendiente de arribo',
      sortValue: 98,
      isRealAlert: false,
      includeInExpiring: hasExpiringValue,
    }
  }

  if (!Number.isFinite(remaining)) {
    return {
      label: 'Pendiente de cálculo',
      sortValue: 97,
      isRealAlert: false,
      includeInExpiring: false,
    }
  }

  return {
    label: remaining === 1 ? '1 día' : `${remaining} días`,
    sortValue: remaining,
    isRealAlert: remaining >= 0 && remaining <= 3,
    includeInExpiring: remaining >= 0 && remaining <= 7,
  }
}

function isCurrentMonth(value?: string | null) {
  if (!value) return false

  const date = new Date(value)
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth()
  )
}

function clientNameFor(booking: BookingRow) {
  const shippingInstruction = resolveJoin(booking.shipping_instruction)
  const quotation = resolveJoin(shippingInstruction?.quotation || null)
  const client = resolveJoin(quotation?.cliente || null)

  return client?.nombre || 'N/A'
}

function routingNumberFor(booking: BookingRow) {
  return resolveJoin(booking.shipping_instruction)?.routing_number || 'N/A'
}

function bookingLink(booking: BookingRow) {
  return `/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`
}

function routingLink(routingId: string) {
  return `/operations/shipping-instructions/${routingId}`
}

function statusBadgeClass(status?: string | null) {
  const normalized = normalizeStatus(status)

  if (normalized === 'Booking Solicitado') {
    return 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
  }

  if (normalized === 'Booking Confirmado') {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200'
  }

  if (normalized === 'Documentacion Pendiente') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
  }

  if (normalized === 'En Transito' || normalized === 'Embarcado') {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200'
  }

  if (normalized === 'Arribado' || normalized === 'Finalizado') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
}

function expectedContainersFromRouting(
  routing: ShippingInstructionJoin,
  quotationTotals: Record<string, number>
) {
  if (routing.quotation_id && quotationTotals[routing.quotation_id]) {
    return quotationTotals[routing.quotation_id]
  }

  const directQty = Number(routing.container_qty || 0)
  if (directQty > 0) return directQty

  const containerType = routing.container_type?.trim()
  const match = containerType?.match(/^(\d+)\s*x\s+/i)

  return match ? Number(match[1]) : 0
}

function assignedContainerTotal(bookings: BookingRow[]) {
  return bookings.reduce((total, booking) => {
    const bookingTotal = (booking.booking_containers || []).reduce(
      (sum, container) => sum + Number(container.quantity || 0),
      0
    )

    return total + bookingTotal
  }, 0)
}

function operationalStateFor(
  booking: BookingRow,
  readiness: ReadinessOverview | null
) {
  const shippingInstruction = resolveJoin(booking.shipping_instruction)
  const quotation = resolveJoin(shippingInstruction?.quotation || null)
  const shipment = resolveJoin(booking.shipment)

  return deriveBookingOperationalState({
    shipmentStatus: booking.shipment_status,
    bookingNumber: booking.booking_number,
    carrierBooking: booking.carrier_booking,
    etd: booking.etd,
    eta: booking.eta,
    actualEtd: booking.actual_etd,
    actualEta: booking.actual_eta,
    assignedTo: shippingInstruction?.operations_assigned_to,
    mode:
      readiness?.mode ||
      quotation?.tipo_transporte ||
      quotation?.quote_type ||
      shipment?.service_type,
    requiresHbl: shipment?.requires_hbl,
    documents: booking.booking_documents,
    bills: booking.bills_of_lading,
    readiness,
  })
}

export default function OperationsDashboardPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [quotationTotals, setQuotationTotals] = useState<Record<string, number>>({})
  const [readinessOverview, setReadinessOverview] = useState<ReadinessOverview[]>([])
  const [readinessAlerts, setReadinessAlerts] = useState<ReadinessAlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [queueFilter, setQueueFilter] = useState<OperationsQueueFilter>('all')
  const [queueSearch, setQueueSearch] = useState('')
  const [urlStateReady, setUrlStateReady] = useState(false)

  const loadDashboard = async () => {
    setLoading(true)
    setErrorMessage('')

    const { data: bookingsData, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        shipment_id,
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
        actual_etd,
        actual_eta,
        shipment_status,
        free_days,
        remaining_free_days,
        created_at,
        updated_at,
        shipment:shipments!bookings_shipment_id_fkey (
          requires_hbl,
          service_type
        ),
        shipping_instruction:shipping_instructions!bookings_shipping_instruction_id_fkey (
          id,
          routing_number,
          operational_status,
          operations_assigned_to,
          container_qty,
          container_type,
          quotation_id,
          supplier_name,
          quotation:quotations (
            id,
            origen,
            destino,
            tipo_transporte,
            quote_type,
            cliente:clientes (
              nombre
            )
          )
        ),
        booking_containers (
          container_type,
          quantity
        ),
        booking_documents (
          document_type
        ),
        bills_of_lading (
          bl_type,
          status
        ),
        operational_events!operational_events_booking_id_fkey (
          event_code,
          event_label,
          occurred_at,
          created_at
        )
      `)
      .eq('booking_lifecycle_status', 'ACTIVE')
      .order('created_at', { ascending: false })

    const { data: quotationContainersData, error: quotationContainersError } =
      await supabase
        .from('quotation_containers')
        .select('quotation_id, quantity')

    const { data: readinessData, error: readinessError } = await supabase.rpc(
      'get_booking_readiness_overview',
      { p_shipment_id: null }
    )

    const { data: readinessAlertData, error: readinessAlertError } =
      await supabase.rpc('get_booking_readiness_alerts')

    const loadErrors = [
      bookingsError,
      quotationContainersError,
      readinessError,
      readinessAlertError,
    ].filter((error): error is NonNullable<typeof error> => Boolean(error))

    if (loadErrors.length > 0) {
      setBookings([])
      setQuotationTotals({})
      setReadinessOverview([])
      setReadinessAlerts([])
      setErrorMessage(loadErrors.map((error) => error.message).join(' · '))
      setLoading(false)
      return
    }

    setBookings((bookingsData || []) as BookingRow[])

    const totals = ((quotationContainersData || []) as QuotationContainerRow[])
      .reduce<Record<string, number>>((acc, container) => {
        if (!container.quotation_id) return acc

        acc[container.quotation_id] =
          (acc[container.quotation_id] || 0) + Number(container.quantity || 0)

        return acc
      }, {})

    setQuotationTotals(totals)
    setReadinessOverview((readinessData || []) as ReadinessOverview[])
    setReadinessAlerts((readinessAlertData || []) as ReadinessAlertRow[])

    setLoading(false)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDashboard()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const initial = initialOperationsQueueState()
      setQueueFilter(initial.filter)
      setQueueSearch(initial.search)
      setUrlStateReady(true)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!urlStateReady) return
    window.history.replaceState(
      null,
      '',
      `${operationsDashboardHref(queueFilter, queueSearch)}${window.location.hash}`
    )
  }, [queueFilter, queueSearch, urlStateReady])

  const dashboard = useMemo(() => {
    const readinessByBookingId = new Map(
      readinessOverview.map((overview) => [overview.booking_id, overview])
    )
    const operationalBookings = bookings.map<OperationalBooking>((booking) => ({
      booking,
      state: operationalStateFor(
        booking,
        readinessByBookingId.get(booking.id) || null
      ),
    }))
    const activeBookings = operationalBookings.filter(
      ({ state }) => !state.isFinal
    )

    const inTransitBookings = activeBookings.filter(({ state }) =>
      isInTransit(state.displayStatus)
    )

    const arrivedThisMonth = operationalBookings.filter(({ booking, state }) => {
      const dateValue = booking.actual_eta || booking.eta
      return isArrived(state.displayStatus) && isCurrentMonth(dateValue)
    })

    const allBookingsByRouting = bookings.reduce<Record<string, BookingRow[]>>(
      (acc, booking) => {
        const operationId = booking.shipment_id || booking.shipping_instruction_id
        acc[operationId] = [
          ...(acc[operationId] || []),
          booking,
        ]
        return acc
      },
      {}
    )

    const openRoutingIds = new Set(
      Object.values(allBookingsByRouting)
        .filter((routingBookings) => {
          const routing = resolveJoin(routingBookings[0]?.shipping_instruction)
          return !isFinalStatus(
            aggregateBookingStatus(
              routingBookings,
              routing?.operational_status || 'Sin bookings'
            )
          )
        })
        .map(
          (routingBookings) =>
            routingBookings[0].shipment_id ||
            routingBookings[0].shipping_instruction_id
        )
    )

    const etaCritical = activeBookings
      .filter(({ state }) =>
        ['overdue', 'today', 'upcoming'].includes(state.eta.kind)
      )
      .sort((a, b) => {
        const aDays = a.state.eta.days ?? 99
        const bDays = b.state.eta.days ?? 99
        return aDays - bDays
      })

    const freeDaysExpiring = activeBookings
      .filter(({ booking }) => getFreeDaysDisplay(booking).includeInExpiring)
      .sort(
        (a, b) =>
          getFreeDaysDisplay(a.booking).sortValue -
          getFreeDaysDisplay(b.booking).sortValue
      )

    const pendingConfirmation = activeBookings.filter(
      ({ state }) => state.isPendingConfirmation
    )
    const unassignedBookings = activeBookings.filter(
      ({ state }) => state.isUnassigned
    )
    const statusDrifts = activeBookings.filter(
      ({ state }) => state.hasStatusDrift
    )

    const bookingsByRouting = activeBookings.reduce<Record<string, BookingRow[]>>(
      (acc, { booking }) => {
        const operationId = booking.shipment_id || booking.shipping_instruction_id
        acc[operationId] = [
          ...(acc[operationId] || []),
          booking,
        ]
        return acc
      },
      {}
    )

    const containerGaps = Object.values(bookingsByRouting)
      .map<RoutingContainerGap | null>((routingBookings) => {
        const routing = resolveJoin(routingBookings[0]?.shipping_instruction)
        if (!routing) return null

        const expected = expectedContainersFromRouting(routing, quotationTotals)
        const assigned = assignedContainerTotal(routingBookings)
        const missing = Math.max(expected - assigned, 0)

        if (expected <= 0 || missing <= 0) return null

        return {
          routingId: routing.id,
          routingNumber: routing.routing_number || 'N/A',
          clientName: clientNameFor(routingBookings[0]),
          expected,
          assigned,
          missing,
        }
      })
      .filter((gap): gap is RoutingContainerGap => Boolean(gap))
      .sort((a, b) => b.missing - a.missing)

    const documentationGaps = activeBookings
      .map<DocumentationGap | null>(({ booking, state }) => {
        const missing = state.missingDocuments.map((document) => document.label)
        return missing.length > 0 ? { booking, state, missing } : null
      })
      .filter((gap): gap is DocumentationGap => Boolean(gap))

    const activeBookingIds = new Set(
      activeBookings.map(({ booking }) => booking.id)
    )
    const readinessGaps = readinessOverview
      .filter(
        (overview) =>
          activeBookingIds.has(overview.booking_id) && !overview.ready
      )
      .sort(
        (left, right) =>
          right.blocking_count - left.blocking_count ||
          right.overdue_cutoff_count - left.overdue_cutoff_count
      )

    const readinessAlertsByBookingId = readinessAlerts.reduce<
      Record<string, ReadinessAlertRow[]>
    >((acc, alert) => {
      acc[alert.booking_id] = [...(acc[alert.booking_id] || []), alert]
      return acc
    }, {})

    const controlTower = buildOperationsControlTower(
      operationalBookings.map(({ booking, state }) => {
        const events = [...(booking.operational_events || [])].sort((left, right) => {
          const leftDate = left.occurred_at || left.created_at || ''
          const rightDate = right.occurred_at || right.created_at || ''
          return rightDate.localeCompare(leftDate)
        })
        const lastEvent = events[0]

        return {
          id: booking.id,
          shippingInstructionId: booking.shipping_instruction_id,
          bookingLabel:
            booking.booking_number || booking.carrier_booking || 'Sin booking',
          routingNumber: routingNumberFor(booking),
          clientName: clientNameFor(booking),
          carrier: booking.carrier,
          etd: booking.actual_etd || booking.etd,
          eta: booking.eta,
          actualEta: booking.actual_eta,
          remainingFreeDays: booking.remaining_free_days,
          createdAt: booking.created_at,
          updatedAt: booking.updated_at,
          lastEvent: lastEvent
            ? {
                eventLabel: lastEvent.event_label,
                occurredAt: lastEvent.occurred_at,
                createdAt: lastEvent.created_at,
              }
            : null,
          state,
          readinessAlerts: readinessAlertsByBookingId[booking.id] || [],
        }
      })
    )

    return {
      metrics: {
        activeBookings: activeBookings.length,
        inTransitBookings: inTransitBookings.length,
        arrivedThisMonth: arrivedThisMonth.length,
        openRoutings: openRoutingIds.size,
        pendingDocuments: documentationGaps.length,
        notReady: readinessGaps.length,
        unassigned: unassignedBookings.length,
        statusDrifts: statusDrifts.length,
        overdueCutoffs: readinessGaps.reduce(
          (sum, overview) => sum + overview.overdue_cutoff_count,
          0
        ),
      },
      etaCritical,
      freeDaysExpiring,
      pendingConfirmation,
      unassignedBookings,
      statusDrifts,
      containerGaps,
      documentationGaps,
      readinessGaps,
      controlTower,
    }
  }, [bookings, quotationTotals, readinessAlerts, readinessOverview])

  const visibleControlTower = useMemo(
    () => filterOperationsControlTower(
      dashboard.controlTower,
      queueFilter,
      queueSearch
    ),
    [dashboard.controlTower, queueFilter, queueSearch]
  )

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-7 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" />
          ))}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
          <TableSkeleton rows={6} cols={6} />
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <OperationsDashboardHeader />
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300"
            />
            <div>
              <h2 className="font-semibold text-red-900 dark:text-red-100">
                No se pudo cargar el Dashboard Operativo
              </h2>
              <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-200">
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={() => void loadDashboard()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-900/50"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Reintentar
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <OperationsDashboardHeader />
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      <OperationsControlTower
        items={visibleControlTower}
        totalItems={dashboard.controlTower.length}
        filter={queueFilter}
        search={queueSearch}
        onFilterChange={setQueueFilter}
        onSearchChange={setQueueSearch}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-9">
        <MetricCard
          title="Bookings activos"
          value={dashboard.metrics.activeBookings}
          icon={<ClipboardList className="h-5 w-5" />}
        />
        <MetricCard
          title="Bookings en tránsito"
          value={dashboard.metrics.inTransitBookings}
          icon={<Ship className="h-5 w-5" />}
        />
        <MetricCard
          title="Arribados este mes"
          value={dashboard.metrics.arrivedThisMonth}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <MetricCard
          title="SI abiertos"
          value={dashboard.metrics.openRoutings}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <MetricCard
          title="Bookings con documentos pendientes"
          value={dashboard.metrics.pendingDocuments}
          icon={<FileWarning className="h-5 w-5" />}
          danger={dashboard.metrics.pendingDocuments > 0}
        />
        <MetricCard
          title="Bookings no listos"
          value={dashboard.metrics.notReady}
          icon={<AlertTriangle className="h-5 w-5" />}
          danger={dashboard.metrics.notReady > 0}
        />
        <MetricCard
          title="Sin asignar"
          value={dashboard.metrics.unassigned}
          icon={<AlertTriangle className="h-5 w-5" />}
          danger={dashboard.metrics.unassigned > 0}
        />
        <MetricCard
          title="Estados por conciliar"
          value={dashboard.metrics.statusDrifts}
          icon={<RefreshCw className="h-5 w-5" />}
          danger={dashboard.metrics.statusDrifts > 0}
        />
        <MetricCard
          title="Cut-offs vencidos"
          value={dashboard.metrics.overdueCutoffs}
          icon={<Clock3 className="h-5 w-5" />}
          danger={dashboard.metrics.overdueCutoffs > 0}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <EtaTable bookings={dashboard.etaCritical} />
        <FreeDaysTable bookings={dashboard.freeDaysExpiring} />
        <PendingConfirmationTable bookings={dashboard.pendingConfirmation} />
        <UnassignedTable bookings={dashboard.unassignedBookings} />
        <StatusDriftTable bookings={dashboard.statusDrifts} />
        <ContainerGapsTable gaps={dashboard.containerGaps} />
        <DocumentationGapsTable gaps={dashboard.documentationGaps} />
        <ReadinessGapsTable
          gaps={dashboard.readinessGaps}
          bookings={bookings}
        />
      </div>
    </div>
  )
}

function operationsWorkHref(item: OperationsWorkItem, returnTo: string) {
  const returnQuery = `returnTo=${encodeURIComponent(returnTo)}`
  if (item.actionTarget === 'shipping_instruction') {
    return `/operations/shipping-instructions/${item.shippingInstructionId}?${returnQuery}`
  }

  const anchor = item.actionTarget === 'booking_schedule'
    ? 'booking-schedule'
    : item.actionTarget === 'booking_readiness'
      ? 'booking-readiness'
      : item.actionTarget === 'booking_documents'
        ? 'booking-documents'
        : 'booking-header'

  return `/operations/shipping-instructions/${item.shippingInstructionId}/bookings/${item.id}?${returnQuery}#${anchor}`
}

function queueLevelLabel(level: OperationsWorkItem['level']) {
  if (level === 'immediate') return 'Ahora'
  if (level === 'pending') return 'Pendiente'
  return 'Visibilidad'
}

function OperationsControlTower({
  items,
  totalItems,
  filter,
  search,
  onFilterChange,
  onSearchChange,
}: {
  items: OperationsWorkItem[]
  totalItems: number
  filter: OperationsQueueFilter
  search: string
  onFilterChange: (filter: OperationsQueueFilter) => void
  onSearchChange: (search: string) => void
}) {
  const returnTo = operationsDashboardHref(filter, search)
  const nextActions = items.slice(0, 3)

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950/60 dark:text-blue-200">
              Cola priorizada
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {items.length} de {totalItems}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">
            Control Tower
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Riesgo, aging y siguiente acción en una sola cola operativa.
          </p>
        </div>
        <label className="relative block w-full lg:max-w-sm">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Buscar en Control Tower</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Booking, RT, cliente o carrier"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {OPERATIONS_QUEUE_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onFilterChange(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filter === option.value
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Siguientes 3 acciones
        </h3>
        {nextActions.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {totalItems === 0
              ? 'No hay operaciones activas en la cola.'
              : 'No hay operaciones que coincidan con estos filtros.'}
          </div>
        ) : (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {nextActions.map((item, index) => (
              <Link
                key={item.id}
                href={operationsWorkHref(item, returnTo)}
                className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                  item.level === 'immediate'
                    ? 'border-red-200 bg-red-50/70 dark:border-red-900/60 dark:bg-red-950/20'
                    : item.level === 'pending'
                      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20'
                      : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    #{index + 1} · {queueLevelLabel(item.level)}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" />
                </div>
                <p className="mt-2 font-bold text-slate-900 dark:text-white">
                  {item.bookingLabel}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {item.routingNumber} · {item.clientName}
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {item.reason}
                </p>
                <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  {item.nextAction}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3 pr-4">Prioridad</th>
                <th className="pr-4">Booking / Cliente</th>
                <th className="pr-4">Riesgo</th>
                <th className="pr-4">Aging</th>
                <th className="pr-4">Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top dark:border-slate-800">
                  <td className="py-3 pr-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.level === 'immediate'
                        ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200'
                        : item.level === 'pending'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}>
                      {queueLevelLabel(item.level)}
                    </span>
                  </td>
                  <td className="pr-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{item.bookingLabel}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.routingNumber} · {item.clientName}
                    </p>
                  </td>
                  <td className="max-w-sm pr-4">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{item.reason}</p>
                    {item.detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>}
                    {item.dueAt && <p className="mt-1 text-xs text-red-600 dark:text-red-300">Vence: {formatDate(item.dueAt)}</p>}
                  </td>
                  <td className="whitespace-nowrap pr-4 text-slate-700 dark:text-slate-300">
                    <span className="font-semibold">{item.agingDays}d</span>
                    <p className="text-xs text-slate-400">{item.lastChangeLabel}</p>
                  </td>
                  <td className="pr-4"><StatusPill status={item.displayStatus} /></td>
                  <td>
                    <Link
                      href={operationsWorkHref(item, returnTo)}
                      className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline dark:text-blue-300"
                    >
                      {item.nextAction}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function OperationsDashboardHeader() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
        Centro de control
      </p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
        Dashboard Operativo
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Seguimiento diario de bookings, ETAs, free days, documentos y
        contenedores.
      </p>
    </div>
  )
}

function MetricCard({
  title,
  value,
  icon,
  danger,
}: {
  title: string
  value: number
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        danger
          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
          : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        <div
          className={`rounded-xl p-2 ${
            danger
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
              : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-200'
          }`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  )
}

function DashboardPanel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-t border-slate-100 py-6 text-center text-slate-500 dark:border-slate-800 dark:text-slate-400"
      >
        Sin alertas por ahora.
      </td>
    </tr>
  )
}

function StatusPill({ status }: { status?: string | null }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
        status
      )}`}
    >
      {status || 'N/A'}
    </span>
  )
}

function BookingCell({ booking }: { booking: BookingRow }) {
  return (
    <div>
      <Link
        href={bookingLink(booking)}
        className="font-semibold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-300"
      >
        {booking.booking_number || booking.carrier_booking || 'Sin booking'}
      </Link>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {routingNumberFor(booking)} - {clientNameFor(booking)}
      </p>
    </div>
  )
}

function EtaTable({ bookings }: { bookings: OperationalBooking[] }) {
  return (
    <DashboardPanel
      title="ETA críticas"
      description="ETAs vencidas sin arribo y arribos previstos en los próximos 7 días."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-3 pr-4">Booking</th>
            <th className="pr-4">Carrier</th>
            <th className="pr-4">ETA</th>
            <th className="pr-4">Dias</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <EmptyRow colSpan={5} />
          ) : (
            bookings.slice(0, 12).map(({ booking, state }) => {
              return (
                <tr
                  key={booking.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-3 pr-4">
                    <BookingCell booking={booking} />
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {booking.carrier || 'N/A'}
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {formatDate(state.eta.date, 'N/A')}
                  </td>
                  <td
                    className={`pr-4 font-semibold ${
                      state.eta.kind === 'overdue'
                        ? 'text-red-600 dark:text-red-300'
                        : 'text-blue-600 dark:text-blue-300'
                    }`}
                  >
                    {state.eta.label}
                  </td>
                  <td>
                    <StatusPill status={state.displayStatus} />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </DashboardPanel>
  )
}

function FreeDaysTable({ bookings }: { bookings: OperationalBooking[] }) {
  return (
    <DashboardPanel
      title="Free Days por vencer"
      description="Bookings arribados con 7 días libres o menos."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-3 pr-4">Booking</th>
            <th className="pr-4">Free Days</th>
            <th className="pr-4">Restantes</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <EmptyRow colSpan={4} />
          ) : (
            bookings.slice(0, 12).map(({ booking, state }) => {
              const freeDaysDisplay = getFreeDaysDisplay(booking)

              return (
                <tr
                  key={booking.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-3 pr-4">
                    <BookingCell booking={booking} />
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {booking.free_days ?? 'N/A'}
                  </td>
                  <td className="pr-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        freeDaysDisplay.isRealAlert
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {freeDaysDisplay.isRealAlert && (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {freeDaysDisplay.label}
                    </span>
                  </td>
                  <td>
                    <StatusPill status={state.displayStatus} />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </DashboardPanel>
  )
}

function PendingConfirmationTable({ bookings }: { bookings: OperationalBooking[] }) {
  return (
    <DashboardPanel
      title="Bookings pendientes de confirmación"
      description="Sin número de booking, carrier booking o aún solicitados."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-3 pr-4">SI / Cliente</th>
            <th className="pr-4">Booking</th>
            <th className="pr-4">Carrier Booking</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <EmptyRow colSpan={4} />
          ) : (
            bookings.slice(0, 12).map(({ booking, state }) => (
              <tr
                key={booking.id}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="py-3 pr-4">
                  <BookingCell booking={booking} />
                </td>
                <td className="pr-4 text-slate-700 dark:text-slate-300">
                  {booking.booking_number || 'Pendiente'}
                </td>
                <td className="pr-4 text-slate-700 dark:text-slate-300">
                  {booking.carrier_booking || 'Pendiente'}
                </td>
                <td>
                  <StatusPill status={state.displayStatus} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </DashboardPanel>
  )
}

function UnassignedTable({ bookings }: { bookings: OperationalBooking[] }) {
  return (
    <DashboardPanel
      title="Operaciones sin asignar"
      description="Bookings activos cuyo expediente todavía no tiene responsable operativo."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-3 pr-4">Booking</th>
            <th className="pr-4">Cliente</th>
            <th className="pr-4">Estado derivado</th>
            <th>Siguiente acción</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <EmptyRow colSpan={4} />
          ) : (
            bookings.slice(0, 12).map(({ booking, state }) => (
              <tr
                key={booking.id}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="py-3 pr-4">
                  <BookingCell booking={booking} />
                </td>
                <td className="pr-4 text-slate-700 dark:text-slate-300">
                  {clientNameFor(booking)}
                </td>
                <td className="pr-4">
                  <StatusPill status={state.displayStatus} />
                </td>
                <td>
                  <Link
                    href={routingLink(booking.shipping_instruction_id)}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-300"
                  >
                    Asignar operación
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </DashboardPanel>
  )
}

function StatusDriftTable({ bookings }: { bookings: OperationalBooking[] }) {
  return (
    <DashboardPanel
      title="Estados por conciliar"
      description="El estado guardado no coincide con referencias o fechas operativas existentes."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-3 pr-4">Booking</th>
            <th className="pr-4">Guardado</th>
            <th className="pr-4">Derivado</th>
            <th>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {bookings.length === 0 ? (
            <EmptyRow colSpan={4} />
          ) : (
            bookings.slice(0, 12).map(({ booking, state }) => (
              <tr
                key={booking.id}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="py-3 pr-4">
                  <BookingCell booking={booking} />
                </td>
                <td className="pr-4 text-slate-600 dark:text-slate-300">
                  {state.persistedStatus}
                </td>
                <td className="pr-4">
                  <StatusPill status={state.displayStatus} />
                </td>
                <td className="max-w-sm text-xs text-amber-700 dark:text-amber-300">
                  {state.statusDriftReason}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </DashboardPanel>
  )
}

function ContainerGapsTable({ gaps }: { gaps: RoutingContainerGap[] }) {
  return (
    <DashboardPanel
      title="Contenedores sin asignar"
      description="Comparación entre contenedores esperados y asignados por RT."
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-3 pr-4">SI</th>
            <th className="pr-4">Cliente</th>
            <th className="pr-4">Esperados</th>
            <th className="pr-4">Asignados</th>
            <th>Pendientes</th>
          </tr>
        </thead>
        <tbody>
          {gaps.length === 0 ? (
            <EmptyRow colSpan={5} />
          ) : (
            gaps.slice(0, 12).map((gap) => (
              <tr
                key={gap.routingId}
                className="border-t border-slate-100 dark:border-slate-800"
              >
                <td className="py-3 pr-4">
                  <Link
                    href={routingLink(gap.routingId)}
                    className="font-semibold text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-300"
                  >
                    {gap.routingNumber}
                  </Link>
                </td>
                <td className="pr-4 text-slate-700 dark:text-slate-300">
                  {gap.clientName}
                </td>
                <td className="pr-4 text-slate-700 dark:text-slate-300">
                  {gap.expected}
                </td>
                <td className="pr-4 text-slate-700 dark:text-slate-300">
                  {gap.assigned}
                </td>
                <td>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">
                    <PackageOpen className="h-3.5 w-3.5" />
                    {gap.missing}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </DashboardPanel>
  )
}

function DocumentationGapsTable({ gaps }: { gaps: DocumentationGap[] }) {
  return (
    <div className="xl:col-span-2">
      <DashboardPanel
        title="Documentación incompleta"
        description="Documentos requeridos no adjuntos por booking."
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-3 pr-4">Booking</th>
              <th className="pr-4">Cliente</th>
              <th className="pr-4">Faltantes</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {gaps.length === 0 ? (
              <EmptyRow colSpan={4} />
            ) : (
              gaps.slice(0, 16).map((gap) => (
                <tr
                  key={gap.booking.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="py-3 pr-4">
                    <BookingCell booking={gap.booking} />
                  </td>
                  <td className="pr-4 text-slate-700 dark:text-slate-300">
                    {clientNameFor(gap.booking)}
                  </td>
                  <td className="pr-4">
                    <div className="flex flex-wrap gap-1.5">
                      {gap.missing.map((documentType) => (
                        <span
                          key={documentType}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {documentType}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={gap.state.displayStatus} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DashboardPanel>
    </div>
  )
}

function ReadinessGapsTable({
  gaps,
  bookings,
}: {
  gaps: ReadinessOverview[]
  bookings: BookingRow[]
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220] xl:col-span-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h2 className="font-semibold text-slate-900 dark:text-white">
          Readiness previo al embarque
        </h2>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2 pr-4">Booking</th>
              <th className="pr-4">Modalidad</th>
              <th className="pr-4">Bloqueos</th>
              <th className="pr-4">VGM pendientes</th>
              <th className="pr-4">Cut-offs vencidos</th>
              <th>Próximo cut-off</th>
            </tr>
          </thead>
          <tbody>
            {gaps.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="border-t border-slate-100 py-6 text-center text-slate-500 dark:border-slate-800"
                >
                  No hay bookings activos bloqueados.
                </td>
              </tr>
            ) : (
              gaps.map((gap) => {
                const booking = bookings.find(
                  (candidate) => candidate.id === gap.booking_id
                )
                return (
                  <tr
                    key={gap.booking_id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 pr-4">
                      {booking ? (
                        <Link
                          href={`/operations/shipping-instructions/${booking.shipping_instruction_id}/bookings/${booking.id}`}
                          className="font-semibold text-blue-600 hover:underline"
                        >
                          {gap.booking_number || gap.booking_id.slice(0, 8)}
                        </Link>
                      ) : (
                        gap.booking_number || gap.booking_id.slice(0, 8)
                      )}
                    </td>
                    <td className="pr-4">{gap.mode}</td>
                    <td className="pr-4 font-semibold text-red-600">
                      {gap.blocking_count}
                    </td>
                    <td className="pr-4">{gap.missing_vgm_count}</td>
                    <td className="pr-4">{gap.overdue_cutoff_count}</td>
                    <td>
                      {gap.next_cutoff
                        ? new Intl.DateTimeFormat('es-HN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(gap.next_cutoff))
                        : 'N/A'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
