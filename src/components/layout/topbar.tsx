'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRight, Bell, Home, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useUser } from '@/src/hooks/useUser'
import { getSystemAlerts, type SystemAlert, type SystemAlertSeverity } from '@/src/lib/alerts'
import { supabase } from '@/src/lib/supabase/client'

export default function Topbar() {
  const { theme, setTheme } = useTheme()
  const { user, profile, loading: userLoading } = useUser()
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [alertsOpen, setAlertsOpen] = useState(false)

  useEffect(() => {
    const fetchAlerts = async () => {
      if (userLoading) return

      if (!user) {
        setAlerts([])
        return
      }

      try {
        const data = await getSystemAlerts(supabase, profile, user)
        setAlerts(data)
      } catch (error) {
        console.error(error)
        setAlerts([])
      }
    }

    fetchAlerts()
  }, [profile, user, userLoading])

  const displayName = profile?.nombre
    ? `${profile.nombre} ${profile.apellido || ''}`.trim()
    : 'Usuario'
  const highAlertCount = alerts.filter((alert) => alert.severity === 'Alta').length
  const visibleAlerts = alerts.slice(0, 5)

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur dark:border-slate-700/60 dark:bg-[#081120]/90">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          title="Ir al inicio"
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <Home className="h-5 w-5" />
        </Link>

        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Sari Express ERP
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plataforma logística interna
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          title="Cambiar tema"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        <div className="relative">
          <button
            title="Alertas"
            onClick={() => setAlertsOpen(!alertsOpen)}
            className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Bell className="h-5 w-5" />

            {highAlertCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {highAlertCount > 99 ? '99+' : highAlertCount}
              </span>
            )}
          </button>

          {alertsOpen && (
            <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#0b1220]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Alertas
                </p>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {highAlertCount} altas
                </span>
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {visibleAlerts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Sin alertas pendientes
                  </p>
                ) : (
                  visibleAlerts.map((alert) => (
                    <Link
                      key={alert.id}
                      href={alert.href}
                      onClick={() => setAlertsOpen(false)}
                      className="block rounded-xl border border-slate-200 bg-white px-3 py-2 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${severityClass(alert.severity)}`}>
                            {alert.severity}
                          </span>
                          <p className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                            {alert.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {alert.entityLabel}
                          </p>
                        </div>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <Link
                href="/alerts"
                onClick={() => setAlertsOpen(false)}
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Ver todas las alertas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </div>

        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl px-2 py-1 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="text-right">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {displayName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {profile?.rol || 'Sin rol'}
            </p>
          </div>
        </Link>
      </div>
    </header>
  )
}

function severityClass(severity: SystemAlertSeverity) {
  if (severity === 'Alta') {
    return 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200'
  }

  if (severity === 'Media') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200'
  }

  return 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200'
}
