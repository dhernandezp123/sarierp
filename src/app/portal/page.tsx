'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Package, Bell, Plus, ArrowRight, MapPin,
  CheckCircle2, Clock, AlertTriangle, Ship, Plane, Truck,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type PackageRow = {
  id: string
  tracking_number: string
  carrier: string | null
  warehouse_number: string | null
  status: string
  received_at: string
}

type PreAlertRow = {
  id: string
  tracking_number: string
  carrier: string | null
  description: string | null
  expected_date: string | null
}

type ShipmentRow = {
  id: string
  routing_number: string
  shipment_status: string
  carrier: string | null
  etd: string | null
  eta: string | null
  service_product: string | null
  origen: string | null
  destino: string | null
}

const pkgStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'Sin asignar':    { label: 'Sin asignar', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   icon: <Clock className="h-3 w-3" /> },
  'Asignado':       { label: 'En bodega',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       icon: <Package className="h-3 w-3" /> },
  'Entregado':      { label: 'Entregado',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  'Con incidencia': { label: 'Incidencia',  color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',           icon: <AlertTriangle className="h-3 w-3" /> },
}

const SERVICE_ICON: Record<string, React.ReactNode> = {
  miami_lcl:         <Ship className="h-3.5 w-3.5" />,
  miami_air:         <Plane className="h-3.5 w-3.5" />,
  other_origin_fcl:  <Ship className="h-3.5 w-3.5" />,
  other_origin_lcl:  <Ship className="h-3.5 w-3.5" />,
  usa_ltl_ftl:       <Truck className="h-3.5 w-3.5" />,
  courier:           <Package className="h-3.5 w-3.5" />,
}

function shipmentStatusColor(status: string): string {
  if (['Embarcado', 'En Tránsito'].includes(status))
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  if (status === 'Arribado')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (status === 'Booking Confirmado')
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

function fmt(date: string | null) {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })
}

