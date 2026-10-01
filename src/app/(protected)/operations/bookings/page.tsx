'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { operationStatuses } from '@/src/lib/operation-status'
import { supabase } from '@/src/lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { filterSelectClass } from '@/src/lib/ui-classes'
import { Pagination } from '@/src/components/ui/Pagination'
import {
  deriveBookingOperationalState,
  type BookingOperationalState,
} from '@/src/lib/booking-operational-state'
import { formatDate } from '@/src/lib/format'

type BookingItem = {
  id: string
  shipment_id: string | null
  shipping_instruction_id: string
  routing_number: string
  reference_number: string | null
  booking_number: string | null
  carrier_booking: string | null
  shipment_status: string | null
  carrier: string | null
  etd: string | null
  eta: string | null
  actual_etd: string | null
  actual_eta: string | null
  operations_assigned_to: string | null
  tracking_url: string | null
  cliente?: { nombre: string | null } | null
  assigned_user?: {
    nombre: string | null
    apellido: string | null
  } | null
  operational_state: BookingOperationalState
}

type BookingQueryItem = Omit<
  BookingItem,
  | 'routing_number'
  | 'reference_number'
  | 'operations_assigned_to'
  | 'cliente'
  | 'assigned_user'
  | 'operational_state'
> & {
  booking_documents: Array<{ document_type: string | null }> | null
  bills_of_lading: Array<{
    bl_type: string | null
    status: string | null
  }> | null
  shipment:
    | { requires_hbl: boolean | null; service_type: string | null }
    | Array<{ requires_hbl: boolean | null; service_type: string | null }>
    | null
  shipping_instruction:
    | {
        routing_number: string | null
        reference_number: string | null
        operations_assigned_to: string | null
        cliente:
          | { nombre: string | null }
          | Array<{ nombre: string | null }>
          | null
        assigned_user:
          | { nombre: string | null; apellido: string | null }
          | Array<{ nombre: string | null; apellido: string | null }>
          | null
        quotation:
          | { tipo_transporte: string | null; quote_type: string | null }
          | Array<{ tipo_transporte: string | null; quote_type: string | null }>
          | null
      }
    | Array<{
        routing_number: string | null
        reference_number: string | null
        operations_assigned_to: string | null
        cliente:
          | { nombre: string | null }
          | Array<{ nombre: string | null }>
          | null
        assigned_user:
          | { nombre: string | null; apellido: string | null }
          | Array<{ nombre: string | null; apellido: string | null }>
          | null
        quotation:
          | { tipo_transporte: string | null; quote_type: string | null }
          | Array<{ tipo_transporte: string | null; quote_type: string | null }>
          | null
      }>
    | null
}

type ReadinessOverview = {
  booking_id: string
  mode: string
  ready: boolean
  blocking_count: number
  warning_count: number
  overdue_cutoff_count: number
  missing_vgm_count: number
}

function resolveJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function getStatusBadgeClass(status?: string | null) {
  switch (status) {
    case 'Pendiente Validación':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Validada':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Booking Solicitado':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    case 'Booking Confirmado':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'Documentación Pendiente':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Listo para Embarque':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
    case 'Embarcado':
    case 'En Tránsito':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    case 'Arribado':
    case 'Finalizado':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function actionHref(item: BookingItem) {
  const bookingPath = `/operations/shipping-instructions/${item.shipping_instruction_id}/bookings/${item.id}`
  const target = item.operational_state.nextAction?.target

  if (target === 'shipping_instruction') {
    return `/operations/shipping-instructions/${item.shipping_instruction_id}`
  }
  if (target === 'booking_schedule') return `${bookingPath}#booking-schedule`
  if (target === 'booking_readiness') return `${bookingPath}#booking-readiness`
  if (target === 'booking_documents') return `${bookingPath}#booking-documents`
  return bookingPath
}

export default function OperationsBookingsPage() {
  const [items, setItems] = useState<BookingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [etaFilter, setEtaFilter] = useState('Todos')
  const [assignmentFilter, setAssignmentFilter] = useState('Todos')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [errorMessage, setErrorMessage] = useState('')

  const loadItems = async () => {
    setLoading(true)
    setErrorMessage('')

    const [bookingsResult, readinessResult] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          shipment_id,
          shipping_instruction_id,
          booking_number,
          carrier_booking,
          shipment_status,
          carrier,
          etd,
          eta,
          actual_etd,
          actual_eta,
          tracking_url,
          created_at,
          shipment:shipments!bookings_shipment_id_fkey (
            requires_hbl,
            service_type
          ),
          shipping_instruction:shipping_instructions!bookings_shipping_instruction_id_fkey (
            id,
            routing_number,
            reference_number,
            operations_assigned_to,
            cliente:clientes (
              nombre
            ),
            assigned_user:profiles!shipping_instructions_operations_assigned_to_fkey (
              nombre,
              apellido
            ),
            quotation:quotations (
              tipo_transporte,
              quote_type
            )
          ),
          booking_documents (
            document_type
          ),
          bills_of_lading (
            bl_type,
            status
          )
        `)
        .eq('booking_lifecycle_status', 'ACTIVE')
        .order('created_at', { ascending: false }),
      supabase.rpc('get_booking_readiness_overview', { p_shipment_id: null }),
    ])

    const loadError = bookingsResult.error || readinessResult.error
    if (loadError) {
      setItems([])
      setErrorMessage(loadError.message)
      setLoading(false)
      return
    }

    if (bookingsResult.data) {
      const readinessByBookingId = new Map(
        ((readinessResult.data || []) as ReadinessOverview[]).map((overview) => [
          overview.booking_id,
          overview,
        ])
      )
      const normalizedItems = (bookingsResult.data as BookingQueryItem[]).map((item) => {
        const shippingInstruction = Array.isArray(item.shipping_instruction)
          ? item.shipping_instruction[0] ?? null
          : item.shipping_instruction
        const cliente = Array.isArray(shippingInstruction?.cliente)
          ? shippingInstruction.cliente[0] ?? null
          : shippingInstruction?.cliente ?? null
        const assignedUser = Array.isArray(shippingInstruction?.assigned_user)
          ? shippingInstruction.assigned_user[0] ?? null
          : shippingInstruction?.assigned_user ?? null
        const quotation = resolveJoin(shippingInstruction?.quotation)
        const shipment = resolveJoin(item.shipment)
        const readiness = readinessByBookingId.get(item.id) || null
        const operationalState = deriveBookingOperationalState({
          shipmentStatus: item.shipment_status,
          bookingNumber: item.booking_number,
          carrierBooking: item.carrier_booking,
          etd: item.etd,
          eta: item.eta,
          actualEtd: item.actual_etd,
          actualEta: item.actual_eta,
          assignedTo: shippingInstruction?.operations_assigned_to,
          mode:
            readiness?.mode ||
            quotation?.tipo_transporte ||
            quotation?.quote_type ||
            shipment?.service_type,
          requiresHbl: shipment?.requires_hbl,
          documents: item.booking_documents,
          bills: item.bills_of_lading,
          readiness,
        })

        return {
          id: item.id,
          shipment_id: item.shipment_id,
          shipping_instruction_id: item.shipping_instruction_id,
          routing_number: shippingInstruction?.routing_number || 'N/A',
          reference_number: shippingInstruction?.reference_number || null,
          booking_number: item.booking_number,
          carrier_booking: item.carrier_booking,
          shipment_status: item.shipment_status,
          carrier: item.carrier,
          etd: item.etd,
          eta: item.eta,
          actual_etd: item.actual_etd,
          actual_eta: item.actual_eta,
          operations_assigned_to:
            shippingInstruction?.operations_assigned_to || null,
          tracking_url: item.tracking_url,
          cliente,
          assigned_user: assignedUser,
          operational_state: operationalState,
        } satisfies BookingItem
      })

      setItems(normalizedItems)
    }

    setLoading(false)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadItems()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [])

  const metrics = useMemo(() => {
    const active = items.filter(
      (item) => !item.operational_state.isFinal
    ).length

    const withoutBooking = items.filter(
      (item) => item.operational_state.isPendingConfirmation
    ).length

    const inTransit = items.filter(
      (item) => item.operational_state.displayStatus === 'En Tránsito'
    ).length

    const arrivalsSoon = items.filter((item) =>
      ['today', 'upcoming'].includes(item.operational_state.eta.kind)
    ).length

    const delayed = items.filter(
      (item) => item.operational_state.eta.kind === 'overdue'
    ).length
    const unassigned = items.filter(
      (item) => item.operational_state.isUnassigned
    ).length

    return { active, withoutBooking, inTransit, arrivalsSoon, delayed, unassigned }
  }, [items])

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase()

    const assigned =
      item.assigned_user?.nombre || item.assigned_user?.apellido
        ? `${item.assigned_user?.nombre || ''} ${
            item.assigned_user?.apellido || ''
          }`.trim()
        : ''

    const matchesSearch =
      item.routing_number?.toLowerCase().includes(query) ||
      item.reference_number?.toLowerCase().includes(query) ||
      item.booking_number?.toLowerCase().includes(query) ||
      item.carrier_booking?.toLowerCase().includes(query) ||
      item.carrier?.toLowerCase().includes(query) ||
      item.cliente?.nombre?.toLowerCase().includes(query) ||
      assigned.toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'Todos' ||
      item.operational_state.displayStatus === statusFilter

    const matchesEta =
      etaFilter === 'Todos' ||
      (etaFilter === 'Sin ETA' && item.operational_state.eta.kind === 'missing') ||
      (etaFilter === 'Con retraso' &&
        item.operational_state.eta.kind === 'overdue') ||
      (etaFilter === 'Próximos 7 días' &&
        ['today', 'upcoming'].includes(item.operational_state.eta.kind))

    const matchesAssignment =
      assignmentFilter === 'Todos' ||
      (assignmentFilter === 'Sin asignar' && item.operational_state.isUnassigned) ||
      (assignmentFilter === 'Asignados' && !item.operational_state.isUnassigned)

    return matchesSearch && matchesStatus && matchesEta && matchesAssignment
  })

  const paginatedItems = filteredItems.slice((page - 1) * pageSize, page * pageSize)

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
          <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
          <TableSkeleton rows={7} cols={8} />
        </div>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <BookingsHeader />
        <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm dark:border-red-900/50 dark:bg-red-950/20">
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-300"
            />
            <div>
              <h2 className="font-semibold text-red-900 dark:text-red-100">
                No se pudieron cargar los bookings
              </h2>
              <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-200">
                {errorMessage}
              </p>
              <button
                type="button"
                onClick={() => void loadItems()}
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
        <BookingsHeader />
        <button
          type="button"
          onClick={() => void loadItems()}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard title="Activos" value={metrics.active} />
        <MetricCard title="Sin Booking" value={metrics.withoutBooking} />
        <MetricCard title="En Tránsito" value={metrics.inTransit} />
        <MetricCard title="Arribos 7 días" value={metrics.arrivalsSoon} />
        <MetricCard title="Con retraso" value={metrics.delayed} danger />
        <MetricCard title="Sin asignar" value={metrics.unassigned} danger />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-4">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar RT, referencia, booking, cliente o carrier..."
          className={filterSelectClass}
        />

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className={filterSelectClass}
        >
          <option value="Todos">Todos los estados</option>
          {operationStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={etaFilter}
          onChange={(e) => { setEtaFilter(e.target.value); setPage(1) }}
          className={filterSelectClass}
        >
          <option value="Todos">Todas las ETA</option>
          <option value="Sin ETA">Sin ETA</option>
          <option value="Con retraso">Con retraso</option>
          <option value="Próximos 7 días">Próximos 7 días</option>
        </select>

        <select
          value={assignmentFilter}
          onChange={(e) => { setAssignmentFilter(e.target.value); setPage(1) }}
          className={filterSelectClass}
        >
          <option value="Todos">Todas las asignaciones</option>
          <option value="Sin asignar">Sin asignar</option>
          <option value="Asignados">Asignados</option>
        </select>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Bookings ({filteredItems.length})
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3">Referencia</th>
                <th>SI</th>
                <th>Cliente</th>
                <th>Carrier</th>
                <th>Booking</th>
                <th>ETD</th>
                <th>ETA</th>
                <th>Estado derivado</th>
                <th>Asignado</th>
                <th>Siguiente acción</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="border-t border-slate-100 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400"
                  >
                    {items.length === 0
                      ? 'No hay bookings activos.'
                      : 'No hay bookings que coincidan con los filtros.'}
                  </td>
                </tr>
              ) : paginatedItems.map((item) => {
                const assigned =
                  item.assigned_user?.nombre || item.assigned_user?.apellido
                    ? `${item.assigned_user?.nombre || ''} ${
                        item.assigned_user?.apellido || ''
                      }`.trim()
                    : 'Sin asignar'
                const state = item.operational_state
                const isDelayed = state.eta.kind === 'overdue'

                return (
                  <tr
                    key={item.id}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      isDelayed ? 'bg-red-50/50 dark:bg-red-950/10' : ''
                    }`}
                  >
                    <td className="py-3 font-semibold text-slate-900 dark:text-white">
                      {item.reference_number || 'N/A'}
                    </td>
                    <td>{item.routing_number}</td>
                    <td>{item.cliente?.nombre || 'N/A'}</td>
                    <td>{item.carrier || 'N/A'}</td>
                    <td>{item.booking_number || 'Pendiente'}</td>
                    <td>{formatDate(item.etd, 'N/A')}</td>
                    <td>
                      <div>
                        <p
                          className={
                            state.eta.kind === 'overdue'
                              ? 'font-semibold text-red-600 dark:text-red-400'
                              : state.eta.kind === 'today'
                                ? 'font-semibold text-amber-600 dark:text-amber-400'
                                : state.eta.kind === 'upcoming'
                                  ? 'font-semibold text-blue-600 dark:text-blue-400'
                                  : 'text-slate-600 dark:text-slate-300'
                          }
                        >
                          {state.eta.label}
                        </p>
                        {state.eta.date && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(state.eta.date)}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          state.displayStatus
                        )}`}
                      >
                        {state.displayStatus}
                      </span>
                      {state.hasStatusDrift && (
                        <p className="mt-1 max-w-40 text-xs text-amber-700 dark:text-amber-300">
                          Registrado: {state.persistedStatus}
                        </p>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          state.isUnassigned
                            ? 'font-semibold text-amber-700 dark:text-amber-300'
                            : undefined
                        }
                      >
                        {assigned}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={actionHref(item)}
                        className="font-semibold text-blue-600 hover:underline dark:text-blue-300"
                      >
                        {state.nextAction?.label || 'Abrir booking'}
                      </Link>
                      {state.attentionReason && (
                        <p className="mt-1 max-w-48 text-xs text-slate-500 dark:text-slate-400">
                          {state.attentionReason}
                        </p>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/operations/shipping-instructions/${item.shipping_instruction_id}/bookings/${item.id}`}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Abrir
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filteredItems.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>
    </div>
  )
}

function BookingsHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
        Bookings Operativos
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Bandeja diaria de operaciones activas, ETAs y tracking.
      </p>
    </div>
  )
}

function MetricCard({
  title,
  value,
  danger,
}: {
  title: string
  value: number
  danger?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm ${
        danger
          ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
          : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'
      }`}
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  )
}
