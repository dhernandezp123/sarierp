'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { canManageCompanySettings } from '@/src/lib/permissions'
import { validateOffice, type BillingOffice } from '@/src/lib/fiscal-offices'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

const empty = { name: '', address: '', phone: '', email: '', establishment_code: '', emission_point_code: '', is_active: true }
const fields = [
  ['name', 'Nombre de oficina'], ['address', 'Dirección del punto de emisión'],
  ['phone', 'Teléfono principal para documentos'], ['email', 'Correo para documentos'],
  ['establishment_code', 'Código SAR del establecimiento (3 dígitos)'],
  ['emission_point_code', 'Código SAR del punto de emisión (3 dígitos)'],
] as const

export function BillingOfficesSettings() {
  const { profile } = useUser()
  const identity = `${profile?.id}:${profile?.tenant_id}`
  const [result, setResult] = useState<{ identity: string; rows: BillingOffice[]; error: string }>({ identity: '', rows: [], error: '' })
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<{ identity: string; original: BillingOffice | null; form: typeof empty } | null>(null)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const currentIdentity = useRef(identity)
  useEffect(() => { currentIdentity.current = identity; return () => { currentIdentity.current = '' } }, [identity])
  const canEdit = canManageCompanySettings(profile?.rol)
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.from('billing_offices').select('*').order('name')
        if (active) setResult({ identity, rows: data || [], error: error ? 'No se pudieron cargar las oficinas. Verifica la migración fiscal.' : '' })
      } catch { if (active) setResult({ identity, rows: [], error: 'No se pudieron cargar las oficinas.' }) }
    })()
    return () => { active = false }
  }, [identity, revision])
  async function save() {
    if (!editor || editor.identity !== identity || !canEdit || busy.current) return
    const errorMessage = validateOffice(editor.form)
    if (errorMessage) { toast.error(errorMessage); return }
    busy.current = true; setSaving(true)
    try {
      const payload = { ...editor.form, name: editor.form.name.trim(), tenant_id: profile?.tenant_id }
      const query = editor.original
        ? supabase.from('billing_offices').update(payload).eq('id', editor.original.id).eq('updated_at', editor.original.updated_at)
        : supabase.from('billing_offices').insert(payload)
      const { data, error } = await query.select('id').single()
      if (currentIdentity.current !== identity) return
      if (error || !data) { toast.error(error?.code === 'PGRST116' ? 'La oficina cambió. Cancela y vuelve a abrir para actualizar.' : error?.message || 'No se pudo guardar'); return }
      toast.success('Oficina guardada'); setEditor(null); setRevision(n => n + 1)
    } catch { if (currentIdentity.current === identity) toast.error('No se pudo guardar la oficina. Conservamos los datos.') }
    finally { busy.current = false; setSaving(false) }
  }
  const current = result.identity === identity ? result : null
  const draft = editor?.identity === identity ? editor : null
  return <section className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <h3 className="font-semibold">Oficinas y encabezados fiscales</h3>
    <p className="text-sm text-slate-500">Cada cliente factura desde su oficina asignada. Completa los contactos, dirección y códigos autorizados antes de emitir. Los documentos ya numerados conservan su encabezado.</p>
    {!current ? <p>Cargando oficinas…</p> : current.error ? <p role="alert" className="text-red-600">{current.error} <button type="button" onClick={() => setRevision(n => n + 1)}>Reintentar</button></p> : <div className="space-y-2">{current.rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-900"><div><strong>{row.name}</strong><p className="text-sm">{row.address || 'Dirección pendiente'} · {row.is_active ? 'Activa' : 'Inactiva'}</p></div>{canEdit && <button type="button" className={secondaryButtonClass} disabled={saving} onClick={() => setEditor({ identity, original: row, form: { ...row } })}>Editar oficina</button>}</div>)}</div>}
    {canEdit && current && !current.error && !draft && <button type="button" className={secondaryButtonClass} onClick={() => setEditor({ identity, original: null, form: { ...empty } })}>Agregar oficina</button>}
    {draft && canEdit && <fieldset disabled={saving} className="space-y-4 border-t pt-4">
      <legend className="font-medium">{draft.original ? 'Editar oficina' : 'Nueva oficina'}</legend>
      <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="space-y-1 text-sm"><span>{label}</span><input className={fieldClass} value={draft.form[key]} type={key === 'email' ? 'email' : 'text'} maxLength={key.includes('code') ? 3 : key === 'name' ? 120 : 500} onChange={event => setEditor({ ...draft, form: { ...draft.form, [key]: event.target.value } })} /></label>)}</div>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.form.is_active} onChange={event => setEditor({ ...draft, form: { ...draft.form, is_active: event.target.checked } })} />Oficina activa para nuevas emisiones</label>
      <div className="flex gap-2"><button type="button" className={primaryButtonClass} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar oficina'}</button><button type="button" className={secondaryButtonClass} onClick={() => setEditor(null)}>Cancelar</button></div>
    </fieldset>}
  </section>
}
