'use client'
import Link from 'next/link'
import { useCallback } from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { formatDateTime } from '@/src/lib/format'
import { NOTIFICATIONS_READ_EVENT, type NotificationRecord } from '@/src/lib/notifications'
import { cardClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { canManageHr, canUseHrSelfService } from '@/src/lib/hr'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { HrNavigation, useScopedLoad } from './HrShared'

type Notice = { request_id: string; event_key: string; notifications: NotificationRecord | NotificationRecord[] }
type EmailStatus = { request_id: string; event_key: string; status: string; attempts: number }
const emailLabel: Record<string, string> = { pending: 'Pendiente de envío', processing: 'En proceso', sent: 'Aceptado por el proveedor', failed: 'Rechazado por el proveedor; requiere revisión', uncertain: 'Requiere conciliación; no reenviar', skipped: 'Envío suspendido' }
export function HrNoticesPage() {
  const { user, profile, loading: userLoading } = useUser(), manager = canManageHr(profile), allowed = canUseHrSelfService(profile)
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const loader = useCallback(async () => {
    const r = await supabase.from('hr_notice_deliveries').select('request_id,event_key,notifications!inner(id,title,message,type,is_read,created_at)')
      .eq('user_id', user!.id).order('created_at', { ascending: false }).order('request_id').order('event_key').limit(100)
    if (r.error) throw new Error('No se pudieron cargar tus avisos de RRHH.')
    const statuses = await supabase.rpc('hr_email_status')
    if (statuses.error) throw new Error('No se pudo consultar el estado del correo. Reintenta.')
    return (r.data as Notice[]).map(row => ({ request: row.request_id, email: (statuses.data as EmailStatus[]).find(s => s.request_id === row.request_id && s.event_key === row.event_key), notification: Array.isArray(row.notifications) ? row.notifications[0] : row.notifications }))
  }, [user])
  const { data, error, loading, reload } = useScopedLoad(context, allowed && !!user, loader)
  async function markRead() {
    if (!data?.length || !user) return
    const r = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).in('id', data.filter(n => !n.notification.is_read).map(n => n.notification.id))
    if (r.error) { toast.error('No se pudieron marcar los avisos.'); return }
    window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT)); void reload()
  }
  if (userLoading) return null
  if (!allowed) return <div className={cardClass}>Tu usuario no tiene acceso a avisos de RRHH.</div>
  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Avisos de RRHH" icon={Bell} description="Tus últimos 100 avisos de solicitudes y decisiones."
      actions={<button type="button" className={secondaryButtonClass} disabled={loading || !!error || !data?.some(n => !n.notification.is_read)} onClick={() => void markRead()}>Marcar como leídos</button>} />
    <HrNavigation manager={manager} />
    <div className={cardClass}>
      {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
      {loading ? <p className="text-sm text-slate-500">Cargando avisos…</p> : data && !error && (!data.length ? <p className="text-sm text-slate-500">Sin avisos de RRHH.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{data.map(({ notification: n, email }) => <li key={n.id} className="space-y-1 py-4 text-sm">
        <p className="font-semibold">{!n.is_read && <span className="mr-2 text-sky-600">Nuevo</span>}{n.title}</p><p>{n.message}</p>
        <p className="text-xs text-slate-500">Correo: {email ? emailLabel[email.status] || 'Estado no disponible' : 'Sin envío registrado'}</p>
        <p className="text-xs text-slate-500">{formatDateTime(n.created_at)}</p><Link className="inline-block text-sm font-medium text-[#B3282D] hover:underline" href={manager ? '/rrhh/solicitudes' : '/rrhh/mi-ficha'}>Ver solicitudes</Link>
      </li>)}</ul>)}
    </div>
  </div>
}
