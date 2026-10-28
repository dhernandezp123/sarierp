'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { intakeAcknowledgement, OUTLOOK_INTAKE_STANDBY } from '@/src/lib/mail-intake'
import { formatDate } from '@/src/lib/format'

type Settings = { tenant_id: string; mailbox: string; enabled: boolean; default_seller_id: string | null; use_client_seller: boolean; starts_at: string | null }
type Seller = { id: string; nombre: string; apellido: string }
type Message = { id: string; subject: string; sender: string; received_at: string; status: string; quotation_id: string | null }
const statusLabels: Record<string, string> = { ignored: 'Excluido', review: 'Revisar solicitud', ready: 'Acuse pendiente', sending: 'En proceso', accepted: 'Acuse aceptado por Microsoft', uncertain: 'Verificar en Enviados antes de responder' }

export default function MailIntakePage() {
  if (OUTLOOK_INTAKE_STANDBY) return <div className="mx-auto max-w-5xl p-6"><section className={cardClass}><h1 className="text-xl font-semibold">Solicitudes por Outlook · En espera</h1><p className="mt-3">La integración está pausada porque no contamos con los permisos de Microsoft 365 necesarios. No se leen correos ni se envían acuses.</p></section></div>
  return <MailIntakeSettings />
}

function MailIntakeSettings() {
  const { profile } = useUser()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [sellers, setSellers] = useState<Seller[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [failed, setFailed] = useState(false)
  const loadVersion = useRef(Symbol())
  const isAdmin = profile?.rol === 'Admin' && profile.status === 'Aprobado' && profile.is_active === true
  const load = useCallback(async () => {
    const version = Symbol()
    loadVersion.current = version
    if (!profile || !isAdmin) { setLoading(false); return }
    setFailed(false)
    const { data, error } = await supabase.from('mail_intake_settings').select('*').eq('tenant_id', profile.tenant_id).maybeSingle()
    if (version !== loadVersion.current) return
    if (error) { toast.error('No se pudo cargar la configuración de correo'); setFailed(true); setLoading(false); return }
    setSettings(data)
    if (data) {
      const results = await Promise.all([
        supabase.from('profiles').select('id,nombre,apellido').eq('tenant_id', data.tenant_id).in('rol', ['Admin', 'Ventas']).eq('status', 'Aprobado').eq('is_active', true).order('nombre'),
        supabase.from('mail_intake_messages').select('id,subject,sender,received_at,status,quotation_id').eq('tenant_id', data.tenant_id).order('created_at', { ascending: false }).limit(30),
      ])
      if (version !== loadVersion.current) return
      if (results.some(r => r.error)) toast.error('No se pudo cargar el historial o los vendedores')
      setSellers(results[0].data || [])
      setMessages(results[1].data || [])
    }
    setLoading(false)
  }, [profile, isAdmin])
  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => { clearTimeout(timer); loadVersion.current = Symbol() }
  }, [load])

  async function save() {
    if (!settings) return
    setBusy(true)
    const { data, error } = await supabase.from('mail_intake_settings').update({
      enabled: settings.enabled, default_seller_id: settings.default_seller_id, use_client_seller: settings.use_client_seller,
    }).eq('tenant_id', settings.tenant_id).select('*').single()
    setBusy(false)
    if (error) toast.error(error.message)
    else { setSettings(data); toast.success('Configuración guardada') }
  }
  async function checkConnection() {
    setBusy(true)
    try {
      const response = await fetch('/api/integrations/outlook/check', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo comprobar la conexión')
      toast.success(result.message)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Error de conexión') }
    finally { setBusy(false) }
  }

  if (loading || (settings && settings.tenant_id !== profile?.tenant_id)) return <PageSkeleton />
  if (!isAdmin) return <p className="p-6">Solo un administrador activo puede configurar esta integración.</p>
  if (failed) return <div className="p-6"><p>No se pudo cargar la configuración.</p><button className={secondaryButtonClass} onClick={() => void load()}>Reintentar</button></div>
  if (!settings) return <div className={cardClass}><h1 className="text-xl font-semibold">Solicitudes por Outlook</h1><p className="mt-3">Esta integración adicional todavía no está habilitada para tu empresa.</p></div>
  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">Solicitudes por Outlook</h1><p className="mt-2 text-sm text-slate-500">Buzón {settings.mailbox} · integración exclusiva de Sari Express.</p></div>
    <section className={cardClass}>
      <p className="mb-4 text-sm">Revisa los correos nuevos de la bandeja de entrada. Las solicitudes explícitas crean un Borrador y reciben un acuse con su referencia. Los mensajes ambiguos y seguimientos quedan para revisión. El contenido original se conserva como nota interna.</p>
      <label htmlFor="mail-seller" className="mb-2 block text-sm font-semibold">Vendedor predeterminado</label>
      <select id="mail-seller" className={fieldClass} value={settings.default_seller_id || ''} onChange={e => setSettings({ ...settings, default_seller_id: e.target.value || null })} disabled={busy}>
        <option value="">Selecciona un vendedor (Admin pruebas para AP)</option>
        {sellers.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
      </select>
      <label className="mt-4 flex items-center gap-3"><input type="checkbox" checked={settings.use_client_seller} disabled={busy} onChange={e => setSettings({ ...settings, use_client_seller: e.target.checked })} />Usar el vendedor del cliente cuando esté asignado y activo</label>
      <label className="mt-4 flex items-center gap-3"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Autorizar registro y envío automático de acuses</label>
      <p className="mt-3 text-sm text-slate-500">Cada activación empieza con correos nuevos; no responde al historial. Reasignar una cotización conserva la referencia ya comunicada. La ejecución requiere conexión de Microsoft 365 y programación en el servidor.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={busy || (settings.enabled && !settings.default_seller_id)} onClick={() => void save()}>Guardar configuración</button><button className={secondaryButtonClass} disabled={busy} onClick={() => void checkConnection()}>Comprobar conexión</button></div>
    </section>
    <section className={cardClass}><h2 className="font-semibold">Acuse al cliente</h2><p className="mt-3">{intakeAcknowledgement('{referencia del ERP}')}</p></section>
    <section className={cardClass}><div className="flex items-center justify-between"><h2 className="font-semibold">Últimos correos procesados</h2><button className={secondaryButtonClass} onClick={() => void load()}>Actualizar</button></div>
      <p className="mt-3 text-sm text-slate-500">Un acuse aceptado por Microsoft aún puede tener incidencias de entrega. Para envíos inciertos, verifica la carpeta Enviados antes de responder manualmente.</p>
      {!messages.length && <p className="mt-4 text-sm">Todavía no hay mensajes procesados.</p>}
      <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">{messages.map(m => <li key={m.id} className="py-4"><p className="font-medium">{m.subject || 'Sin asunto'}</p><p className="text-sm text-slate-500">{m.sender} · {formatDate(m.received_at)} · {statusLabels[m.status] || m.status}</p>{m.quotation_id && <Link className="text-sm text-blue-600 underline" href={`/quotations/${m.quotation_id}`}>Abrir cotización</Link>}</li>)}</ul>
    </section>
  </div>
}
