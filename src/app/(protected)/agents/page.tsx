'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase/client'
import { fieldClass, cardClass } from '@/src/lib/ui-classes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPOS_AGENTE = ['Agente', 'Naviera', 'Transportista', 'Aduana', 'Almacén', 'Courier', 'Otro'] as const

function getTipoBadge(tipo?: string | null) {
  switch (tipo) {
    case 'Agente':        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Naviera':       return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'Transportista': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Aduana':        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    case 'Almacén':       return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Courier':       return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
    default:              return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
}

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

// ─── Página ───────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const [agents,  setAgents]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [form,    setForm]    = useState(initialForm)

  useEffect(() => { fetchAgents() }, [])

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false })
    setAgents(data || [])
    setLoading(false)
  }

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
    fetchAgents()
  }

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase()
    return (
      a.name?.toLowerCase().includes(q) ||
      a.country?.toLowerCase().includes(q) ||
      a.city?.toLowerCase().includes(q) ||
      a.contact_name?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Agentes / Proveedores
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Catálogo base para pricing, márgenes y tarifas por proveedor.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">

        {/* ── Formulario nuevo agente ── */}
        <div className={`${cardClass} self-start`}>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Nuevo Agente
          </h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Completa los datos del agente o proveedor.
          </p>

          <div className="mt-5 space-y-3">
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
              className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              {saving ? 'Guardando...' : 'Guardar agente'}
            </button>
          </div>
        </div>

        {/* ── Tabla de agentes ── */}
        <div className={`${cardClass} p-0 overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700/60">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Agentes Registrados
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {agents.length} agente{agents.length !== 1 ? 's' : ''} en el catálogo
              </p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-9 w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {loading ? (
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">Cargando...</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {search ? 'Sin resultados' : 'No hay agentes registrados.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 dark:bg-[#081120]">
                    {['Agente', 'Tipo', 'País / Ciudad', 'Contacto', 'Profit/Cont.', 'MBL', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((agent) => (
                    <tr
                      key={agent.id}
                      className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {agent.name}
                        </p>
                        {agent.email && (
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            {agent.email}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getTipoBadge(agent.type)}`}>
                          {agent.type || 'N/A'}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        <p>{agent.country || 'N/A'}</p>
                        {agent.city && (
                          <p className="text-xs text-slate-400 dark:text-slate-500">{agent.city}</p>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {agent.contact_name || 'N/A'}
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                        {agent.currency} {Number(agent.profit_per_container || 0).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                        {agent.currency} {Number(agent.mbl_fee || 0).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/agents/${agent.id}`}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Mostrando {filtered.length} de {agents.length} agentes
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}