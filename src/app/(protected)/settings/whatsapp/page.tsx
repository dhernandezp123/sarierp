'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import { useTenantFeatures } from '@/src/components/tenant/TenantFeatures'
import { supabase } from '@/src/lib/supabase/client'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { ToggleSwitch } from '@/src/components/ui/toggle-switch'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { formatDate } from '@/src/lib/format'
import { WHATSAPP_SENDER_ROLES, formatWhatsappPhone, normalizeWhatsappPhone } from '@/src/lib/whatsapp-intake'

type Sender = { id: string; profile_id: string; phone: string; is_active: boolean; created_at: string }
type Person = { id: string; nombre: string | null; apellido: string | null; rol: string }

const personName = (person?: Person) => person ? `${person.nombre || ''} ${person.apellido || ''}`.trim() || 'Sin nombre' : 'Usuario no disponible'

export default function WhatsappSendersPage() {
  const { whatsappIntake } = useTenantFeatures()
  if (!whatsappIntake) return <div className="mx-auto max-w-5xl p-6"><section className={cardClass}><h1 className="text-xl font-semibold">Números de WhatsApp</h1><p className="mt-3">La recepción de solicitudes por WhatsApp no está habilitada para tu empresa.</p></section></div>
  return <WhatsappSenders />
}

