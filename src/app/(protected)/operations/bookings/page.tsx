'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { operationStatuses } from '@/src/lib/operation-status'
import { supabase } from '@/src/lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'

type BookingItem = {
  id: string
  routing_number: string
  reference_number: string | null
  booking_number: string | null
  carrier_booking: string | null
  shipment_status: string | null
  carrier: string | null
  etd: string | null
  eta: string | null
  actual_eta: string | null
  operations_assigned_to: string | null
  tracking_url: string | null
  cliente?: { nombre: string | null } | null
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
    case 'En Tránsito':
      return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    case 'Arribado':
    case 'Finalizado':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function getEtaDisplay(item: BookingItem) {
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

export default function OperationsBookingsPage() {
  const [items, setItems] = useState<BookingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [etaFilter, setEtaFilter] = useState('Todos')

  const loadItems = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('shipping_instructions')
      .select(`
        id,
        routing_number,
        reference_number,
        booking_number,
        carrier_booking,
        shipment_status,
        carrier,
        etd,
        eta,
        actual_eta,
        operations_assigned_to,
        tracking_url,
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

  const metrics = useMemo(() => {
    const today = new Date()

    const active = items.filter(
      (item) =>
        !['Finalizado', 'Arribado'].includes(item.shipment_status || '')
    ).length

    const withoutBooking = items.filter((item) => !item.booking_number).length

    const inTransit = items.filter(
      (item) => item.shipment_status === 'En Tránsito'
    ).length

    const arrivalsSoon = items.filter((item) => {
      const dateValue = item.actual_eta || item.eta
      if (!dateValue) return false
      const eta = new Date(dateValue)
      const diff = (eta.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 7
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

    return { active, withoutBooking, inTransit, arrivalsSoon, delayed }
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
      statusFilter === 'Todos' || item.shipment_status === statusFilter

    const dateValue = item.actual_eta || item.eta
    const etaDate = dateValue ? new Date(dateValue) : null
    const now = new Date()
    const diffDays = etaDate
      ? (etaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      : null

    const matchesEta =
      etaFilter === 'Todos' ||
      (etaFilter === 'Sin ETA' && !etaDate) ||
      (etaFilter === 'Con retraso' &&
        etaDate !== null &&
        etaDate < now &&
        !['Finalizado', 'Arribado'].includes(item.shipment_status || '')) ||
      (etaFilter === 'Próximos 7 días' &&
        diffDays !== null &&
        diffDays >= 0 &&
        diffDays <= 7)

    return matchesSearch && matchesStatus && matchesEta
  })

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Bookings Operativos
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Bandeja diaria de operaciones activas, ETAs y tracking.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Activos" value={metrics.active} />
        <MetricCard title="Sin Booking" value={metrics.withoutBooking} />
        <MetricCard title="En Tránsito" value={metrics.inTransit} />
        <MetricCard title="Arribos 7 días" value={metrics.arrivalsSoon} />
        <MetricCard title="Con retraso" value={metrics.delayed} danger />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar RT, referencia, booking, cliente o carrier..."
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
          onChange={(e) => setEtaFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="Todos">Todas las ETA</option>
          <option value="Sin ETA">Sin ETA</option>
          <option value="Con retraso">Con retraso</option>
          <option value="Próximos 7 días">Próximos 7 días</option>
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
                      {item.reference_number || 'N/A'}
                    </td>
                    <td>{item.routing_number}</td>
                    <td>{item.cliente?.nombre || 'N/A'}</td>
                    <td>{item.carrier || 'N/A'}</td>
                    <td>{item.booking_number || 'Pendiente'}</td>
                    <td>{item.etd || 'N/A'}</td>
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
                        href={`/operations/shipping-instructions/${item.id}/booking`}
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
