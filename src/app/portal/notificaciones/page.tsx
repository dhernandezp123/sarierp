'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Package, AlertTriangle, Info, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type Notification = {
  id: string
  title: string
  body: string | null
  type: string
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

const typeIcon: Record<string, React.ReactNode> = {
  paquete:    <Package className="h-5 w-5 text-blue-500" />,
  incidencia: <AlertTriangle className="h-5 w-5 text-red-500" />,
  info:       <Info className="h-5 w-5 text-slate-400" />,
  sistema:    <Bell className="h-5 w-5 text-slate-400" />,
}

const typeBg: Record<string, string> = {
  paquete:    'bg-blue-50 dark:bg-blue-950/30',
  incidencia: 'bg-red-50 dark:bg-red-950/20',
  info:       'bg-slate-50 dark:bg-slate-800/60',
  sistema:    'bg-slate-50 dark:bg-slate-800/60',
}

export default function NotificacionesPage() {
  const { user } = useUser()
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (!user) return
    loadNotifications()
  }, [user])

  const loadNotifications = async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('client_notifications')
      .select('id, title, body, type, entity_type, entity_id, read_at, created_at')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications((data ?? []) as Notification[])
    setLoading(false)
  }

  const markAsRead = async (id: string) => {
    await supabase
      .from('client_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
    )
  }

  const markAllRead = async () => {
    if (!user) return
    const unread = notifications.filter(n => !n.read_at)
    if (unread.length === 0) return
    setMarking(true)
    await supabase
      .from('client_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', user.id)
      .is('read_at', null)
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    toast.success('Todas las notificaciones marcadas como leídas')
    setMarking(false)
  }

  const handleClick = async (n: Notification) => {
    if (!n.read_at) await markAsRead(n.id)

    // Navigate to related entity
    if (n.entity_type === 'miami_packages' && n.entity_id) {
      router.push(`/portal/paquetes/${n.entity_id}`)
    } else if (n.entity_type === 'miami_incidencias' && n.entity_id) {
      router.push('/portal/incidencias')
    }
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Notificaciones</h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {unreadCount} sin leer
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={marking}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todo leído
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Sin notificaciones</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Te avisaremos cuando lleguen tus paquetes
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map(n => {
              const isUnread = !n.read_at
              const icon = typeIcon[n.type] ?? typeIcon.info
              const bg = isUnread ? typeBg[n.type] ?? typeBg.info : ''

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={`flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${bg}`}
                >
                  {/* Unread dot */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-slate-800">
                      {icon}
                    </div>
                    {isUnread && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 dark:border-slate-900" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isUnread ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {new Date(n.created_at).toLocaleDateString('es-HN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {/* Chevron only if navigable */}
                  {(n.entity_type === 'miami_packages' || n.entity_type === 'miami_incidencias') && (
                    <span className="shrink-0 mt-1 text-slate-300 dark:text-slate-600">›</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
