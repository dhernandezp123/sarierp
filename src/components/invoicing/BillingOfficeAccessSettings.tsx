'use client'

import { useEffect, useRef, useState } from 'react'
import { Save, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useInvoiceMaster } from '@/src/hooks/useInvoiceMaster'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { ToggleSwitch } from '@/src/components/ui/toggle-switch'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { fieldClass, primaryButtonClass, fieldLabelClass } from '@/src/lib/ui-classes'

type Person = { id: string; nombre: string | null; apellido: string | null; email: string | null; rol: string }
type Office = { id: string; name: string; is_active: boolean }
type Access = { profile_id: string; office_ids: string[]; revision: number }
export function BillingOfficeAccessSettings() {
  const { profile } = useUser(), { isMaster } = useInvoiceMaster()
  if (!isMaster || !profile) return null
  return <OfficeAccessForm key={`${profile.id}:${profile.tenant_id}`} masterId={profile.id} />
}
function OfficeAccessForm({masterId}:{masterId:string}) {
  const [data, setData] = useState<{ people: Person[]; offices: Office[]; access: Access[] } | null>(null)
  const [error, setError] = useState(''), [selected, setSelected] = useState('')
  const [offices, setOffices] = useState<string[]>([]), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const active = useRef(true), lock = useRef(false)
  useEffect(() => {
    active.current = true
    void Promise.all([
      readAllReportRows<Person>((from, to) => supabase.from('profiles').select('id,nombre,apellido,email,rol').in('rol', ['Admin', 'Contabilidad', 'Finanzas']).eq('status', 'Aprobado').eq('is_active', true).order('nombre').order('id').range(from, to), { label: 'usuarios de facturación', isCurrent: () => active.current }),
      readAllReportRows<Office>((from, to) => supabase.from('billing_offices').select('id,name,is_active').order('name').order('id').range(from, to), { label: 'oficinas fiscales', isCurrent: () => active.current }),
      readAllReportRows<Access>((from, to) => supabase.from('billing_user_office_access').select('profile_id,office_ids,revision').order('profile_id').range(from, to), { label: 'autorizaciones por oficina', key: 'profile_id', isCurrent: () => active.current }),
    ]).then(([people, offices, access]) => { if (active.current) setData({ people, offices, access }) })
      .catch(() => { if (active.current) setError('No se pudieron consultar las autorizaciones. Recarga para reintentar.') })
    return () => { active.current = false }
  }, [])
  const current = data?.access.find(row => row.profile_id === selected)
  const changed = [...offices].sort().join() !== [...(current?.office_ids || [])].sort().join()
  async function save() {
    if (!selected || !reason.trim() || lock.current || !data || !changed) return
    lock.current = true; setBusy(true)
    try {
      const result = await supabase.rpc('save_billing_user_office_access', { p_profile_id: selected, p_revision: current?.revision || 0, p_office_ids: offices, p_reason: reason.trim() })
      if (result.error) throw result.error
      if (!active.current) return
      setData({ ...data, access: [...data.access.filter(row => row.profile_id !== selected), { profile_id: selected, office_ids: offices, revision: result.data as number }] })
      setReason(''); toast.success('Autorizaciones por oficina guardadas con historial.')
    } catch (error) { if (active.current) toast.error((error as Error).message || 'No se pudo confirmar el cambio; recarga antes de reintentar.') }
    finally { lock.current = false; if (active.current) setBusy(false) }
  }
  return <section className="w-full max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/40">
    <div className="flex gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-orange-600" /><div><h2 className="font-bold">Autorización para emitir por oficina</h2><p className="mt-1 text-sm text-slate-500">Permite apoyo entre sedes sin cambiar la oficina del cliente. Cada usuario necesita autorización para SPS, Tegucigalpa o ambas. El máster tiene acceso a todas las oficinas activas.</p></div></div>
    {error ? <p role="alert" className="text-rose-600">{error}</p> : !data ? <p role="status">Consultando usuarios y oficinas…</p> : <fieldset disabled={busy} className="space-y-4">
      <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Usuario</span><CompactSelect aria-label="Usuario para autorizar oficinas" searchable disabled={busy} value={selected} onValueChange={next=>{setSelected(next);setOffices(data.access.find(row=>row.profile_id===next)?.office_ids||[]);setReason('')}} options={[{value:'',label:'Selecciona un usuario'},...data.people.filter(person=>person.id!==masterId).map(person=>({value:person.id,label:[person.nombre,person.apellido].filter(Boolean).join(' ')||person.email||'Usuario',description:`${person.email||''} · ${person.rol}`}))]}/></label>
      {selected && <><div className="grid gap-3 sm:grid-cols-2">{data.offices.map(office => <div key={office.id} className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${offices.includes(office.id) ? 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20' : 'border-slate-200 dark:border-slate-700'}`}><div><p className="font-semibold">{office.name}</p><p className="text-xs text-slate-500">{office.is_active ? 'Permiso de emisión fiscal' : 'Oficina inactiva; no permite emitir'}</p></div><ToggleSwitch checked={offices.includes(office.id)} disabled={!office.is_active && !offices.includes(office.id)} label={`Autorizar ${office.name}`} onChange={() => setOffices(previous => previous.includes(office.id) ? previous.filter(id => id !== office.id) : [...previous, office.id])} /></div>)}</div>
        <p className="text-xs text-slate-500">Sin oficinas autorizadas, el usuario puede preparar borradores y consultar según su rol, pero no emitir documentos fiscales. Este permiso no permite administrar CAI ni editar clientes.</p>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Motivo</span><textarea aria-label="Motivo de autorización de oficinas" rows={2} maxLength={1000} className={fieldClass} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button type="button" aria-label="Guardar autorización de oficinas" title="Guardar autorización de oficinas" className={primaryButtonClass} disabled={!reason.trim() || !changed} onClick={() => setConfirm(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</button></>}
    </fieldset>}
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Confirmar autorización por oficina" description="Se reemplazarán las oficinas autorizadas para este usuario. El motivo y el cambio quedarán registrados." onConfirm={() => void save()} />
  </section>
}
