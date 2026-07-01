'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, BellRing, BriefcaseBusiness, Clock3, RefreshCw, Ship } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import {
  getSystemAlerts,
  type SystemAlert,
  type SystemAlertCategory,
  type SystemAlertSeverity,
} from '@/src/lib/alerts'
import { checkAndNotifyExpiredTarifas } from '@/src/lib/tarifa-expiry-check'
import { markCurrentUserNotificationsAsRead, NOTIFICATIONS_READ_EVENT } from '@/src/lib/notifications'

type CategoryFilter = 'Todas' | SystemAlertCategory
type SeverityFilter = 'Todas' | SystemAlertSeverity

function severityClass(severity: SystemAlertSeverity) {
  if (severity === 'Alta') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200'
  }

  if (severity === 'Media') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
  }

  return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
}

function categoryClass(category: SystemAlertCategory) {
  if (category === 'Comercial') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'
  }

  if (category === 'Operativa') {
    return 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200'
  }

  return 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200'
}

export default function AlertsPage() {
  const { user, profile, loading: userLoading } = useUser()
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('Todas')
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('Todas')
  const [refreshing, setRefreshing] = useState(false)

  const loadAlerts = async (silent = false) => {
    if (userLoading || !user) {
      if (!userLoading) { setAlerts([]); setLoading(false) }
      return
    }
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const data = await getSystemAlerts(supabase, profile, user)
      setAlerts(data)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'No se pudieron cargar las alertas.'
      toast.error(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadAlerts() }, [profile, user, userLoading])

  useEffect(() => {
    if (profile?.rol === 'Pricing' || profile?.rol === 'Admin') {
      void checkAndNotifyExpiredTarifas().catch(() => {
        toast.error('No se pudieron procesar las alertas de tarifas vencidas')
      })
    }
  }, [profile?.rol])

  useEffect(() => {
    if (userLoading || !user) return
    void markCurrentUserNotificationsAsRead()
      .then(({ error }) => {
        // Solo poner el badge en cero si la base confirmó el update;
        // ante error el conteo real se recalcula en la próxima navegación.
        if (!error) window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT))
      })
      .catch(() => {
        // El badge se recalculará en la próxima navegación.
      })
  }, [user, userLoading])

  const summary = useMemo(() => ({
    Comercial: alerts.filter((a) => a.category === 'Comercial').length,
    Operativa: alerts.filter((a) => a.category === 'Operativa').length,
    Gerencial: alerts.filter((a) => a.category === 'Gerencial').length,
    Alta: alerts.filter((a) => a.severity === 'Alta').length,
  }), [alerts])

  const filteredAlerts = useMemo(() => alerts.filter((a) => {
    const matchCat = categoryFilter === 'Todas' || a.category === categoryFilter
    const matchSev = severityFilter === 'Todas' || a.severity === severityFilter
    return matchCat && matchSev
  }), [alerts, categoryFilter, severityFilter])

  const emptyState = !loading && filteredAlerts.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Centro de control
          </p>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
            Centro de Alertas
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadAlerts(true)}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Alertas comerciales"
          value={summary.Comercial}
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          tone="emerald"
        />
        <KpiCard
          title="Alertas operativas"
          value={summary.Operativa}
          icon={<Ship className="h-5 w-5" />}
          tone="sky"
        />
        <KpiCard
          title="Alertas gerenciales"
          value={summary.Gerencial}
          icon={<BellRing className="h-5 w-5" />}
          tone="violet"
        />
        <KpiCard
          title="Prioridad alta"
          value={summary.Alta}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="rose"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Categoría:</span>
        {(['Todas', 'Comercial', 'Operativa', 'Gerencial'] as CategoryFilter[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              categoryFilter === cat
                ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
          >
            {cat}
          </button>
        ))}
        <span className="ml-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Severidad:</span>
        {(['Todas', 'Alta', 'Media', 'Baja'] as SeverityFilter[]).map((sev) => (
          <button
            key={sev}
            type="button"
            onClick={() => setSeverityFilter(sev)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              severityFilter === sev
                ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
          >
            {sev}
          </button>
        ))}
        {(categoryFilter !== 'Todas' || severityFilter !== 'Todas') && (
          <button
            type="button"
            onClick={() => { setCategoryFilter('Todas'); setSeverityFilter('Todas') }}
            className="ml-2 text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-200"
          >
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {filteredAlerts.length} de {alerts.length} alertas
        </span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Alertas consolidadas
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Comercial, operaciones y gerencia en una sola vista.
            </p>
          </div>
          <Clock3 className="h-5 w-5 text-slate-400" />
        </div>

        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : emptyState ? (
          <EmptyState
            icon={<BellRing className="h-6 w-6" />}
            title={alerts.length === 0 ? 'Sin alertas activas' : 'Sin resultados'}
            description={
              alerts.length === 0
                ? 'El sistema no detectó ninguna alerta en este momento.'
                : 'Ninguna alerta coincide con los filtros aplicados.'
            }
          />
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-900/60">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Categoría
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Severidad
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Alerta
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Referencia
                </th>
                <th className="px-5 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Antigüedad
                </th>
                <th className="px-5 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${categoryClass(alert.category)}`}>
                        {alert.category}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {alert.title}
                      </p>
                      <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                        {alert.description}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      <span className="font-medium">{alert.entityType}</span>
                      <span className="mx-1 text-slate-400">·</span>
                      {alert.entityLabel}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {alert.ageLabel}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={alert.href}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        )}
      </section>
    </div>
  )
}

function KpiCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string
  value: number
  icon: React.ReactNode
  tone: 'emerald' | 'sky' | 'violet' | 'rose'
}) {
  const tones = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
    sky: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-200',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200',
    rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {title}
        </p>
        <span className={`rounded-xl p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  )
}