export default function PortalDashboard() {
  const { profile } = useUser()
  const [packages, setPackages]     = useState<PackageRow[]>([])
  const [preAlerts, setPreAlerts]   = useState<PreAlertRow[]>([])
  const [shipments, setShipments]   = useState<ShipmentRow[]>([])
  const [packageCount, setPackageCount] = useState(0)
  const [preAlertCount, setPreAlertCount] = useState(0)
  const [hasAddress, setHasAddress] = useState<boolean | null>(null)
  const [loading, setLoading]       = useState(true)

  const loadData = async (clientId: string) => {
    setLoading(true)
    const [packagesResult, warehouseCountResult, alertsResult, addressResult, shipmentsResult] = await Promise.all([
      supabase
        .from('miami_packages')
        .select('id, tracking_number, carrier, warehouse_number, status, received_at')
        .eq('cliente_id', clientId)
        .order('received_at', { ascending: false })
        .limit(3),
      supabase
        .from('miami_packages')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clientId)
        .eq('status', 'Asignado'),
      supabase
        .from('miami_pre_alerts')
        .select('id, tracking_number, carrier, description, expected_date', { count: 'exact' })
        .eq('cliente_id', clientId)
        .eq('status', 'Pendiente')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('client_addresses')
        .select('id')
        .eq('cliente_id', clientId)
        .eq('is_active', true)
        .limit(1),
      supabase
        .rpc('get_client_shipments', {
          p_shipment_id: null,
          p_include_completed: false,
        }),
    ])

    setPackages((packagesResult.data ?? []) as PackageRow[])
    setPackageCount(warehouseCountResult.count ?? 0)
    setPreAlerts((alertsResult.data ?? []) as PreAlertRow[])
    setPreAlertCount(alertsResult.count ?? 0)
    setHasAddress((addressResult.data ?? []).length > 0)
    setShipments((shipmentsResult.data ?? []) as ShipmentRow[])
    setLoading(false)
  }

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadData(clientId), 0)
    return () => window.clearTimeout(timeout)
  }, [profile?.cliente_id])

  return (
    <div className="space-y-5">
      {/* Welcome */}
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Bienvenido,</p>
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-white">
          {profile?.nombre ?? 'Cliente'}
        </h1>
      </div>

      {/* No address banner */}
      {hasAddress === false && (
        <Link
          href="/portal/perfil/direccion-miami"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/20"
        >
          <MapPin className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Configura tu dirección en Miami</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Necesitas una dirección para recibir tus paquetes</p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-500" />
        </Link>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Envíos activos" value={shipments.length} sublabel="en tránsito" loading={loading} />
        <StatCard label="En bodega Miami" value={packageCount} sublabel="paquetes listos" loading={loading} />
        <StatCard label="Pre-alertas" value={preAlertCount} sublabel="pendientes" loading={loading} />
      </div>

      {/* Active shipments */}
      {(loading || shipments.length > 0) && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Ship className="h-4 w-4 text-slate-400" />
              <h2 className="font-display font-semibold text-slate-900 dark:text-white">Envíos activos</h2>
            </div>
            <Link
              href="/portal/envios"
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {shipments.slice(0, 3).map(s => {
                const sp = s.service_product ?? ''
                return (
                  <Link
                    key={s.id}
                    href={`/portal/envios/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {SERVICE_ICON[sp] ?? <Ship className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {s.routing_number}
                      </p>
                      <p className="text-xs text-slate-400 truncate">
                        {s.origen ?? '—'} → {s.destino ?? '—'}
                        {s.eta && <span className="ml-1">· ETA {fmt(s.eta)}</span>}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${shipmentStatusColor(s.shipment_status)}`}>
                      {s.shipment_status}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/portal/pre-alertas/nueva"
          className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 hover:bg-blue-100/60 dark:border-blue-900/40 dark:bg-blue-950/20 dark:hover:bg-blue-950/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600">
            <Plus className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Registrar pre-alerta</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Notifica que un paquete viene en camino</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-blue-400" />
        </Link>
        <Link
          href="/portal/envios"
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 hover:bg-slate-100/60 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-700 dark:bg-slate-600">
            <Ship className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mis envíos</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Contenedores, LCL y carga aérea</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-slate-400" />
        </Link>
      </div>

      {/* Recent packages */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-400" />
            <h2 className="font-display font-semibold text-slate-900 dark:text-white">Paquetería reciente</h2>
          </div>
          <Link
            href="/portal/paquetes"
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Ver todos <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes paquetes registrados aún.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {packages.map(p => {
              const cfg = pkgStatusConfig[p.status] ?? { label: p.status, color: 'bg-slate-100 text-slate-600', icon: null }
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{p.tracking_number}</p>
                    <p className="text-xs text-slate-400">
                      {p.carrier ?? 'Sin carrier'} · {new Date(p.received_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}
                      {p.warehouse_number && <span className="ml-1 text-slate-500">· WH: {p.warehouse_number}</span>}
                    </p>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending pre-alerts */}
      {!loading && preAlerts.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white dark:border-amber-900/40 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-amber-100 px-5 py-4 dark:border-amber-900/20">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <h2 className="font-display font-semibold text-slate-900 dark:text-white">Pre-alertas pendientes</h2>
            </div>
            <Link href="/portal/pre-alertas" className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400">
              Ver todas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-amber-50 dark:divide-amber-900/10">
            {preAlerts.map(a => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{a.tracking_number}</p>
                  <p className="text-xs text-slate-400">{a.description ?? 'Sin descripción'} {a.carrier ? `· ${a.carrier}` : ''}</p>
                </div>
                {a.expected_date && (
                  <p className="ml-3 shrink-0 text-xs text-amber-600 dark:text-amber-400">
                    Est. {fmt(a.expected_date)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  sublabel,
  loading,
}: {
  label: string
  value: number
  sublabel: string
  loading: boolean
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-slate-900 dark:text-white">
        {loading ? (
          <span className="inline-block h-7 w-7 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        ) : (
          value
        )}
      </p>
      <p className="mt-1 text-xs text-slate-400">{sublabel}</p>
    </div>
  )
}
