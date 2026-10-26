'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'
import { fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { ACCESS_STATUSES, COMPANY_STATUSES, INTERNAL_ROLES, platformMutation, type PlatformCompany, type PlatformUser } from '@/src/lib/platform-admin'

function useSave(onSaved: () => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function save(body: Record<string, unknown>) {
    if (pending.current) return
    pending.current = true
    setSaving(true); setError('')
    try {
      platformMutation(body)
      const response = await fetch('/api/platform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result) throw new Error(result?.error || 'No se pudo guardar el cambio. Intenta nuevamente.')
      if (mounted.current) { toast.success('Cambio guardado y registrado.'); onSaved() }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'No se pudo guardar. Intenta nuevamente.')
    } finally { pending.current = false; if (mounted.current) setSaving(false) }
  }
  return { save, saving, error }
}

function Editor({ title, description, saving, error, onCancel, onSubmit, children, label = 'Guardar cambios' }: {
  title: string; description: string; saving: boolean; error: string; onCancel: () => void
  onSubmit: (event: FormEvent) => void; children: ReactNode; label?: string
}) {
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onCancel() }}>
    <DialogContent showCloseButton={!saving} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset disabled={saving} className="space-y-4">{children}</fieldset>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className={secondaryButtonClass}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'Guardando...' : label}</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}

function Reason({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium">Motivo del cambio
    <textarea required minLength={5} maxLength={500} rows={3} value={value} onChange={event => onChange(event.target.value)}
      className={`${fieldClassSm} mt-1 h-auto py-2`} placeholder="Explica por qué se realiza este cambio" />
    <span className="mt-1 block text-xs font-normal text-slate-500">Quedará en la actividad administrativa con tu usuario y la fecha.</span>
  </label>
}

export function PlatformCompanyDialog({ company, onCancel, onSaved }: { company: PlatformCompany | null; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(company?.name || '')
  const [slug, setSlug] = useState(company?.slug || '')
  const [status, setStatus] = useState(company?.status || 'Activo')
  const [reason, setReason] = useState('')
  const { save, saving, error } = useSave(onSaved)
  const closingAccess = company && status !== 'Activo' && status !== company.status
  return <Editor title={company ? `Administrar ${company.name}` : 'Registrar empresa'}
    description={company ? 'Actualiza el nombre en la plataforma y la disponibilidad del acceso.' : 'Crea la empresa, su configuración inicial y el registro de su subdominio.'}
    saving={saving} error={error} onCancel={onCancel} label={closingAccess ? 'Confirmar bloqueo de acceso' : company ? 'Guardar cambios' : 'Registrar empresa'}
    onSubmit={event => { event.preventDefault(); void save(company
      ? { action: 'update-company', id: company.id, name, status, expected_updated_at: company.updated_at, reason }
      : { action: 'create-company', name, slug, reason }) }}>
    <label className="block text-sm font-medium">Nombre de la empresa
      <input required maxLength={160} value={name} onChange={event => setName(event.target.value)} className={`${fieldClassSm} mt-1`} />
    </label>
    {!company ? <label className="block text-sm font-medium">Subdominio
      <input required maxLength={63} value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={`${fieldClassSm} mt-1`} placeholder="miempresa" />
      <span className="mt-1 block break-all text-xs font-normal text-slate-500">https://{slug || 'miempresa'}.forwarders.app/login</span>
    </label> : <label className="block text-sm font-medium">Estado
      <select value={status} onChange={event => setStatus(event.target.value)} className={`${fieldClassSm} mt-1`}>
        {COMPANY_STATUSES.map(value => <option key={value}>{value}</option>)}
      </select>
    </label>}
    {closingAccess && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      Al confirmar, los usuarios de {company.name} perderán el acceso operativo, incluidas las sesiones abiertas. Podrás reactivarlo desde esta consola.
    </p>}
    {!company && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      Una vez habilitado el subdominio en el alojamiento, comparte el enlace para que el administrador solicite acceso. Aprueba su cuenta con rol Admin en Usuarios.
    </p>}
    <Reason value={reason} onChange={setReason} />
  </Editor>
}

export function PlatformUserDialog({ user, onCancel, onSaved }: { user: PlatformUser; onCancel: () => void; onSaved: () => void }) {
  const [role, setRole] = useState(user.rol)
  const [status, setStatus] = useState(user.status)
  const [active, setActive] = useState(user.is_active)
  const [reason, setReason] = useState('')
  const { save, saving, error } = useSave(onSaved)
  return <Editor title="Administrar acceso" description={`${user.email || 'Usuario'} · ${user.company_name || 'Empresa'}`}
    saving={saving} error={error} onCancel={onCancel}
    onSubmit={event => { event.preventDefault(); void save({ action: 'update-user', id: user.id, rol: role, status, is_active: active, reason,
      expected: { rol: user.rol, status: user.status, is_active: user.is_active, tenant_id: user.tenant_id } }) }}>
    <label className="block text-sm font-medium">Rol en la empresa
      <select value={role} onChange={event => setRole(event.target.value)} disabled={user.rol === 'Cliente'} className={`${fieldClassSm} mt-1`}>
        {(user.rol === 'Cliente' ? ['Cliente'] : INTERNAL_ROLES).map(value => <option key={value}>{value}</option>)}
      </select>
    </label>
    <label className="block text-sm font-medium">Aprobación
      <select value={status} onChange={event => setStatus(event.target.value)} className={`${fieldClassSm} mt-1`}>
        {ACCESS_STATUSES.map(value => <option key={value}>{value}</option>)}
      </select>
    </label>
    <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Acceso habilitado</label>
    <p className="text-sm text-slate-500">El usuario podrá ingresar cuando esté aprobado, tenga el acceso habilitado y su empresa esté activa.</p>
    {user.rol === 'Cliente' && !user.cliente_id && <p className="text-sm text-amber-700 dark:text-amber-300">La empresa debe vincular esta cuenta a un cliente antes de aprobarla.</p>}
    <Reason value={reason} onChange={setReason} />
  </Editor>
}
