'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Bell, Home, Moon, Sun, Plus, FileText, Users, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useUser } from '@/src/hooks/useUser'
import { getSystemAlerts, type SystemAlert } from '@/src/lib/alerts'
import { supabase } from '@/src/lib/supabase/client'

// Acciones rapidas disponibles segun rol
const QUICK_ACTIONS = [
  {
    label: 'Nueva Cotizacion',
    href: '/quotations/new',
    icon: FileText,
    roles: ['Admin', 'Ventas', 'Pricing', 'Operaciones'],
  },
  {
    label: 'Nuevo Cliente',
    href: '/clientes/nuevo',
    icon: Users,
    roles: ['Admin', 'Ventas'],
  },
]

const seenAlertsStorageKey = (userId: string) => `sari:seen-high-alerts:${userId}`

function readSeenAlertIds(userId: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(seenAlertsStorageKey(userId)) || '[]')
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

function saveSeenAlertIds(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(seenAlertsStorageKey(userId), JSON.stringify(Array.from(ids)))
  } catch {
    // The badge still works for the current session if storage is unavailable.
  }
}

export default function Topbar() {
  const { theme, setTheme } = useTheme()
  const { user, profile, loading: userLoading } = useUser()
  const pathname = usePathname()

  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [seenHighAlertIds, setSeenHighAlertIds] = useState<Set<string>>(new Set())
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)

  const quickRef = useRef<HTMLDivElement>(null)
  const alertsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchAlerts = async () => {
      if (userLoading) return

      if (!user) {
        setAlerts([])
        setSeenHighAlertIds(new Set())
        return
      }

      try {
        const data = await getSystemAlerts(supabase, profile, user)
        const activeHighAlertIds = new Set(
          data.filter((alert) => alert.severity === 'Alta').map((alert) => alert.id)
        )
        const retainedSeenIds = new Set(
          readSeenAlertIds(user.id).filter((id) => activeHighAlertIds.has(id))
        )

        setAlerts(data)
        setSeenHighAlertIds(retainedSeenIds)
        saveSeenAlertIds(user.id, retainedSeenIds)
      } catch {
        setAlerts([])
      }
    }

    fetchAlerts()
  }, [pathname, profile, user, userLoading])

  // Cierra dropdowns al clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setQuickOpen(false)
      }

      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const displayName = profile?.nombre
    ? `${profile.nombre} ${profile.apellido || ''}`.trim()
    : 'Usuario'

  const newHighAlertCount = alerts.filter(
    (alert) => alert.severity === 'Alta' && !seenHighAlertIds.has(alert.id)
  ).length

  const toggleAlerts = () => {
    const willOpen = !alertsOpen
    setAlertsOpen(willOpen)
    if (!willOpen || !user) return

    const nextSeenIds = new Set(seenHighAlertIds)
    alerts.forEach((alert) => {
      if (alert.severity === 'Alta') nextSeenIds.add(alert.id)
    })
    setSeenHighAlertIds(nextSeenIds)
    saveSeenAlertIds(user.id, nextSeenIds)
  }

  const visibleActions = QUICK_ACTIONS.filter((action) =>
    !profile?.rol || action.roles.includes(profile.rol)
  )

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
            Plataforma logistica interna
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {visibleActions.length > 0 && (
          <div ref={quickRef} className="relative">
            <button
              type="button"
              onClick={() => setQuickOpen((o) => !o)}
              title="Acciones rapidas"
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                quickOpen
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {quickOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </button>

            {quickOpen && (
              <div className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[#0b1220]">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Acciones rapidas
                </p>

                {visibleActions.map((action) => {
                  const Icon = action.icon

                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      onClick={() => setQuickOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      {action.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title="Cambiar tema"
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        <div ref={alertsRef} className="relative">
          <button
            type="button"
            onClick={toggleAlerts}
            title={newHighAlertCount > 0 ? `${newHighAlertCount} alertas nuevas` : 'Alertas'}
            className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Bell className="h-4 w-4" />

            {newHighAlertCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {newHighAlertCount > 9 ? '9+' : newHighAlertCount}
              </span>
            )}
          </button>

          {alertsOpen && (
            <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-[#0b1220]">
              <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Alertas activas
                </p>
              </div>

              {alerts.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  Sin alertas activas.
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {alerts.slice(0, 5).map((alert) => (
                    <li key={alert.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {alert.title}
                      </p>

                      {alert.description && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {alert.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {alerts.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
                  <Link
                    href="/alerts"
                    onClick={() => setAlertsOpen(false)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Ver todas las alertas -&gt;
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <Link
          href="/profile"
          className="ml-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:hover:bg-slate-800"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {displayName.slice(0, 1).toUpperCase()}
          </div>

          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
              {displayName}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              {profile?.rol || 'Ventas'}
            </p>
          </div>
        </Link>
      </div>
    </header>
  )
}