function WhatsappSenders() {
  const { profile, loading: userLoading } = useUser()
  const isAdmin = profile?.rol === 'Admin' && profile.status === 'Aprobado' && profile.is_active === true
  const tenantId = profile?.tenant_id || ''
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [senders, setSenders] = useState<Sender[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [profileId, setProfileId] = useState('')
  const [phone, setPhone] = useState('')
  const [deleting, setDeleting] = useState<Sender | null>(null)
  const loadVersion = useRef(Symbol())

  const load = useCallback(async () => {
    const version = Symbol()
    loadVersion.current = version
    if (!isAdmin || !tenantId) { setLoading(false); return }
    setFailed(false)
    const [senderResult, peopleResult] = await Promise.all([
      supabase.from('whatsapp_quote_senders').select('id,profile_id,phone,is_active,created_at').eq('tenant_id', tenantId).order('created_at'),
      supabase.from('profiles').select('id,nombre,apellido,rol').eq('tenant_id', tenantId).in('rol', [...WHATSAPP_SENDER_ROLES])
        .eq('status', 'Aprobado').eq('is_active', true).order('nombre'),
    ])
    if (version !== loadVersion.current) return
    if (senderResult.error || peopleResult.error) {
      toast.error('No se pudieron cargar los números autorizados')
      setFailed(true); setLoading(false); return
    }
    setSenders(senderResult.data || [])
    setPeople(peopleResult.data || [])
    setLoading(false)
  }, [isAdmin, tenantId])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => { clearTimeout(timer); loadVersion.current = Symbol() }
  }, [load])

  const peopleById = useMemo(() => new Map(people.map(person => [person.id, person])), [people])
  const available = people.filter(person => !senders.some(sender => sender.profile_id === person.id))
  const normalized = normalizeWhatsappPhone(phone)

  async function add() {
    if (busy || !profileId || !normalized) return
    setBusy(true)
    const { error } = await supabase.rpc('whatsapp_save_sender', { p_id: null, p_profile_id: profileId, p_phone: normalized, p_is_active: true })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Número autorizado')
    setProfileId(''); setPhone('')
    void load()
  }

  async function toggle(sender: Sender) {
    if (busy) return
    setBusy(true)
    const { error } = await supabase.rpc('whatsapp_save_sender', { p_id: sender.id, p_profile_id: sender.profile_id, p_phone: sender.phone, p_is_active: !sender.is_active })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(sender.is_active ? 'Número desactivado' : 'Número activado')
    void load()
  }

  async function remove() {
    const sender = deleting
    setDeleting(null)
    if (!sender || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('whatsapp_delete_sender', { p_id: sender.id })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Número eliminado')
    void load()
  }

  if (userLoading || loading) return <PageSkeleton />
  if (!isAdmin) return <p className="p-6">Solo un administrador activo puede configurar los números de WhatsApp.</p>
  if (failed) return <div className="p-6"><p>No se pudo cargar la configuración.</p><button type="button" className={secondaryButtonClass} onClick={() => void load()}>Reintentar</button></div>

  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <div>
      <h1 className="text-2xl font-bold">Números de WhatsApp</h1>
      <p className="mt-2 text-sm text-slate-500">Solo los números registrados aquí pueden enviar solicitudes de cotización por WhatsApp. Los mensajes de otros números se ignoran.</p>
    </div>

    <section className={cardClass}>
      <h2 className="mb-4 font-semibold">Autorizar número</h2>
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <FormField label="Usuario" required as="div">
          <CompactSelect aria-label="Usuario" value={profileId} onValueChange={setProfileId} disabled={busy || !available.length}
            placeholder={available.length ? 'Selecciona un usuario' : 'Todos los usuarios tienen número'}
            options={available.map(person => ({ value: person.id, label: personName(person), description: person.rol }))} />
        </FormField>
        <FormField label="Número con código de país" required hint={phone && !normalized ? 'Usa código de país y número, 8 a 15 dígitos' : normalized ? `Se guardará como ${formatWhatsappPhone(normalized)}` : 'Ejemplo: +504 9999 8888'}>
          <input className={fieldClass} inputMode="tel" autoComplete="off" value={phone} disabled={busy} placeholder="+504 9999 8888"
            onChange={event => setPhone(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void add() }} />
        </FormField>
        <button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} disabled={busy || !profileId || !normalized} onClick={() => void add()}>
          <Plus size={16} aria-hidden="true" />Agregar
        </button>
      </div>
      <p className="mt-3 text-sm text-slate-500">Pueden registrarse usuarios Admin, Ventas o Pricing aprobados y activos. Un usuario tiene un solo número.</p>
    </section>

    <section className={cardClass}>
      <h2 className="mb-2 font-semibold">Números autorizados</h2>
      {!senders.length ? <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Sin números autorizados" description="Agrega el número de un vendedor o de Pricing para empezar a recibir solicitudes." />
        : <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
            <th className="py-2 pr-4">Usuario</th><th className="py-2 pr-4">Número</th><th className="py-2 pr-4">Registrado</th><th className="py-2 pr-4">Activo</th><th className="py-2" /></tr></thead>
          <tbody>{senders.map(sender => {
            const person = peopleById.get(sender.profile_id)
            return <tr key={sender.id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-3 pr-4 font-medium text-slate-900 dark:text-white">{personName(person)}
                <p className="text-xs font-normal text-slate-500">{person ? person.rol : 'Inactivo o sin rol autorizado: no recibe solicitudes'}</p></td>
              <td className="py-3 pr-4 whitespace-nowrap">{formatWhatsappPhone(sender.phone)}</td>
              <td className="py-3 pr-4">{formatDate(sender.created_at)}</td>
              <td className="py-3 pr-4"><ToggleSwitch checked={sender.is_active} disabled={busy} label={sender.is_active ? 'Desactivar número' : 'Activar número'} onChange={() => void toggle(sender)} /></td>
              <td className="py-3 text-right"><button type="button" disabled={busy} className="inline-flex items-center gap-1 text-sm font-medium text-[#B3282D] hover:underline disabled:opacity-50 dark:text-rose-300" onClick={() => setDeleting(sender)}>
                <Trash2 size={14} aria-hidden="true" />Eliminar</button></td>
            </tr>
          })}</tbody>
        </table></div>}
    </section>

    <ConfirmDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null) }} danger confirmLabel="Eliminar"
      title="Eliminar número autorizado"
      description={deleting ? `${formatWhatsappPhone(deleting.phone)} dejará de poder enviar solicitudes. Las solicitudes ya registradas se conservan.` : undefined}
      onConfirm={() => void remove()} />
  </div>
}
