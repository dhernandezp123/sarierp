'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type Agente = { id: string; name: string }

const TIPOS = ['Agente', 'Carrier', 'Aduanal', 'Transporte', 'Almacen', 'Courier', 'Otro'] as const
const MONEDAS = ['USD', 'HNL', 'EUR', 'MXN']
const PAISES = ['Honduras', 'Estados Unidos', 'Mexico', 'Guatemala', 'El Salvador', 'Costa Rica', 'China', 'Colombia', 'Otro']

export default function NewSupplierPage() {
  const router = useRouter()
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    nombre: '',
    tipo: 'Agente' as typeof TIPOS[number],
    rtn: '',
    email: '',
    telefono: '',
    contacto: '',
    pais: '',
    moneda: 'USD',
    terminos_pago: '30',
    agente_id: '',
    notas: '',
  })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  useEffect(() => {
    supabase.from('agents').select('id, name').order('name').then(({ data }) => {
      setAgentes((data || []) as Agente[])
    })
  }, [])

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre del proveedor es requerido')
      return
    }

    const terminosPago = Number.parseInt(form.terminos_pago, 10)
    if (Number.isNaN(terminosPago) || terminosPago < 0) {
      toast.error('Los terminos de pago deben ser un numero valido')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('proveedores')
      .insert({
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        rtn: form.rtn.trim() || null,
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        contacto: form.contacto.trim() || null,
        pais: form.pais || null,
        moneda: form.moneda,
        terminos_pago: terminosPago,
        agente_id: form.agente_id || null,
        notas: form.notas.trim() || null,
      })
      .select('id')
      .single()

    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Proveedor creado')
    router.push(`/suppliers/${data.id}`)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Nuevo proveedor</h1>
        <button type="button" onClick={() => router.push('/suppliers')} className={secondaryButtonClass}>
          Volver
        </button>
      </div>

      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Informacion general</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nombre <span className="text-red-400">*</span></label>
            <input value={form.nombre} onChange={set('nombre')} className={fieldClass} placeholder="Nombre del proveedor" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Tipo <span className="text-red-400">*</span></label>
            <select value={form.tipo} onChange={set('tipo')} className={fieldClass}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">RTN / Tax ID</label>
            <input value={form.rtn} onChange={set('rtn')} className={fieldClass} placeholder="Numero de registro tributario" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Pais</label>
            <select value={form.pais} onChange={set('pais')} className={fieldClass}>
              <option value="">Seleccionar...</option>
              {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {form.tipo === 'Agente' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Vincular a Agente del sistema</label>
              <select value={form.agente_id} onChange={set('agente_id')} className={fieldClass}>
                <option value="">Sin vincular</option>
                {agentes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Contacto</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Nombre de contacto</label>
            <input value={form.contacto} onChange={set('contacto')} className={fieldClass} placeholder="Persona de contacto" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
            <input type="email" value={form.email} onChange={set('email')} className={fieldClass} placeholder="contacto@proveedor.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Telefono</label>
            <input value={form.telefono} onChange={set('telefono')} className={fieldClass} placeholder="+1 (305) 000-0000" />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Condiciones de pago</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Moneda</label>
            <select value={form.moneda} onChange={set('moneda')} className={fieldClass}>
              {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Terminos de pago (dias)</label>
            <input type="number" min="0" value={form.terminos_pago} onChange={set('terminos_pago')} className={fieldClass} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Notas internas</label>
            <textarea rows={3} value={form.notas} onChange={set('notas')} className={`${fieldClass} min-h-20`} placeholder="Condiciones especiales, instrucciones de pago..." />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <button type="button" onClick={handleSave} disabled={saving} className={`${primaryButtonClass} disabled:opacity-50`}>
          {saving ? 'Guardando...' : 'Crear proveedor'}
        </button>
      </div>
    </div>
  )
}
