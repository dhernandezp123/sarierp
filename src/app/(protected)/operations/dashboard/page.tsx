'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  PackageOpen,
  Ship,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'

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
  booking_number: string | null
  shipment_status: string | null
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

type BookingRow = {
  id: string
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

  return requiredDocumentTypes.filter((type) => !attached.has(type))
}

export default function OperationsDashboardPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [quotationTotals, setQuotationTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const loadDashboard = async () => {
    setLoading(true)

    const { data: bookingsData, error: bookingsError } = await supabase
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
        eta,
        actual_eta,
        shipment_status,
        free_days,
        remaining_free_days,
        created_at,
        shipping_instruction:shipping_instructions (
          id,
          routing_number,
          booking_number,
          shipment_status,
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
        )
      `)
      .order('created_at', { ascending: false })

    const { data: quotationContainersData, error: quotationContainersError } =
      await supabase
        .from('quotation_containers')
        .select('quotation_id, quantity')

    if (bookingsError) {
      console.error('Error loading operations dashboard bookings:', bookingsError)
      setBookings([])
    } else {
      setBookings((bookingsData || []) as BookingRow[])
    }

    if (quotationContainersError) {
      console.error(
        'Error loading operations dashboard quotation containers:',
        quotationContainersError
      )
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

    setLoading(false)
  }

  useEffect(() => {
    loadDashboard()
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

    const openRoutingIds = new Set(
      bookings
        .map((booking) => resolveJoin(booking.shipping_instruction))
        .filter((routing): routing is ShippingInstructionJoin => Boolean(routing))
        .filter((routing) => !isFinalStatus(routing.shipment_status))
        .map((routing) => routing.id)
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
        acc[booking.shipping_instruction_id] = [
          ...(acc[booking.shipping_instruction_id] || []),
          booking,
        ]
        return acc
      },
      {}
    )

    const containerGaps = Object.entries(bookingsByRouting)
      .map<RoutingContainerGap | null>(([routingId, routingBookings]) => {
        const routing = resolveJoin(routingBookings[0]?.shipping_instruction)
        if (!routing) return null

        const expected = expectedContainersFromRouting(routing, quotationTotals)
        const assigned = assignedContainerTotal(routingBookings)
        const missing = Math.max(expected - assigned, 0)

        if (expected <= 0 || missing <= 0) return null

        return {
          routingId,
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

    return {
      metrics: {
        activeBookings: activeBookings.length,
        inTransitBookings: inTransitBookings.length,
        arrivedThisMonth: arrivedThisMonth.length,
        openRoutings: openRoutingIds.size,
        pendingDocuments: documentationGaps.length,
      },
      etaNextSevenDays,
      freeDaysExpiring,
      pendingConfirmation,
      containerGaps,
      documentationGaps,
    }
  }, [bookings, quotationTotals])

  if (loading) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Cargando dashboard operativo...
      </p>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <EtaTable bookings={dashboard.etaNextSevenDays} />
        <FreeDaysTable bookings={dashboard.freeDaysExpiring} />
        <PendingConfirmationTable bookings={dashboard.pendingConfirmation} />
        <ContainerGapsTable gaps={dashboard.containerGaps} />
        <DocumentationGapsTable gaps={dashboard.documentationGaps} />
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
