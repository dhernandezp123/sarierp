'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccounting } from '@/src/hooks/useAccounting'
import { SupplierExpenseAccountSelect } from '@/src/components/suppliers/SupplierExpenseAccountSelect'
import { useSupplierTypes } from '@/src/hooks/useSupplierTypes'
import { SupplierTypeSelect } from '@/src/components/suppliers/SupplierTypeSelect'
import { FormField } from '@/src/components/ui/form-field'

import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { UnsavedChangesGuard, markFormSaved } from '@/src/components/ui/UnsavedChangesGuard'

type Agente = { id: string; name: string }

const MONEDAS = ['USD', 'HNL', 'EUR', 'MXN']
const PAISES = ['Honduras', 'Estados Unidos', 'Mexico', 'Guatemala', 'El Salvador', 'Costa Rica', 'China', 'Colombia', 'Otro']

export function SupplierForm({onCreated,onCancel,onSavingChange}: {onCreated:(id:string)=>void;onCancel:()=>void;onSavingChange?:(saving:boolean)=>void}) {
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
  const catalog = useSupplierTypes()
  const accounting = useAccounting()
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    nombre: '',
    tipo: '',
    rtn: '',
    direccion: '',
    email: '',
    telefono: '',
    contacto: '',
    pais: '',
    moneda: 'USD',
    terminos_pago: '30',
    agente_id: '',
    default_expense_account_id: '',
    notas: '',
  })

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  useEffect(() => {
    let current=true
    void supabase.from('agents').select('id, name').order('name').then(({ data, error }) => {
      if(!current)return
      if(error){toast.error('No se pudieron cargar los agentes.');return}
      setAgentes((data || []) as Agente[])
    },()=>{if(current)toast.error('No se pudieron cargar los agentes.')})
    return ()=>{current=false}
  }, [])

  const handleSave = async () => {
    if (busy.current) return
    if (!form.nombre.trim()) {
      toast.error('El nombre del proveedor es requerido')
      return
    }

    const terminosPago = Number(form.terminos_pago)
    if (form.terminos_pago.trim()==='' || !Number.isInteger(terminosPago) || terminosPago < 0) {
      toast.error('Los terminos de pago deben ser un numero valido')
      return
    }

    if (catalog.loading || catalog.error || !catalog.types.some(t=>t.active&&t.code===form.tipo)) { toast.error('Selecciona un tipo de proveedor activo.'); return }
    busy.current=true
    setSaving(true)
    onSavingChange?.(true)
    try {
    const { data, error } = await supabase
      .from('proveedores')
      .insert({
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        rtn: form.rtn.trim() || null,
        direccion: form.direccion.trim() || null,
        email: form.email.trim() || null,
        telefono: form.telefono.trim() || null,
        contacto: form.contacto.trim() || null,
        pais: form.pais || null,
        moneda: form.moneda,
        terminos_pago: terminosPago,
        agente_id: form.agente_id || null,
        default_expense_account_id: form.default_expense_account_id || null,
        notas: form.notas.trim() || null,
      })
      .select('id')
      .single()

    if(!mounted.current)return
    if (error) {
      toast.error(error.message)
      return
    }

    if (!data?.id) throw new Error('No se pudo confirmar el proveedor creado.')
    toast.success('Proveedor creado')
    markFormSaved()
    onCreated(data.id)
    } catch(error) {
      if(mounted.current)toast.error(error instanceof Error?error.message:'No se pudo guardar el proveedor. Reintenta.')
    } finally {
      busy.current=false
      if(mounted.current){setSaving(false);onSavingChange?.(false)}
    }
  }

  return (
    <form onSubmit={event=>{event.preventDefault();void handleSave()}} className="space-y-5">
      <UnsavedChangesGuard dirty={form.nombre!==''||form.tipo!==''||form.rtn!==''||form.direccion!==''||form.email!==''||form.telefono!==''||form.contacto!==''||form.pais!==''||form.moneda!=='USD'||form.terminos_pago!=='30'||form.agente_id!==''||form.default_expense_account_id!==''||form.notas!==''} />
      <fieldset disabled={saving} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Informacion general</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nombre <span className="text-red-400">*</span></label>
            <input value={form.nombre} onChange={set('nombre')} className={fieldClass} placeholder="Nombre del proveedor" />
          </div>
          <FormField as="div" label="Tipo de proveedor" required><SupplierTypeSelect types={catalog.types} value={form.tipo} onChange={value=>setForm(p=>({...p,tipo:value}))} loading={catalog.loading} error={catalog.error}/></FormField>
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
          <FormField label="Dirección" className="md:col-span-2"><input maxLength={1000} value={form.direccion} onChange={set('direccion')} className={fieldClass}/></FormField>
          <FormField as="div" label="Cuenta de gasto predeterminada" hint="Se propone en compras nuevas y puede cambiarse por documento o línea." className="md:col-span-2"><SupplierExpenseAccountSelect accounts={accounting.data?.accounts||[]} value={form.default_expense_account_id} onChange={id=>setForm(p=>({...p,default_expense_account_id:id}))} disabled={saving||accounting.loading}/>{accounting.error&&<span role="alert" className="text-xs text-red-600">{accounting.error}</span>}</FormField>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500">Notas internas</label>
            <textarea rows={3} value={form.notas} onChange={set('notas')} className={`${fieldClass} min-h-20`} placeholder="Condiciones especiales, instrucciones de pago..." />
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white py-4 dark:border-slate-700 dark:bg-slate-950">
        <button type="button" disabled={saving} onClick={onCancel} className={secondaryButtonClass}>Cancelar</button>
        <button type="submit" disabled={saving||catalog.loading||Boolean(catalog.error)} className={`${primaryButtonClass} disabled:opacity-50`}>
          {saving ? 'Guardando...' : 'Crear proveedor'}
        </button>
      </div>
      </fieldset>
    </form>
  )
}
