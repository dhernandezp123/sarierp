'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Anchor, AlertTriangle, ArrowRight, FileClock, RefreshCw, Search, Ship, UserX } from 'lucide-react'
import { FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { OperationFilterMetric, OperationStatusBadge, operationTableHeadClass } from '@/src/components/operations/OperationsWorkspace'
import { operationStatuses } from '@/src/lib/operation-status'
import { supabase } from '@/src/lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { fieldLabelClass, filterSelectClass } from '@/src/lib/ui-classes'
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

  const noFilters = statusFilter === 'Todos' && etaFilter === 'Todos' && assignmentFilter === 'Todos' && !search.trim()
  const resetFilters = () => {
    setSearch('')
    setStatusFilter('Todos')
    setEtaFilter('Todos')
    setAssignmentFilter('Todos')
    setPage(1)
  }
  const toggle = (setter: (value: string) => void, current: string, value: string) => {
    setter(current === value ? 'Todos' : value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <BookingsHeader onRefresh={() => void loadItems()} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <OperationFilterMetric label="Activos" value={metrics.active} icon={Ship} active={noFilters} onClick={resetFilters} />
        <OperationFilterMetric label="Sin número de booking" value={metrics.withoutBooking} icon={FileClock} tone="amber" />
        <OperationFilterMetric label="En tránsito" value={metrics.inTransit} icon={Ship} tone="sky" active={statusFilter === 'En Tránsito'} onClick={() => toggle(setStatusFilter, statusFilter, 'En Tránsito')} />
        <OperationFilterMetric label="Arribos en 7 días" value={metrics.arrivalsSoon} icon={Anchor} tone="emerald" active={etaFilter === 'Próximos 7 días'} onClick={() => toggle(setEtaFilter, etaFilter, 'Próximos 7 días')} />
        <OperationFilterMetric label="Con retraso" value={metrics.delayed} icon={AlertTriangle} tone={metrics.delayed > 0 ? 'red' : 'slate'} active={etaFilter === 'Con retraso'} onClick={() => toggle(setEtaFilter, etaFilter, 'Con retraso')} />
        <OperationFilterMetric label="Sin asignar" value={metrics.unassigned} icon={UserX} tone={metrics.unassigned > 0 ? 'amber' : 'slate'} active={assignmentFilter === 'Sin asignar'} onClick={() => toggle(setAssignmentFilter, assignmentFilter, 'Sin asignar')} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>Buscar</span>
          <span className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="RT, referencia, booking, cliente o naviera"
              className={`${filterSelectClass} w-full pl-9`}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>Estado</span>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={`${filterSelectClass} w-full`}>
            <option value="Todos">Todos los estados</option>
            {operationStatuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>ETA</span>
          <select value={etaFilter} onChange={(e) => { setEtaFilter(e.target.value); setPage(1) }} className={`${filterSelectClass} w-full`}>
            <option value="Todos">Todas las ETA</option>
            <option value="Sin ETA">Sin ETA</option>
            <option value="Con retraso">Con retraso</option>
            <option value="Próximos 7 días">Próximos 7 días</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>Responsable</span>
          <select value={assignmentFilter} onChange={(e) => { setAssignmentFilter(e.target.value); setPage(1) }} className={`${filterSelectClass} w-full`}>
            <option value="Todos">Todas las asignaciones</option>
            <option value="Sin asignar">Sin asignar</option>
            <option value="Asignados">Asignados</option>
          </select>
        </label>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Bookings <span className="text-sm font-medium text-slate-500 tabular-nums dark:text-slate-400">({filteredItems.length})</span>
          </h2>
          {!noFilters && (
            <button type="button" onClick={resetFilters} className="text-xs font-semibold text-[#B3282D] hover:underline dark:text-rose-300">
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="relative overflow-x-auto" role="region" aria-label="Listado de bookings" tabIndex={0}>
          <table className="w-full min-w-[1040px] text-sm">
            <thead className={operationTableHeadClass}>
              <tr>
                {['Booking', 'Cliente', 'Naviera', 'ETD', 'ETA', 'Estado', 'Responsable', 'Siguiente acción'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    {items.length === 0 ? 'No hay bookings activos.' : 'No hay bookings que coincidan con los filtros.'}
                  </td>
                </tr>
              ) : paginatedItems.map((item) => {
                const assigned =
                  item.assigned_user?.nombre || item.assigned_user?.apellido
                    ? `${item.assigned_user?.nombre || ''} ${item.assigned_user?.apellido || ''}`.trim()
                    : ''
                const state = item.operational_state
                const bookingPath = `/operations/shipping-instructions/${item.shipping_instruction_id}/bookings/${item.id}`

                return (
                  <tr key={item.id} className={`border-b border-slate-100 align-top transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40 ${state.eta.kind === 'overdue' ? 'bg-red-50/40 dark:bg-red-950/10' : ''}`}>
                    <th scope="row" className="whitespace-nowrap px-4 py-3 text-left">
                      <Link href={bookingPath} className="rounded-sm font-semibold text-[#B3282D] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 dark:text-rose-300">
                        {item.booking_number || item.reference_number || 'Sin número'}
                      </Link>
                      <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{item.routing_number}</span>
                    </th>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.cliente?.nombre || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.carrier || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{formatDate(item.etd, '—')}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={
                        state.eta.kind === 'overdue'
                          ? 'font-semibold text-red-700 dark:text-red-300'
                          : state.eta.kind === 'today'
                            ? 'font-semibold text-amber-700 dark:text-amber-300'
                            : 'text-slate-700 dark:text-slate-200'
                      }>
                        {state.eta.label}
                      </span>
                      {state.eta.date && state.eta.kind !== 'scheduled' && (
                        <span className="block text-xs tabular-nums text-slate-500 dark:text-slate-400">{formatDate(state.eta.date)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <OperationStatusBadge status={state.displayStatus} className="whitespace-nowrap" />
                      {state.hasStatusDrift && (
                        <span className="mt-1 block max-w-40 text-xs text-amber-700 dark:text-amber-300">Registrado: {state.persistedStatus}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assigned
                        ? <span className="text-slate-700 dark:text-slate-200">{assigned}</span>
                        : <span className="font-semibold text-amber-700 dark:text-amber-300">Sin asignar</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={actionHref(item)} className="inline-flex items-center gap-1 font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-[#B3282D] dark:text-white dark:decoration-slate-600">
                        {state.nextAction?.label || 'Abrir booking'}
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                      </Link>
                      {state.attentionReason && (
                        <span className="mt-1 block max-w-56 text-xs text-slate-500 dark:text-slate-400">{state.attentionReason}</span>
                      )}
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
      </section>
    </div>
  )
}

function BookingsHeader({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <FinancePageHeader
      eyebrow="Operaciones"
      icon={Ship}
      title="Bookings"
      description="Bandeja diaria de bookings activos: ETAs, responsables y siguiente acción."
      actions={onRefresh ? (
        <button type="button" onClick={onRefresh} className={financeActionClass}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Actualizar
        </button>
      ) : undefined}
    />
  )
}
