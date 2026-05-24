'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { operationStatuses } from '@/src/lib/operation-status'
import { supabase } from '@/src/lib/supabase/client'

type RoutingItem = {
  id: string
  routing_number: string
  booking_number: string | null
  shipment_status: string | null
  eta: string | null
  actual_eta: string | null
  operations_assigned_to: string | null
  carrier: string | null
  cliente?: {
    nombre: string | null
  } | null
  assigned_user?: {
    nombre: string | null
    apellido: string | null
  } | null
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
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
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

function getEtaDisplay(item: RoutingItem) {
  const dateValue = item.actual_eta || item.eta

  if (!dateValue) {
    return {
      label: 'Sin ETA',
      className: 'text-slate-500 dark:text-slate-400',
    }
  }

  const eta = new Date(dateValue)
  const today = new Date()

  const diffDays = Math.ceil(
    (eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (
    diffDays < 0 &&
    !['Finalizado', 'Arribado'].includes(item.shipment_status || '')
  ) {
    return {
      label: `Vencida hace ${Math.abs(diffDays)} días`,
      className: 'font-semibold text-red-600 dark:text-red-400',
    }
  }

  if (diffDays === 0) {
    return {
      label: 'ETA hoy',
      className: 'font-semibold text-amber-600 dark:text-amber-400',
    }
  }

  if (diffDays > 0 && diffDays <= 7) {
    return {
      label: `En ${diffDays} días`,
      className: 'font-semibold text-blue-600 dark:text-blue-400',
    }
  }

  return {
    label: dateValue,
    className: 'text-slate-600 dark:text-slate-300',
  }
}

export default function OperationsDashboardPage() {
  const [items, setItems] = useState<RoutingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [assignmentFilter, setAssignmentFilter] = useState('Todos')
  const [etaFilter, setEtaFilter] = useState('Todos')

  const loadItems = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        routing_number,
        booking_number,
        shipment_status,
        eta,
        actual_eta,
        operations_assigned_to,
        carrier,
        cliente:clientes (
          nombre
        ),
        assigned_user:profiles!shipping_instructions_operations_assigned_to_fkey (
          nombre,
          apellido
        )
      `)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const normalizedItems = data.map((item) => ({
        ...item,
        cliente: Array.isArray(item.cliente)
          ? item.cliente[0] ?? null
          : item.cliente,
        assigned_user: Array.isArray(item.assigned_user)
          ? item.assigned_user[0] ?? null
          : item.assigned_user,
      }))

      setItems(normalizedItems)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadItems()
  }, [])

  const today = new Date()

  const metrics = useMemo(() => {
    const pendingBooking = items.filter((item) => !item.booking_number).length

    const inTransit = items.filter(
      (item) => item.shipment_status === 'En Tránsito'
    ).length

    const unassigned = items.filter(
      (item) => !item.operations_assigned_to
    ).length

    const arrivalsThisWeek = items.filter((item) => {
      const dateValue = item.actual_eta || item.eta
      if (!dateValue) return false

      const eta = new Date(dateValue)
      const diffDays =
        (eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)

      return diffDays >= 0 && diffDays <= 7
    }).length

    const delayed = items.filter((item) => {
      const dateValue = item.actual_eta || item.eta
      if (!dateValue) return false

      const eta = new Date(dateValue)

      return (
        eta < today &&
        !['Finalizado', 'Arribado'].includes(item.shipment_status || '')
      )
    }).length

    return {
      pendingBooking,
      inTransit,
      arrivalsThisWeek,
      unassigned,
      delayed,
    }
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
      item.cliente?.nombre?.toLowerCase().includes(query) ||
      item.carrier?.toLowerCase().includes(query) ||
      item.booking_number?.toLowerCase().includes(query) ||
      assigned.toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'Todos' || item.shipment_status === statusFilter

    const matchesAssignment =
      assignmentFilter === 'Todos' ||
      (assignmentFilter === 'Sin asignar' && !item.operations_assigned_to) ||
      (assignmentFilter === 'Asignados' && item.operations_assigned_to)

    const dateValue = item.actual_eta || item.eta
    const etaDate = dateValue ? new Date(dateValue) : null
    const now = new Date()

    const daysDiff = etaDate
      ? (etaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      : null

    const matchesEta =
      etaFilter === 'Todos' ||
      (etaFilter === 'Sin ETA' && !etaDate) ||
      (etaFilter === 'Vencidos' &&
        etaDate !== null &&
        etaDate < now &&
        !['Finalizado', 'Arribado'].includes(item.shipment_status || '')) ||
      (etaFilter === 'Próximos 7 días' &&
        daysDiff !== null &&
        daysDiff >= 0 &&
        daysDiff <= 7) ||
      (etaFilter === 'Futuros' && daysDiff !== null && daysDiff > 7)

    return matchesSearch && matchesStatus && matchesAssignment && matchesEta
  })

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Dashboard Operativo
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Vista general de embarques, bookings y operaciones activas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Pendientes Booking" value={metrics.pendingBooking} />
        <MetricCard title="En Tránsito" value={metrics.inTransit} />
        <MetricCard title="Arribos 7 días" value={metrics.arrivalsThisWeek} />
        <MetricCard title="Sin asignar" value={metrics.unassigned} />
        <MetricCard title="Con retraso" value={metrics.delayed} danger />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar RT, cliente, carrier o booking..."
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="Todos">Todos los estados</option>
          {operationStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={assignmentFilter}
          onChange={(e) => setAssignmentFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="Todos">Todos</option>
          <option value="Sin asignar">Sin asignar</option>
          <option value="Asignados">Asignados</option>
        </select>

        <select
          value={etaFilter}
          onChange={(e) => setEtaFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="Todos">Todas las ETA</option>
          <option value="Sin ETA">Sin ETA</option>
          <option value="Vencidos">Con retraso</option>
          <option value="Próximos 7 días">Próximos 7 días</option>
          <option value="Futuros">Futuros</option>
        </select>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Operaciones activas ({filteredItems.length})
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-3">RT</th>
                <th>Cliente</th>
                <th>Carrier</th>
                <th>Booking</th>
                <th>ETA</th>
                <th>Estado</th>
                <th>Asignado</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => {
                const assigned =
                  item.assigned_user?.nombre || item.assigned_user?.apellido
                    ? `${item.assigned_user?.nombre || ''} ${
                        item.assigned_user?.apellido || ''
                      }`.trim()
                    : 'Sin asignar'
                const etaDisplay = getEtaDisplay(item)
                const isDelayed =
                  etaDisplay.label.startsWith('Vencida') &&
                  !['Finalizado', 'Arribado'].includes(
                    item.shipment_status || ''
                  )

                return (
                  <tr
                    key={item.id}
                    className={`border-t border-slate-100 dark:border-slate-800 ${
                      isDelayed ? 'bg-red-50/50 dark:bg-red-950/10' : ''
                    }`}
                  >
                    <td className="py-3 font-semibold text-slate-900 dark:text-white">
                      {item.routing_number}
                    </td>
                    <td>{item.cliente?.nombre || 'N/A'}</td>
                    <td>{item.carrier || 'N/A'}</td>
                    <td>{item.booking_number || 'Pendiente'}</td>
                    <td>
                      <div>
                        <p className={etaDisplay.className}>
                          {etaDisplay.label}
                        </p>
                        {(item.actual_eta || item.eta) && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.actual_eta || item.eta}
                          </p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                          item.shipment_status
                        )}`}
                      >
                        {item.shipment_status || 'N/A'}
                      </span>
                    </td>
                    <td>{assigned}</td>
                    <td className="text-right">
                      <Link
                        href={`/operations/routing/${item.id}/booking`}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
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
