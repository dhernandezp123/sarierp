'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell, Home, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { supabase } from '@/src/lib/supabase/client'

type Profile = {
  nombre: string | null
  apellido: string | null
  email: string | null
  rol: string | null
}

type Notification = {
  id: string
  title: string
  message: string | null
  type: string
  is_read: boolean
  created_at: string
}

export default function Topbar() {
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const fetchNotifications = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) {
      setNotifications(data as Notification[])
    }
  }

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('nombre, apellido, email, rol')
        .eq('id', user.id)
        .single()

      setProfile(data)
    }

    fetchProfile()
    fetchNotifications()
  }, [])

  const displayName =
    profile?.nombre || profile?.apellido
      ? `${profile?.nombre || ''} ${profile?.apellido || ''}`.trim()
      : profile?.email || 'Usuario'
  const unreadCount = notifications.filter((n) => !n.is_read).length

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
            title="Notificaciones"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Bell className="h-5 w-5" />

            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-[#0b1220]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Notificaciones
                </p>

                <button
                  onClick={async () => {
                    const {
                      data: { user },
                    } = await supabase.auth.getUser()

                    if (!user) return

                    await supabase
                      .from('notifications')
                      .update({ is_read: true })
                      .eq('user_id', user.id)

                    fetchNotifications()
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  Marcar todas
                </button>
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    No tienes notificaciones.
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`rounded-xl border px-3 py-2 ${
                        notification.is_read
                          ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950'
                          : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {notification.title}
                      </p>

                      {notification.message && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {notification.message}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="text-right">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {displayName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {profile?.rol || 'Sin rol'}
          </p>
        </div>
      </div>
    </header>
  )
}
