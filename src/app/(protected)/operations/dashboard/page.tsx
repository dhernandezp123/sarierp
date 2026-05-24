'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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

export default function OperationsDashboardPage() {
  const [items, setItems] = useState<RoutingItem[]>([])
  const [loading, setLoading] = useState(true)

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

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Operaciones activas
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
              {items.map((item) => {
                const assigned =
                  item.assigned_user?.nombre || item.assigned_user?.apellido
                    ? `${item.assigned_user?.nombre || ''} ${
                        item.assigned_user?.apellido || ''
                      }`.trim()
                    : 'Sin asignar'

                return (
                  <tr
                    key={item.id}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="py-3 font-semibold text-slate-900 dark:text-white">
                      {item.routing_number}
                    </td>
                    <td>{item.cliente?.nombre || 'N/A'}</td>
                    <td>{item.carrier || 'N/A'}</td>
                    <td>{item.booking_number || 'Pendiente'}</td>
                    <td>{item.actual_eta || item.eta || 'N/A'}</td>
                    <td>{item.shipment_status || 'N/A'}</td>
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
