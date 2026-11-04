'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type Approver = { profile_id: string; display_name: string; role_name: string; active: boolean; approved: boolean; explicit_permission: boolean; designated_master: boolean }
type Candidate = { id: string; nombre: string | null; apellido: string | null; rol: string }
const internalRoles = ['Admin', 'Contabilidad', 'Finanzas', 'Operaciones', 'Pricing', 'Ventas']

export function InvoiceCourtesyPermissions() {
  const { user, profile } = useUser()
  if (!user || !profile?.tenant_id || profile.status !== 'Aprobado' || !profile.is_active
    || !['Admin', 'Contabilidad', 'Finanzas'].includes(profile.rol)) return null
  return <CourtesyPermissionsForm key={`${user.id}:${profile.tenant_id}:${profile.rol}`} tenantId={profile.tenant_id} admin={profile.rol === 'Admin'} />
}

function CourtesyPermissionsForm({ tenantId, admin }: { tenantId: string; admin: boolean }) {
  const [state, setState] = useState<{ approvers: Approver[]; candidates: Candidate[] } | null>(null)
  const [error, setError] = useState(false), [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ id: string; name: string; enabled: boolean } | null>(null)
  const mounted = useRef(true), lock = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let active = true
    void Promise.all([
      supabase.rpc('list_invoice_courtesy_approvers'),
      admin ? readAllReportRows<Candidate>((from, to) => supabase.from('profiles').select('id,nombre,apellido,rol')
        .eq('tenant_id', tenantId).in('rol', internalRoles).eq('status', 'Aprobado').eq('is_active', true)
        .order('nombre').order('id').range(from, to), { label: 'autorizadores de cortesias', isCurrent: () => active }) : Promise.resolve([]),
    ]).then(([result, candidates]) => {
      if (!active) return
      if (result.error) throw result.error
      setState({ approvers: (result.data || []) as Approver[], candidates }); setError(false)
    }).catch(() => { if (active) { setState(null); setError(true) } })
    return () => { active = false }
  }, [admin, tenantId, revision])

  async function save() {
    if (!pending || lock.current || reason.trim().length < 5) return
    lock.current = true; setBusy(true)
    try {
      const { error: failure } = await supabase.rpc('set_invoice_courtesy_approver', {
        p_profile_id: pending.id, p_enabled: pending.enabled, p_reason: reason.trim(),
      })
      if (failure) throw failure
      if (mounted.current) {
        setPending(null); setReason(''); setSelected(''); setState(null); setRevision(value => value + 1)
        toast.success('Permiso de revisión de cortesías actualizado y registrado.')
      }
    } catch (failure) { if (mounted.current) toast.error((failure as { message?: string }).message || 'No se pudo actualizar el permiso.') }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }

  const choices = state?.candidates.filter(person => !state.approvers.some(row => row.profile_id === person.id)) || []
  const candidateName = (person: Candidate) => [person.nombre, person.apellido].filter(Boolean).join(' ') || 'Usuario'
  return <FormSection title="Autorizadores de cortesías" className={`${cardClass} space-y-4`}
    description="Cada cortesía requiere una aprobación individual. Este permiso no permite eliminar libremente líneas ni modificar facturas emitidas.">
    <p className="text-sm text-slate-500">El master de Contabilidad designado también puede revisar cortesías mientras esté activo y aprobado. Las demás personas requieren una designación explícita; ser Admin no las incorpora automáticamente.</p>
    {error ? <p role="alert" className="text-sm text-red-600">No se pudieron consultar los permisos. <button type="button" className="underline" onClick={() => setRevision(value => value + 1)}>Reintentar</button></p>
      : !state ? <p role="status" className="text-sm">Consultando autorizadores…</p>
        : <>
          <ul className="space-y-2">{state.approvers.map(person => <li key={person.profile_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div><p className="text-sm font-semibold">{person.display_name}</p><p className="text-xs text-slate-500">{person.designated_master ? 'Master de Contabilidad designado' : 'Designación para revisar cortesías'} · {person.role_name}</p>
              {(!person.active || !person.approved || !internalRoles.includes(person.role_name)) && <p className="text-xs text-amber-700">Sin acceso efectivo: requiere usuario interno activo y aprobado.</p>}</div>
            {admin && person.explicit_permission && !person.designated_master && <button type="button" className={secondaryButtonClass} disabled={busy || reason.trim().length < 5} onClick={() => setPending({ id: person.profile_id, name: person.display_name, enabled: false })}>Quitar designación</button>}
          </li>)}</ul>
          {!state.approvers.length && <p className="text-sm text-slate-500">No hay autorizadores designados.</p>}
          {admin && <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <FormField as="div" label="Usuario a incorporar"><CompactSelect aria-label="Usuario a incorporar" searchable value={selected} onValueChange={setSelected} options={[{ value: '', label: 'Seleccionar usuario' }, ...choices.map(person => ({ value: person.id, label: candidateName(person), description: person.rol }))]} /></FormField>
            <FormField label="Motivo del cambio" required hint="Se registra al incorporar o quitar una designación."><input aria-label="Motivo del cambio de autorizadores" className={fieldClass} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></FormField>
            <button type="button" className={`${primaryButtonClass} justify-self-start sm:col-span-2`} disabled={!selected || reason.trim().length < 5 || busy} onClick={() => { const person = choices.find(row => row.id === selected); if (person) setPending({ id: person.id, name: candidateName(person), enabled: true }) }}>Incorporar autorizador</button>
          </fieldset>}
        </>}
    <ConfirmDialog open={Boolean(pending)} onOpenChange={open => { if (!open && !busy) setPending(null) }} title={pending?.enabled ? 'Incorporar autorizador de cortesías' : 'Quitar designación de cortesías'}
      description={`${pending?.name || ''}. ${pending?.enabled ? 'Podrá revisar solicitudes individuales de cortesía.' : 'Perderá su designación explícita para revisar cortesías.'} El cambio se registra con su motivo.`}
      confirmLabel={busy ? 'Guardando…' : 'Confirmar cambio'} onConfirm={() => void save()} />
  </FormSection>
}
