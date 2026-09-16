'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, RefreshCw, Route } from 'lucide-react'

import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import {
  fieldClass,
  cardClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'
import { formatDate } from '@/src/lib/format'
import {
  resolveShippingInstructionStatus,
  shippingInstructionFilterStatuses,
} from '@/src/lib/operation-status'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type RoutingItem = {
  id: string
  routing_number: string
  shipment_status: string | null
  operational_status: string | null
  created_by: string | null
  agent_name: string | null
  created_at: string
  operations_assigned_to: string | null
  status: string | null
  origin_address: string | null
  destination_address: string | null
  container_qty: number | null
  container_type: string | null
  display_status: string
  cliente?: { nombre: string | null } | null
  quotation?: { quotation_number: string | null } | null
  assigned_user?: { nombre: string | null; apellido: string | null } | null
}

type RoutingMetrics = {
  total: number
  pendientes: number
  listos: number
  enBooking: number
}

type RoutingInboxResponse = {
  items?: RoutingItem[]
  total?: number
  page?: number
  page_size?: number
  metrics?: {
    total?: number
    pendientes?: number
    listos?: number
    en_booking?: number
  }
}

const emptyMetrics: RoutingMetrics = {
  total: 0,
  pendientes: 0,
  listos: 0,
  enBooking: 0,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveStatus(item: RoutingItem): string {
  return item.display_status || resolveShippingInstructionStatus(item)
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'Pendiente Validación':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Listo para Booking':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Booking Solicitado':
    case 'En Booking':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Booking Confirmado':
    case 'Parcialmente Confirmado':
    case 'Documentación Pendiente':
    case 'Listo para Embarque':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'Embarcado':
    case 'En Tránsito':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    case 'Arribo Parcial':
    case 'Arribado':
    case 'Finalizado':
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    case 'Cancelada':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
}

function formatContainer(item: RoutingItem): string {
  const type = item.container_type?.trim()
  const qty  = item.container_qty
  if (type && /^\d+\s*x\s+/i.test(type)) return type
  if (qty && type) return `${qty} x ${type}`
  if (type) return type
  return 'N/A'
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RoutingInboxPage() {
  const { user, loading: userLoading } = useUser()

  const [routingList, setRoutingList] = useState<RoutingItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search,       setSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [assignFilter, setAssignFilter] = useState('Todos')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [metrics, setMetrics] = useState<RoutingMetrics>(emptyMetrics)
  const requestSequence = useRef(0)

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('Todos')
    setAssignFilter('Todos')
    setPage(1)
  }

  const loadRouting = useCallback(async () => {
    if (userLoading) return

    if (!user?.id) {
      setRoutingList([])
      setTotal(0)
      setMetrics(emptyMetrics)
      setLoading(false)
      return
    }

    const requestId = ++requestSequence.current
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase.rpc('list_shipping_instructions', {
      p_search: debouncedSearch,
      p_status: statusFilter,
      p_assignment: assignFilter,
      p_page: page,
      p_page_size: pageSize,
    })

    if (requestId !== requestSequence.current) return

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    const response = (data || {}) as RoutingInboxResponse
    const responseMetrics = response.metrics || {}

    setRoutingList(response.items || [])
    setTotal(response.total || 0)
    setMetrics({
      total: responseMetrics.total || 0,
      pendientes: responseMetrics.pendientes || 0,
      listos: responseMetrics.listos || 0,
      enBooking: responseMetrics.en_booking || 0,
    })
    if (response.page && response.page !== page) setPage(response.page)
    setLoading(false)
  }, [assignFilter, debouncedSearch, page, pageSize, statusFilter, user?.id, userLoading])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 300)

    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRouting()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [loadRouting])

  const hasActiveFilters =
    debouncedSearch !== '' || statusFilter !== 'Todos' || assignFilter !== 'Todos'

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Shipping Instructions
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Instrucciones operativas enviadas por Ventas antes del booking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRouting()}
          disabled={loading}
          className={`${secondaryButtonClass} inline-flex items-center justify-center gap-2 self-start`}
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
          Actualizar
        </button>
      </div>

      {/* Métricas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total" value={metrics.total} />
        <MetricCard label="Pendientes validación" value={metrics.pendientes} color="amber" />
        <MetricCard label="Listos para booking"   value={metrics.listos}     color="emerald" />
        <MetricCard label="En booking"            value={metrics.enBooking}  color="blue" />
      </div>

      {/* Filtros */}
      <div className="grid gap-3 lg:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Buscar
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="RT, cotización, cliente o agente"
            className={fieldClass}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Asignación
          </span>
          <select
            value={assignFilter}
            onChange={(e) => { setAssignFilter(e.target.value); setPage(1) }}
            className={fieldClass}
          >
            <option value="Todos">Toda la asignación</option>
            <option value="Sin asignar">Sin asignar</option>
            <option value="Mis asignados">Mis asignados</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Estado
          </span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className={fieldClass}
          >
            <option value="Todos">Todos los estados</option>
            {shippingInstructionFilterStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Tabla */}
      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={10} />
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              No se pudieron cargar las Shipping Instructions. {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => void loadRouting()}
              className={secondaryButtonClass}
            >
              Reintentar
            </button>
          </div>
        ) : routingList.length === 0 ? (
          metrics.total === 0 && !hasActiveFilters ? (
            <EmptyState
              icon={<Route className="h-6 w-6" />}
              title="Sin instrucciones de embarque"
              description="Las Shipping Instructions aparecen aquí cuando Ventas las genera desde una cotización."
            />
          ) : (
            <EmptyState
              title="Sin resultados"
              description="Ninguna SI coincide con los filtros aplicados."
              action={{ label: 'Limpiar filtros', onClick: clearFilters }}
            />
          )
        ) : (
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Listado de Shipping Instructions"
            tabIndex={0}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  {['SI', 'Cotización', 'Cliente', 'Ruta', 'Agente', 'Contenedor', 'Fecha', 'Asignado a', 'Estado', ''].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routingList.map((item) => {
                  const status  = resolveStatus(item)
                  const badge   = getStatusBadge(status)
                  const assigned = item.assigned_user
                    ? `${item.assigned_user.nombre || ''} ${item.assigned_user.apellido || ''}`.trim()
                    : 'Sin asignar'

                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        <Link
                          href={`/operations/shipping-instructions/${item.id}`}
                          className="rounded-sm text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300"
                        >
                          {item.routing_number || item.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {item.quotation?.quotation_number || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                        {item.cliente?.nombre || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {[item.origin_address, item.destination_address]
                          .filter(Boolean)
                          .join(' → ') || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {item.agent_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {formatContainer(item)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {assigned}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/operations/shipping-instructions/${item.id}`}
                          aria-label={`Abrir Shipping Instruction ${item.routing_number || item.id}`}
                          title="Abrir SI"
                          className={`${secondaryButtonClass} inline-flex h-8 w-8 items-center justify-center p-0`}
                        >
                          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
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
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize)
                setPage(1)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color = 'slate',
}: {
  label: string
  value: number
  color?: 'slate' | 'amber' | 'emerald' | 'blue'
}) {
  const colors = {
    slate:   'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]',
    amber:   'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
    emerald: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    blue:    'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20',
  }
  const valueColors = {
    slate:   'text-slate-900 dark:text-white',
    amber:   'text-amber-700 dark:text-amber-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
    blue:    'text-blue-700 dark:text-blue-300',
  }

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${colors[color]}`}>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${valueColors[color]}`}>{value}</p>
    </div>
  )
}
