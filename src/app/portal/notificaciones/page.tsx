'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Package, AlertTriangle, Info, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PortalError } from '@/src/components/portal/PortalFeedback'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import {
  PortalFilterPills,
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalPageHeader,
} from '@/src/components/portal/PortalUI'

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

  const [loadError, setLoadError] = useState(false)
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<'Todas' | 'Sin leer'>('Todas')
  const [total, setTotal] = useState(0)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!user?.id) return
    const controller = new AbortController()
    const profileId = user.id
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setLoadError(false)
      try {
        let query = supabase.from('client_notifications').select('id, title, body, type, entity_type, entity_id, read_at, created_at', { count: 'exact' }).eq('profile_id', profileId)
        if (filter === 'Sin leer') query = query.is('read_at', null)
        const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(page * 50, (page + 1) * 50 - 1).abortSignal(controller.signal)
        if (error) throw error
        if (!controller.signal.aborted) { setNotifications((data || []) as Notification[]); setTotal(count || 0) }
      } catch { if (!controller.signal.aborted) setLoadError(true) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [user?.id, page, filter, revision])

  const markAsRead = async (id: string) => {
    if (!user || marking) return
    const readAt = new Date().toISOString()
    setMarking(true)
    try {
      const { data, error } = await supabase.from('client_notifications').update({ read_at: readAt }).eq('id', id).eq('profile_id', user.id).select('id')
      if (error || !data?.length) throw error || new Error('Aviso no disponible')
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: readAt } : n))
      window.dispatchEvent(new Event('portal-notifications-changed'))
      if (filter === 'Sin leer') { setPage(0); setRevision(v => v + 1) }
    } catch { toast.error('No se pudo marcar como leído. Intenta nuevamente.') }
    finally { setMarking(false) }
  }

  const markAllRead = async () => {
    if (!user || marking) return
    setMarking(true)
    try {
      const { error } = await supabase.from('client_notifications').update({ read_at: new Date().toISOString() }).eq('profile_id', user.id).is('read_at', null)
      if (error) throw error
      setPage(0); setRevision(v => v + 1)
      window.dispatchEvent(new Event('portal-notifications-changed'))
      toast.success('Notificaciones marcadas como leídas')
    } catch { toast.error('No se pudieron marcar como leídas. Intenta nuevamente.') }
    finally { setMarking(false) }
  }

  const handleClick = async (n: Notification) => {
    if (!n.read_at) await markAsRead(n.id)

    // Navigate to related entity
    if (n.entity_type === 'miami_packages' && n.entity_id) {
      router.push(`/portal/paquetes/${n.entity_id}`)
    } else if (n.entity_type === 'shipments' && n.entity_id) {
      router.push(`/portal/envios/${n.entity_id}`)
    } else if (n.entity_type === 'miami_incidencias' && n.entity_id) {
      router.push(`/portal/incidencias#caso-${n.entity_id}`)
    }
  }

  const unreadCount = notifications.filter(n => !n.read_at).length

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="Notificaciones"
        subtitle={unreadCount > 0 ? `${unreadCount} sin leer en esta página` : undefined}
        action={unreadCount > 0 ? (
          <PortalButton variant="secondary" onClick={markAllRead} disabled={marking}>
            <CheckCheck className="h-3.5 w-3.5" />
            Marcar todo leído
          </PortalButton>
        ) : undefined}
      />

      <PortalFilterPills options={['Todas', 'Sin leer'] as const} value={filter} onChange={value => { setFilter(value); setPage(0) }} />
      {loadError ? <PortalError onRetry={() => setRevision(v => v + 1)} /> : <PortalCard>
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <PortalEmptyState
            icon={<Bell className="h-8 w-8" />}
            title="Sin notificaciones"
            description="Te avisaremos cuando lleguen tus paquetes."
          />
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
                  disabled={marking}
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
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400 whitespace-pre-wrap break-words">
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
      </PortalCard>}
      {!loading && !loadError && <div className="flex flex-wrap justify-between gap-3"><p className="text-xs text-slate-500">{total} avisos · Página {page + 1}</p><div className="flex gap-2"><PortalButton variant="secondary" disabled={page === 0} onClick={() => setPage(v => v - 1)}>Anterior</PortalButton><PortalButton variant="secondary" disabled={(page + 1) * 50 >= total} onClick={() => setPage(v => v + 1)}>Siguiente</PortalButton></div></div>}
    </div>
  )
}
