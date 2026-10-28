'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { cardClass, fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
type MasterUser = { id: string; nombre: string | null; apellido: string | null; email: string | null; rol: string }
export function InvoiceMasterSettings() {
  const { user, profile } = useUser()
  if (!user || profile?.rol !== 'Admin') return null
  const context = `${user.id}:${profile.tenant_id}`
  return <MasterSettingsForm key={context} context={context} />
}
function MasterSettingsForm({ context }: { context: string }) {
  const [state, setState] = useState<{ users: MasterUser[]; selected: string; error: boolean } | null>(null)
  const [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const active = useRef(true), lock = useRef(false)
  useEffect(() => {
    active.current = true
    void Promise.all([
      readAllReportRows<MasterUser>((from, to) => supabase.from('profiles').select('id,nombre,apellido,email,rol').in('rol', ['Admin', 'Contabilidad']).eq('status', 'Aprobado').eq('is_active', true).order('nombre').order('id').range(from, to), { label: 'usuarios autorizables', isCurrent: () => active.current }),
      supabase.from('invoice_master_settings').select('profile_id').maybeSingle(),
    ]).then(([users, result]) => {
      if (!active.current) return
      if (result.error) throw result.error
      const current = result.data?.profile_id || ''; setState({ users, selected: current, error: false }); setSelected(current)
    }).catch(() => { if (active.current) setState({ users: [], selected: '', error: true }) })
    return () => { active.current = false }
  }, [context])
  async function save() {
    if (!state || state.error || !reason.trim() || lock.current) return
    lock.current = true; setBusy(true)
    try {
      const result = await supabase.rpc('set_invoice_master', { p_profile_id: selected || null, p_reason: reason.trim() })
      if (result.error) throw result.error
      if (active.current) { setState({ ...state, selected }); setReason(''); setConfirm(false); toast.success('Designación master registrada con auditoría.') }
    } catch (error) { if (active.current) toast.error((error as Error).message) }
    finally { lock.current = false; if (active.current) setBusy(false) }
  }
  return <section className={`${cardClass} space-y-4`}><div><h2 className="font-bold">Usuario master de facturación</h2><p className="mt-1 text-sm text-slate-500">Una persona designada puede aprobar y emitir correcciones de facturas. Ser Admin o Contabilidad no otorga este permiso automáticamente.</p></div>
    {!state ? <p role="status">Consultando designación…</p> : state.error ? <p role="alert">No se pudo consultar el permiso. Recarga para reintentar.</p> : <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm">Master designado<select className={fieldClass} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Sin master habilitado</option>{state.users.map(person => <option key={person.id} value={person.id}>{[person.nombre, person.apellido].filter(Boolean).join(' ') || person.email} · {person.email} · {person.rol}</option>)}</select></label><label className="space-y-2 text-sm">Motivo de la designación<input className={fieldClass} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label><button type="button" disabled={!reason.trim() || selected === state.selected} className={primaryButtonClass} onClick={() => setConfirm(true)}>Guardar designación master</button></fieldset>}
    <ConfirmDialog open={confirm} onOpenChange={next => { if (!busy) setConfirm(next) }} title="Confirmar permiso master" description="La designación anterior se reemplazará. Se requiere una cuenta Admin o Contabilidad activa y aprobada de esta empresa. El cambio queda registrado." confirmLabel="Confirmar designación" onConfirm={() => void save()} />
  </section>
}
