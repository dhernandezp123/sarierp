'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Clock3, FileText, PackageCheck, RefreshCw, Route, Search, Ship } from 'lucide-react'
import { FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { OperationFilterMetric, OperationStatusBadge, operationTableHeadClass } from '@/src/components/operations/OperationsWorkspace'

import { useUser } from '@/src/hooks/useUser'
import { canViewClientOperationsReport } from '@/src/lib/permissions'
import { supabase } from '@/src/lib/supabase/client'
import { fieldClass, cardClass, fieldLabelClass } from '@/src/lib/ui-classes'
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

function formatContainer(item: RoutingItem): string {
  const type = item.container_type?.trim()
  const qty  = item.container_qty
  if (type && /^\d+\s*x\s+/i.test(type)) return type
  if (qty && type) return `${qty} x ${type}`
  if (type) return type
  return '—'
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RoutingInboxPage() {
  const { user, profile, loading: userLoading } = useUser()

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

  const toggleStatus = (value: string) => {
    setStatusFilter((current) => (current === value ? 'Todos' : value))
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <FinancePageHeader
        eyebrow="Operaciones"
        icon={Route}
        title="Shipping Instructions"
        description="Expedientes que Ventas envía a Operaciones antes del booking."
        actions={<>
          {canViewClientOperationsReport(profile?.rol) && (
            <Link href="/reports/client-operations" className={financeActionClass}>
              <FileText aria-hidden="true" className="h-4 w-4" />Reporte por cliente
            </Link>
          )}
          <button type="button" onClick={() => void loadRouting()} disabled={loading} className={financeActionClass}>
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            Actualizar
          </button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <OperationFilterMetric label="Total" value={metrics.total} icon={Route} active={statusFilter === 'Todos'} onClick={() => { setStatusFilter('Todos'); setPage(1) }} />
        <OperationFilterMetric label="Pendientes de validación" value={metrics.pendientes} icon={Clock3} tone="amber" active={statusFilter === 'Pendiente Validación'} onClick={() => toggleStatus('Pendiente Validación')} />
        <OperationFilterMetric label="Listas para booking" value={metrics.listos} icon={PackageCheck} tone="emerald" active={statusFilter === 'Listo para Booking'} onClick={() => toggleStatus('Listo para Booking')} />
        <OperationFilterMetric label="En booking" value={metrics.enBooking} icon={Ship} tone="sky" active={statusFilter === 'En Booking'} onClick={() => toggleStatus('En Booking')} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>Buscar</span>
          <span className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="RT, cotización, cliente o agente"
              className={`${fieldClass} pl-9`}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>Asignación</span>
          <select value={assignFilter} onChange={(e) => { setAssignFilter(e.target.value); setPage(1) }} className={fieldClass}>
            <option value="Todos">Toda la asignación</option>
            <option value="Sin asignar">Sin asignar</option>
            <option value="Mis asignados">Mis asignados</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={fieldLabelClass}>Estado</span>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={fieldClass}>
            <option value="Todos">Todos los estados</option>
            {shippingInstructionFilterStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={9} />
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              No se pudieron cargar las Shipping Instructions. {errorMessage}
            </p>
            <button type="button" onClick={() => void loadRouting()} className={financeActionClass}>
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
          <div className="relative overflow-x-auto" role="region" aria-label="Listado de Shipping Instructions" tabIndex={0}>
            <table className="w-full min-w-[960px] text-sm">
              <thead className={operationTableHeadClass}>
                <tr>
                  {['SI', 'Cliente', 'Ruta', 'Agente', 'Contenedores', 'Creada', 'Responsable', 'Estado'].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routingList.map((item) => {
                  const status = resolveStatus(item)
                  const assigned = item.assigned_user
                    ? `${item.assigned_user.nombre || ''} ${item.assigned_user.apellido || ''}`.trim()
                    : ''
                  return (
                    <tr key={item.id} className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                      <th scope="row" className="whitespace-nowrap px-4 py-3 text-left">
                        <Link
                          href={`/operations/shipping-instructions/${item.id}`}
                          className="rounded-sm font-semibold text-[#B3282D] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 dark:text-rose-300"
                        >
                          {item.routing_number || item.id}
                        </Link>
                        <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{item.quotation?.quotation_number || '—'}</span>
                      </th>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{item.cliente?.nombre || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {[item.origin_address, item.destination_address].filter(Boolean).join(' → ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.agent_name || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{formatContainer(item)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-500 dark:text-slate-400">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3">
                        {assigned
                          ? <span className="text-slate-700 dark:text-slate-200">{assigned}</span>
                          : <span className="font-semibold text-amber-700 dark:text-amber-300">Sin asignar</span>}
                      </td>
                      <td className="px-4 py-3"><OperationStatusBadge status={status} className="whitespace-nowrap" /></td>
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
