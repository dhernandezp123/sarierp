'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, ClipboardList, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import { loadMiamiDashboard, type MiamiDashboardData } from '@/src/lib/miami-dashboard'
import { canAccessPath } from '@/src/lib/permissions'
import { formatMiamiDateTime } from '@/src/lib/format'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'

export default function MiamiDashboardPage() {
  const router = useRouter()
  const { user, profile, loading: userLoading } = useUser()
  const tenantId = profile?.tenant_id || ''
  const canRead = !!user && profile?.id === user.id && profile.status === 'Aprobado' && profile.is_active === true
    && !!tenantId && profile.is_platform_admin !== true && canAccessPath(profile.rol, '/miami')
  const context = `${user?.id || ''}:${tenantId}:${profile?.rol || ''}:${canRead}`
  const version = useRef(0)
  const [snapshot, setSnapshot] = useState<{ context: string; data: MiamiDashboardData } | null>(null)
  const [readState, setReadState] = useState({ context: '', loading: true, error: '' })
  const data = !userLoading && canRead && snapshot?.context === context ? snapshot.data : null
  const loading = readState.context !== context || readState.loading
  const error = readState.context === context ? readState.error : ''
  const openManifests = data?.openManifests || []
  const unassignedPackages = data?.unassignedPackages || []

  const loadData = useCallback(async () => {
    const request = ++version.current
    if (userLoading || !canRead) return
    setReadState({ context, loading: true, error: '' })
    try {
      const next = await loadMiamiDashboard(supabase, tenantId)
      if (request !== version.current) return
      setSnapshot({ context, data: next })
      setReadState({ context, loading: false, error: '' })
    } catch (error) {
      if (request === version.current) setReadState({ context, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar el dashboard. Reintenta la consulta.' })
    }
  }, [canRead, context, tenantId, userLoading])

  useEffect(() => {
    const timer = setTimeout(() => { void loadData() }, 0)
    return () => { clearTimeout(timer); version.current += 1 }
  }, [loadData])

  if (!userLoading && !canRead) return <p role="status" className="p-6 text-sm text-slate-500">Se requiere una sesión operativa activa.</p>
  if (userLoading || (loading && !data)) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" />
          ))}
        </div>
        <div className={`${cardClass} p-6`}>
          <TableSkeleton rows={5} cols={5} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Bodega Miami · Hoy en America/New_York</p>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Dashboard de Operaciones</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadData()}
            className={secondaryButtonClass}
          >
            Actualizar dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push('/miami/ingreso')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            Ingreso individual
          </button>
          <button
            type="button"
            onClick={() => router.push('/miami/manifiestos/nuevo')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ClipboardList className="h-4 w-4" />
            Nuevo manifiesto
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-amber-300 p-4 text-sm">
          <p>{error}</p>
          <button type="button" onClick={() => void loadData()} disabled={loading} className={`${secondaryButtonClass} mt-2`}>
            Reintentar
          </button>
        </div>
      )}
      {data && (loading || error) && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          {loading ? 'Actualizando. ' : ''}Mostrando la última consulta completa; los datos pueden estar desactualizados.
        </p>
      )}
      {data && (
        <section aria-label="Consulta del dashboard" aria-busy={loading} className="space-y-6">
          {/* Métricas */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Sin asignar" value={data.metrics.sinAsignar} icon={<AlertCircle className="h-5 w-5" />} tone="amber" />
            <MetricCard label="Asignados hoy" value={data.metrics.asignadosHoy} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
            <MetricCard label="Manifiestos abiertos" value={data.metrics.manifiestoAbiertos} icon={<ClipboardList className="h-5 w-5" />} tone="blue" />
            <MetricCard label="Recibidos hoy" value={data.metrics.recibidosHoy} icon={<Package className="h-5 w-5" />} tone="slate" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* Manifiestos abiertos */}
            <div className={`${cardClass} p-0`}>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div>
                  <h2 className="font-semibold text-slate-950 dark:text-white">Manifiestos abiertos</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Lotes de carga pendientes de cierre</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/miami/manifiestos')}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Ver todos
                </button>
              </div>

              {openManifests.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                  <ClipboardList className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {loading || error ? 'La última consulta no tenía manifiestos abiertos.' : 'No hay manifiestos abiertos'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900 dark:bg-[#081120]">
                        {['Manifiesto', 'Paquetes', 'Apertura', ''].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {openManifests.map(m => (
                        <tr
                          key={m.id}
                          onClick={() => router.push(`/miami/manifiestos/${m.id}`)}
                          className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{m.manifest_number}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.total_packages}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            {formatMiamiDateTime(m.created_at, '-', { numericDate: true })}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Abierto</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Paquetes sin asignar */}
            <div className={`${cardClass} p-0`}>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div>
                  <h2 className="font-semibold text-slate-950 dark:text-white">Paquetes sin asignar</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Últimos recibidos pendientes de cliente</p>
                </div>
              </div>

              {unassignedPackages.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {loading || error ? 'La última consulta no tenía paquetes sin asignar.' : 'Todos los paquetes están asignados'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900 dark:bg-[#081120]">
                        {['Tracking', 'Carrier', 'Peso', 'Recibido'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedPackages.map(p => (
                        <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-white">{p.tracking_number}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.carrier ?? 'N/A'}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.weight_lbs ? `${p.weight_lbs} lbs` : '—'}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            {formatMiamiDateTime(p.received_at, '-', { numericDate: true })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'amber' | 'emerald' | 'blue' | 'slate' }) {
  const tones = {
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
    blue:    'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200',
    slate:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`rounded-xl p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}
