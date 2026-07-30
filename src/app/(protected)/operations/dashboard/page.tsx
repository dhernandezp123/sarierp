'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileWarning,
  PackageOpen,
  Ship,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { aggregateBookingStatus } from '@/src/lib/booking-status'

type ClientJoin = {
  nombre: string | null
}

type QuotationJoin = {
  id: string
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
  quotation: QuotationJoin | QuotationJoin[] | null
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
  eta: string | null
  actual_eta: string | null
  shipment_status: string | null
  free_days: number | null
  remaining_free_days: number | null
  created_at: string | null
  shipping_instruction: ShippingInstructionJoin | ShippingInstructionJoin[] | null
  booking_containers: BookingContainerJoin[] | null
  booking_documents: BookingDocumentJoin[] | null
  bills_of_lading: BillOfLadingJoin[] | null
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
  missing: string[]
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

const requiredDocumentTypes = [
  'Booking Confirmation',
  'Master BL',
  'House BL',
  'Packing List',
  'Commercial Invoice',
]

function resolveJoin<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function normalizeStatus(status?: string | null) {
  return (status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isFinalStatus(status?: string | null) {
  const normalized = normalizeStatus(status)
  return normalized === 'Finalizado' || normalized === 'Convertida a Shipment'
}

function isInTransit(status?: string | null) {
  return normalizeStatus(status) === 'En Transito'
}

function isArrived(status?: string | null) {
  return normalizeStatus(status) === 'Arribado'
}

function isPendingConfirmation(booking: BookingRow) {
  const normalized = normalizeStatus(booking.shipment_status)
  return (
    normalized === 'Booking Solicitado' ||
    !booking.booking_number ||
    !booking.carrier_booking
  )
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A'

  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function daysUntil(value?: string | null) {
  if (!value) return null

  const target = new Date(value)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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

function missingDocuments(booking: BookingRow) {
  const attached = new Set(
    (booking.booking_documents || [])
      .map((document) => document.document_type)
      .filter((type): type is string => Boolean(type))
  )

  ;(booking.bills_of_lading || []).forEach((bill) => {
    if (bill.bl_type === 'MBL') attached.add('Master BL')
    if (bill.bl_type === 'HBL') attached.add('House BL')
  })

  return requiredDocumentTypes.filter((type) => !attached.has(type))
}

export default function OperationsDashboardPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [quotationTotals, setQuotationTotals] = useState<Record<string, number>>({})
  const [readinessOverview, setReadinessOverview] = useState<ReadinessOverview[]>([])
  const [loading, setLoading] = useState(true)

  const loadDashboard = async () => {
    setLoading(true)

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
        eta,
        actual_eta,
        shipment_status,
        free_days,
        remaining_free_days,
        created_at,
        shipping_instruction:shipping_instructions (
          id,
          routing_number,
          operational_status,
          operations_assigned_to,
          container_qty,
          container_type,
          quotation_id,
          quotation:quotations (
            id,
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
          bl_type
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

    if (bookingsError) {
      setBookings([])
    } else {
      setBookings((bookingsData || []) as BookingRow[])
    }

    if (quotationContainersError) {
      setQuotationTotals({})
    } else {
      const totals = ((quotationContainersData || []) as QuotationContainerRow[])
        .reduce<Record<string, number>>((acc, container) => {
          if (!container.quotation_id) return acc

          acc[container.quotation_id] =
            (acc[container.quotation_id] || 0) + Number(container.quantity || 0)

          return acc
        }, {})

      setQuotationTotals(totals)
    }

    if (readinessError) {
      setReadinessOverview([])
    } else {
      setReadinessOverview((readinessData || []) as ReadinessOverview[])
    }

    setLoading(false)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadDashboard()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  const dashboard = useMemo(() => {
    const activeBookings = bookings.filter(
      (booking) => !isFinalStatus(booking.shipment_status)
    )

    const inTransitBookings = activeBookings.filter((booking) =>
      isInTransit(booking.shipment_status)
    )

    const arrivedThisMonth = bookings.filter((booking) => {
      const dateValue = booking.actual_eta || booking.eta
      return isArrived(booking.shipment_status) && isCurrentMonth(dateValue)
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

    const etaNextSevenDays = activeBookings
      .filter((booking) => {
        const days = daysUntil(booking.actual_eta || booking.eta)
        return days !== null && days >= 0 && days <= 7
      })
      .sort((a, b) => {
        const aDays = daysUntil(a.actual_eta || a.eta) ?? 99
        const bDays = daysUntil(b.actual_eta || b.eta) ?? 99
        return aDays - bDays
      })

    const freeDaysExpiring = activeBookings
      .filter((booking) => getFreeDaysDisplay(booking).includeInExpiring)
      .sort(
        (a, b) =>
          getFreeDaysDisplay(a).sortValue - getFreeDaysDisplay(b).sortValue
      )

    const pendingConfirmation = activeBookings.filter(isPendingConfirmation)

    const bookingsByRouting = activeBookings.reduce<Record<string, BookingRow[]>>(
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
      .map<DocumentationGap | null>((booking) => {
        const missing = missingDocuments(booking)
        return missing.length > 0 ? { booking, missing } : null
      })
      .filter((gap): gap is DocumentationGap => Boolean(gap))

    const activeBookingIds = new Set(activeBookings.map((booking) => booking.id))
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

    return {
      metrics: {
        activeBookings: activeBookings.length,
        inTransitBookings: inTransitBookings.length,
        arrivedThisMonth: arrivedThisMonth.length,
        openRoutings: openRoutingIds.size,
        pendingDocuments: documentationGaps.length,
        notReady: readinessGaps.length,
        overdueCutoffs: readinessGaps.reduce(
          (sum, overview) => sum + overview.overdue_cutoff_count,
          0
        ),
      },
      etaNextSevenDays,
      freeDaysExpiring,
      pendingConfirmation,
      containerGaps,
      documentationGaps,
      readinessGaps,
    }
  }, [bookings, quotationTotals, readinessOverview])

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

  return (
    <div>
      <div className="mb-6">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
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
          title="Cut-offs vencidos"
          value={dashboard.metrics.overdueCutoffs}
          icon={<Clock3 className="h-5 w-5" />}
          danger={dashboard.metrics.overdueCutoffs > 0}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <EtaTable bookings={dashboard.etaNextSevenDays} />
        <FreeDaysTable bookings={dashboard.freeDaysExpiring} />
        <PendingConfirmationTable bookings={dashboard.pendingConfirmation} />
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

function EtaTable({ bookings }: { bookings: BookingRow[] }) {
  return (
    <DashboardPanel
      title="ETA próximos 7 días"
      description="Bookings activos con ETA cercana."
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
            bookings.slice(0, 12).map((booking) => {
              const eta = booking.actual_eta || booking.eta
              const days = daysUntil(eta)

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
                    {formatDate(eta)}
                  </td>
                  <td className="pr-4 font-semibold text-blue-600 dark:text-blue-300">
                    {days === 0 ? 'Hoy' : `${days} días`}
                  </td>
                  <td>
                    <StatusPill status={booking.shipment_status} />
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

function FreeDaysTable({ bookings }: { bookings: BookingRow[] }) {
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
            bookings.slice(0, 12).map((booking) => {
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
                    <StatusPill status={booking.shipment_status} />
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

function PendingConfirmationTable({ bookings }: { bookings: BookingRow[] }) {
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
            bookings.slice(0, 12).map((booking) => (
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
                  <StatusPill status={booking.shipment_status} />
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
                    <StatusPill status={gap.booking.shipment_status} />
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
