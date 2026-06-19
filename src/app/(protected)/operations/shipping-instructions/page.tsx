'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import {
  fieldClass,
  cardClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Route } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const shippingInstructionStatuses = [
  'Pendiente de Validación',
  'Asignado',
  'Listo para Booking',
  'En Booking',
] as const

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
  cliente?: { nombre: string | null } | null
  quotation?: { quotation_number: string | null } | null
  assigned_user?: { nombre: string | null; apellido: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveStatus(item: RoutingItem): string {
  const s = item.shipment_status || ''
  if (s === 'Pendiente Validación') return 'Pendiente Validación'
  if (s === 'Validada')             return 'Listo para Booking'
  if (s === 'Booking Solicitado')   return 'Booking Solicitado'
  if (s === 'Booking Confirmado')   return 'Booking Confirmado'
  if (s === 'En Tránsito')          return 'En Tránsito'
  if (s === 'Arribado')             return 'Arribado'
  if (s === 'Finalizado')           return 'Finalizado'
  if (s === 'Cancelada')            return 'Cancelada'
  return s || 'Pendiente Validación'
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'Pendiente Validación':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Listo para Booking':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Booking Solicitado':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Booking Confirmado':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'En Tránsito':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-HN', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RoutingInboxPage() {
  const router = useRouter()
  const { user, profile, loading: userLoading } = useUser()

  const [routingList, setRoutingList] = useState<RoutingItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [assignFilter, setAssignFilter] = useState('Todos')

  const loadRouting = async () => {
    if (userLoading) return
    setLoading(true)
    setErrorMessage('')

    let query = supabase
      .from('shipping_instructions')
      .select(`
        *,
        cliente:clientes ( nombre ),
        quotation:quotations ( quotation_number ),
        assigned_user:profiles!shipping_instructions_operations_assigned_to_fkey (
          nombre,
          apellido
        )
      `)
      .order('created_at', { ascending: false })

    if (profile?.rol === 'Ventas') {
      if (!user?.id) { setRoutingList([]); setLoading(false); return }
      query = query.eq('created_by', user.id)
    }

    const { data, error } = await query
    if (error) { setErrorMessage(error.message); setLoading(false); return }
    setRoutingList((data || []) as RoutingItem[])
    setLoading(false)
  }

  useEffect(() => { loadRouting() }, [profile?.rol, user?.id, userLoading])

  // Métricas
  const metrics = useMemo(() => ({
    total:      routingList.length,
    pendientes: routingList.filter(i => resolveStatus(i) === 'Pendiente Validación').length,
    listos:     routingList.filter(i => resolveStatus(i) === 'Listo para Booking').length,
    enBooking:  routingList.filter(i => ['Booking Solicitado', 'Booking Confirmado'].includes(resolveStatus(i))).length,
  }), [routingList])

  // Filtros
  const filtered = routingList.filter((item) => {
    const q      = search.toLowerCase()
    const status = resolveStatus(item)

    const matchesSearch =
      item.routing_number?.toLowerCase().includes(q) ||
      item.agent_name?.toLowerCase().includes(q) ||
      item.cliente?.nombre?.toLowerCase().includes(q) ||
      item.quotation?.quotation_number?.toLowerCase().includes(q)

    const matchesStatus =
      statusFilter === 'Todos' || status === statusFilter

    const matchesAssign =
      assignFilter === 'Todos' ||
      (assignFilter === 'Sin asignar'   && !item.operations_assigned_to) ||
      (assignFilter === 'Mis asignados' && item.operations_assigned_to === profile?.id)

    return matchesSearch && matchesStatus && matchesAssign
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Shipping Instructions
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Instrucciones operativas enviadas por Ventas antes del booking.
        </p>
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar RT, cotización, cliente o agente..."
          className={fieldClass}
        />
        <select
          value={assignFilter}
          onChange={(e) => setAssignFilter(e.target.value)}
          className={fieldClass}
        >
          <option value="Todos">Toda la asignación</option>
          <option value="Sin asignar">Sin asignar</option>
          <option value="Mis asignados">Mis asignados</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={fieldClass}
        >
          <option value="Todos">Todos los estados</option>
          {shippingInstructionStatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={6} cols={10} />
          </div>
        ) : errorMessage ? (
          <p className="p-6 text-sm text-red-500">{errorMessage}</p>
        ) : filtered.length === 0 ? (
          routingList.length === 0 ? (
            <EmptyState
              icon={<Route className="h-6 w-6" />}
              title="Sin instrucciones de embarque"
              description="Las Shipping Instructions aparecen aquí cuando Ventas las genera desde una cotización."
            />
          ) : (
            <EmptyState
              title="Sin resultados"
              description="Ninguna SI coincide con los filtros aplicados."
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  {['SI', 'Cotización', 'Cliente', 'Ruta', 'Agente', 'Contenedor', 'Fecha', 'Asignado a', 'Estado', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status  = resolveStatus(item)
                  const badge   = getStatusBadge(status)
                  const assigned = item.assigned_user
                    ? `${item.assigned_user.nombre || ''} ${item.assigned_user.apellido || ''}`.trim()
                    : 'Sin asignar'

                  return (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/operations/shipping-instructions/${item.id}`)}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {item.routing_number || item.id}
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
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => router.push(`/operations/shipping-instructions/${item.id}`)}
                          title="Abrir SI"
                          className={`${secondaryButtonClass} inline-flex h-8 w-8 items-center justify-center p-0`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Mostrando {filtered.length} de {routingList.length} instrucciones
              </p>
            </div>
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