'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'

export const TIPOS_AGENTE = ['Agente', 'Naviera', 'Transportista', 'Aduana', 'Almacén', 'Courier', 'Otro'] as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
    </div>
  )
}

const initialForm = {
  name:                  '',
  type:                  'Agente',
  country:               '',
  city:                  '',
  contact_name:          '',
  email:                 '',
  phone:                 '',
  profit_per_container:  '',
  mbl_fee:               '',
  currency:              'USD',
  notes:                 '',
}

export default function AgentForm({ onCreated }: { onCreated?: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form,   setForm]   = useState(initialForm)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm({ ...form, [e.target.name]: e.target.value })

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.info('El nombre es obligatorio'); return }
    setSaving(true)
    const { error } = await supabase.from('agents').insert({
      ...form,
      profit_per_container: Number(form.profit_per_container || 0),
      mbl_fee:              Number(form.mbl_fee || 0),
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Agente creado correctamente')
    setForm(initialForm)
    onCreated?.()
  }

  return (
    <div className="space-y-3">
      <Field label="Nombre *">
        <input
          name="name"
          placeholder="Ej. APS Express"
          value={form.name}
          onChange={handleChange}
          className={fieldClass}
        />
      </Field>

      <Field label="Tipo">
        <select name="type" value={form.type} onChange={handleChange} className={fieldClass}>
          {TIPOS_AGENTE.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="País">
          <input
            name="country"
            placeholder="China"
            value={form.country}
            onChange={handleChange}
            className={fieldClass}
          />
        </Field>
        <Field label="Ciudad">
          <input
            name="city"
            placeholder="Shenzhen"
            value={form.city}
            onChange={handleChange}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Contacto">
        <input
          name="contact_name"
          placeholder="Nombre del contacto"
          value={form.contact_name}
          onChange={handleChange}
          className={fieldClass}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <input
            name="email"
            type="email"
            placeholder="agente@email.com"
            value={form.email}
            onChange={handleChange}
            className={fieldClass}
          />
        </Field>
        <Field label="Teléfono">
          <input
            name="phone"
            placeholder="+86 000 0000"
            value={form.phone}
            onChange={handleChange}
            className={fieldClass}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/30">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Tarifas base
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Profit/Cont.">
            <input
              name="profit_per_container"
              type="number"
              placeholder="0"
              value={form.profit_per_container}
              onChange={handleChange}
              className={fieldClass}
            />
          </Field>
          <Field label="MBL Fee">
            <input
              name="mbl_fee"
              type="number"
              placeholder="0"
              value={form.mbl_fee}
              onChange={handleChange}
              className={fieldClass}
            />
          </Field>
          <Field label="Moneda">
            <select name="currency" value={form.currency} onChange={handleChange} className={fieldClass}>
              <option>USD</option>
              <option>HNL</option>
              <option>MXN</option>
              <option>EUR</option>
            </select>
          </Field>
        </div>
      </div>

      <Field label="Notas">
        <textarea
          name="notes"
          placeholder="Observaciones, condiciones especiales..."
          value={form.notes}
          onChange={handleChange}
          rows={3}
          className={`${fieldClass} resize-y`}
        />
      </Field>

      <button
        type="button"
        onClick={handleCreate}
        disabled={saving}
        className={`w-full ${primaryButtonClass}`}
      >
        {saving ? 'Guardando...' : 'Guardar agente'}
      </button>
    </div>
  )
}
