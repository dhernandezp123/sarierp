'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronLeft, Pencil, Check, X } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import {
  primaryButtonClass,
  secondaryButtonClass,
  cardClass,
  fieldClass,
} from '@/src/lib/ui-classes'

// ─── Types ────────────────────────────────────────────────────────────────────

type Agent = {
  id: string
  name: string | null
  type: string | null
  country: string | null
  city: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  profit_per_container: number | null
  mbl_fee: number | null
  currency: string | null
  notes: string | null
}

type RouteRate = {
  id: string
  agent_id: string
  origin: string
  destination: string
  carrier: string | null
  service_type: string
  base_rate: number
  currency: string
  transit_time: number | null
  transshipment: string | null
  free_days_destination: number | null
  valid_from: string | null
  valid_until: string | null
  notes: string | null
}

const TIPOS_AGENTE = ['Agente', 'Naviera', 'Transportista', 'Aduana', 'Almacén', 'Courier', 'Otro'] as const

const SERVICE_TYPES = [
  "FCL 20'", "FCL 40'", "FCL 40HC", "FCL 45HC",
  'LCL', 'Aéreo', 'Aéreo Consolidado', 'Terrestre LTL', 'Terrestre FTL', 'Courier',
] as const

const emptyRate = (agentId: string): Omit<RouteRate, 'id'> => ({
  agent_id: agentId,
  origin: '',
  destination: '',
  carrier: '',
  service_type: "FCL 20'",
  base_rate: 0,
  currency: 'USD',
  transit_time: null,
  transshipment: '',
  free_days_destination: 14,
  valid_from: null,
  valid_until: null,
  notes: '',
})

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function isExpired(d: string | null) {
  if (!d) return false
  return d < new Date().toISOString().slice(0, 10)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [formData, setFormData] = useState<Agent | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [rates, setRates] = useState<RouteRate[]>([])
  const [showRateForm, setShowRateForm] = useState(false)
  const [rateForm, setRateForm] = useState<Omit<RouteRate, 'id'>>(emptyRate(id))
  const [savingRate, setSavingRate] = useState(false)
  const [editingRateId, setEditingRateId] = useState<string | null>(null)
  const [editingRateData, setEditingRateData] = useState<RouteRate | null>(null)

  useEffect(() => { if (id) fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    const [agentRes, ratesRes] = await Promise.all([
      supabase.from('agents').select('*').eq('id', id).single(),
      supabase.from('agent_route_rates').select('*').eq('agent_id', id).order('created_at', { ascending: false }),
    ])
    if (agentRes.error) { toast.error('Agente no encontrado'); router.push('/agents'); return }
    setAgent(agentRes.data as Agent)
    setFormData(agentRes.data as Agent)
    setRates((ratesRes.data || []) as RouteRate[])
    setLoading(false)
  }

  const saveAgent = async () => {
    if (!formData) return
    setSaving(true)
    const { error } = await supabase.from('agents').update({
      name: formData.name,
      type: formData.type,
      country: formData.country,
      city: formData.city,
      contact_name: formData.contact_name,
      email: formData.email,
      phone: formData.phone,
      profit_per_container: formData.profit_per_container,
      mbl_fee: formData.mbl_fee,
      currency: formData.currency,
      notes: formData.notes,
    }).eq('id', id)
    setSaving(false)
    if (error) { toast.error('No se pudo guardar el agente'); return }
    setAgent(formData)
    setEditing(false)
    toast.success('Agente actualizado')
  }

  const saveRate = async () => {
    if (!rateForm.origin || !rateForm.destination) {
      toast.error('Origen y destino son requeridos')
      return
    }
    setSavingRate(true)
    const { error } = await supabase.from('agent_route_rates').insert({
      ...rateForm,
      agent_id: id,
      carrier: rateForm.carrier || null,
      transshipment: rateForm.transshipment || null,
      notes: rateForm.notes || null,
      valid_from: rateForm.valid_from || null,
      valid_until: rateForm.valid_until || null,
    })
    setSavingRate(false)
    if (error) { toast.error(error.message); return }
    toast.success('Tarifa agregada')
    setShowRateForm(false)
    setRateForm(emptyRate(id))
    fetchAll()
  }

  const saveEditedRate = async () => {
    if (!editingRateData) return
    setSavingRate(true)
    const { error } = await supabase.from('agent_route_rates').update({
      origin: editingRateData.origin,
      destination: editingRateData.destination,
      carrier: editingRateData.carrier || null,
      service_type: editingRateData.service_type,
      base_rate: editingRateData.base_rate,
      currency: editingRateData.currency,
      transit_time: editingRateData.transit_time,
      transshipment: editingRateData.transshipment || null,
      free_days_destination: editingRateData.free_days_destination,
      valid_from: editingRateData.valid_from || null,
      valid_until: editingRateData.valid_until || null,
      notes: editingRateData.notes || null,
    }).eq('id', editingRateData.id)
    setSavingRate(false)
    if (error) { toast.error(error.message); return }
    toast.success('Tarifa actualizada')
    setEditingRateId(null)
    setEditingRateData(null)
    fetchAll()
  }

  const deleteRate = async (rateId: string) => {
    const { error } = await supabase.from('agent_route_rates').delete().eq('id', rateId)
    if (error) { toast.error(error.message); return }
    toast.success('Tarifa eliminada')
    setRates((prev) => prev.filter((r) => r.id !== rateId))
  }

  const setField = <K extends keyof Agent>(key: K, value: Agent[K]) =>
    setFormData((prev) => prev ? { ...prev, [key]: value } : prev)

  if (loading || !agent) return <PageSkeleton cards={2} rows={4} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <button type="button" onClick={() => router.push('/agents')} className={secondaryButtonClass}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
              Agentes / Proveedores
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{agent.name}</h1>
            {agent.type && (
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {agent.type}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className={secondaryButtonClass}>
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          ) : (
            <>
              <button type="button" onClick={saveAgent} disabled={saving} className={primaryButtonClass}>
                <Check className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setFormData(agent) }} className={secondaryButtonClass}>
                <X className="h-4 w-4" />
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Agent info */}
      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Información general</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AgentField label="Tipo" editing={editing}>
            {editing ? (
              <select value={formData?.type || ''} onChange={(e) => setField('type', e.target.value)} className={fieldClass}>
                {TIPOS_AGENTE.map((t) => <option key={t}>{t}</option>)}
              </select>
            ) : <span>{agent.type || '—'}</span>}
          </AgentField>
          <AgentField label="País" editing={editing}>
            {editing ? (
              <input value={formData?.country || ''} onChange={(e) => setField('country', e.target.value)} className={fieldClass} />
            ) : <span>{agent.country || '—'}</span>}
          </AgentField>
          <AgentField label="Ciudad" editing={editing}>
            {editing ? (
              <input value={formData?.city || ''} onChange={(e) => setField('city', e.target.value)} className={fieldClass} />
            ) : <span>{agent.city || '—'}</span>}
          </AgentField>
          <AgentField label="Contacto" editing={editing}>
            {editing ? (
              <input value={formData?.contact_name || ''} onChange={(e) => setField('contact_name', e.target.value)} className={fieldClass} />
            ) : <span>{agent.contact_name || '—'}</span>}
          </AgentField>
          <AgentField label="Email" editing={editing}>
            {editing ? (
              <input type="email" value={formData?.email || ''} onChange={(e) => setField('email', e.target.value)} className={fieldClass} />
            ) : <span>{agent.email || '—'}</span>}
          </AgentField>
          <AgentField label="Teléfono" editing={editing}>
            {editing ? (
              <input value={formData?.phone || ''} onChange={(e) => setField('phone', e.target.value)} className={fieldClass} />
            ) : <span>{agent.phone || '—'}</span>}
          </AgentField>
        </div>

        {/* Base fees */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-900/50">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Tarifas base del agente</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <AgentField label="Profit / Cont." editing={editing}>
              {editing ? (
                <input type="number" value={formData?.profit_per_container ?? ''} onChange={(e) => setField('profit_per_container', Number(e.target.value))} className={fieldClass} />
              ) : <span>{agent.currency} {Number(agent.profit_per_container || 0).toFixed(2)}</span>}
            </AgentField>
            <AgentField label="MBL Fee" editing={editing}>
              {editing ? (
                <input type="number" value={formData?.mbl_fee ?? ''} onChange={(e) => setField('mbl_fee', Number(e.target.value))} className={fieldClass} />
              ) : <span>{agent.currency} {Number(agent.mbl_fee || 0).toFixed(2)}</span>}
            </AgentField>
            <AgentField label="Moneda" editing={editing}>
              {editing ? (
                <select value={formData?.currency || 'USD'} onChange={(e) => setField('currency', e.target.value)} className={fieldClass}>
                  {['USD', 'HNL', 'MXN', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              ) : <span>{agent.currency || 'USD'}</span>}
            </AgentField>
          </div>
        </div>

        {/* Notes */}
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Notas</p>
          {editing ? (
            <textarea
              value={formData?.notes || ''}
              onChange={(e) => setField('notes', e.target.value)}
              rows={3}
              className={`${fieldClass} resize-y`}
            />
          ) : (
            <p className="text-sm text-slate-700 dark:text-slate-300">{agent.notes || 'Sin notas'}</p>
          )}
        </div>
      </section>

      {/* Route rates */}
      <section className={cardClass}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Tarifas por ruta</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {rates.length} tarifa{rates.length !== 1 ? 's' : ''} registrada{rates.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowRateForm(!showRateForm); setRateForm(emptyRate(id)) }}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Agregar tarifa
          </button>
        </div>

        {/* New rate form */}
        {showRateForm && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800/40 dark:bg-blue-950/20">
            <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Nueva tarifa</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Origen *</label>
                <input
                  placeholder="Ej. CNSHK"
                  value={rateForm.origin}
                  onChange={(e) => setRateForm((p) => ({ ...p, origin: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Destino *</label>
                <input
                  placeholder="Ej. HNPCR"
                  value={rateForm.destination}
                  onChange={(e) => setRateForm((p) => ({ ...p, destination: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Carrier</label>
                <input
                  placeholder="Ej. MSC"
                  value={rateForm.carrier || ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, carrier: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Tipo de servicio *</label>
                <select
                  value={rateForm.service_type}
                  onChange={(e) => setRateForm((p) => ({ ...p, service_type: e.target.value }))}
                  className={fieldClass}
                >
                  {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Tarifa base</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateForm.base_rate}
                  onChange={(e) => setRateForm((p) => ({ ...p, base_rate: Number(e.target.value) }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Moneda</label>
                <select
                  value={rateForm.currency}
                  onChange={(e) => setRateForm((p) => ({ ...p, currency: e.target.value }))}
                  className={fieldClass}
                >
                  {['USD', 'HNL', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Tránsito (días)</label>
                <input
                  type="number"
                  min="0"
                  value={rateForm.transit_time ?? ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, transit_time: e.target.value ? Number(e.target.value) : null }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Días libres destino</label>
                <input
                  type="number"
                  min="0"
                  value={rateForm.free_days_destination ?? ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, free_days_destination: e.target.value ? Number(e.target.value) : null }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Transbordo</label>
                <input
                  placeholder="Directo / Panamá..."
                  value={rateForm.transshipment || ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, transshipment: e.target.value }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Válida desde</label>
                <input
                  type="date"
                  value={rateForm.valid_from || ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, valid_from: e.target.value || null }))}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Válida hasta</label>
                <input
                  type="date"
                  value={rateForm.valid_until || ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, valid_until: e.target.value || null }))}
                  className={fieldClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-400">Notas</label>
                <input
                  placeholder="Observaciones, condiciones..."
                  value={rateForm.notes || ''}
                  onChange={(e) => setRateForm((p) => ({ ...p, notes: e.target.value }))}
                  className={fieldClass}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={saveRate} disabled={savingRate} className={primaryButtonClass}>
                {savingRate ? 'Guardando...' : 'Guardar tarifa'}
              </button>
              <button type="button" onClick={() => setShowRateForm(false)} className={secondaryButtonClass}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Rates table */}
        {rates.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-500">
              No hay tarifas registradas para este agente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3 pr-3">Ruta</th>
                  <th className="pb-3 pr-3">Carrier</th>
                  <th className="pb-3 pr-3">Servicio</th>
                  <th className="pb-3 pr-3 text-right">Tarifa</th>
                  <th className="pb-3 pr-3 text-center">Tránsito</th>
                  <th className="pb-3 pr-3">Transbordo</th>
                  <th className="pb-3 pr-3">Vigencia</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => {
                  const expired = isExpired(rate.valid_until)
                  if (editingRateId === rate.id && editingRateData) {
                    return (
                      <tr key={rate.id} className="border-b border-blue-100 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-950/10">
                        <td className="py-2 pr-3">
                          <div className="flex gap-1">
                            <input
                              value={editingRateData.origin}
                              onChange={(e) => setEditingRateData((p) => p ? { ...p, origin: e.target.value } : p)}
                              placeholder="Origen"
                              className={`${fieldClass} w-24`}
                            />
                            <span className="self-center text-slate-400">→</span>
                            <input
                              value={editingRateData.destination}
                              onChange={(e) => setEditingRateData((p) => p ? { ...p, destination: e.target.value } : p)}
                              placeholder="Destino"
                              className={`${fieldClass} w-24`}
                            />
                          </div>
                        </td>
                        <td className="pr-3">
                          <input
                            value={editingRateData.carrier || ''}
                            onChange={(e) => setEditingRateData((p) => p ? { ...p, carrier: e.target.value } : p)}
                            className={`${fieldClass} w-24`}
                          />
                        </td>
                        <td className="pr-3">
                          <select
                            value={editingRateData.service_type}
                            onChange={(e) => setEditingRateData((p) => p ? { ...p, service_type: e.target.value } : p)}
                            className={`${fieldClass} w-36`}
                          >
                            {SERVICE_TYPES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="pr-3">
                          <div className="flex gap-1">
                            <input
                              type="number"
                              value={editingRateData.base_rate}
                              onChange={(e) => setEditingRateData((p) => p ? { ...p, base_rate: Number(e.target.value) } : p)}
                              className={`${fieldClass} w-24 text-right`}
                            />
                            <select
                              value={editingRateData.currency}
                              onChange={(e) => setEditingRateData((p) => p ? { ...p, currency: e.target.value } : p)}
                              className={`${fieldClass} w-16`}
                            >
                              {['USD', 'HNL', 'EUR'].map((c) => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="pr-3 text-center">
                          <input
                            type="number"
                            value={editingRateData.transit_time ?? ''}
                            onChange={(e) => setEditingRateData((p) => p ? { ...p, transit_time: e.target.value ? Number(e.target.value) : null } : p)}
                            className={`${fieldClass} w-16 text-center`}
                          />
                        </td>
                        <td className="pr-3">
                          <input
                            value={editingRateData.transshipment || ''}
                            onChange={(e) => setEditingRateData((p) => p ? { ...p, transshipment: e.target.value } : p)}
                            className={`${fieldClass} w-28`}
                          />
                        </td>
                        <td className="pr-3">
                          <div className="flex gap-1">
                            <input
                              type="date"
                              value={editingRateData.valid_until || ''}
                              onChange={(e) => setEditingRateData((p) => p ? { ...p, valid_until: e.target.value || null } : p)}
                              className={`${fieldClass} w-32`}
                            />
                          </div>
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={saveEditedRate}
                              disabled={savingRate}
                              className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingRateId(null); setEditingRateData(null) }}
                              className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr
                      key={rate.id}
                      className={`border-b border-slate-100 dark:border-slate-800 ${expired ? 'opacity-50' : ''}`}
                    >
                      <td className="py-3 pr-3 font-medium text-slate-900 dark:text-white">
                        {rate.origin} → {rate.destination}
                      </td>
                      <td className="pr-3 text-slate-600 dark:text-slate-400">{rate.carrier || '—'}</td>
                      <td className="pr-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {rate.service_type}
                        </span>
                      </td>
                      <td className="pr-3 text-right font-semibold text-slate-900 dark:text-white">
                        {rate.currency} {Number(rate.base_rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="pr-3 text-center text-slate-600 dark:text-slate-400">
                        {rate.transit_time ? `${rate.transit_time}d` : '—'}
                      </td>
                      <td className="pr-3 text-slate-600 dark:text-slate-400">{rate.transshipment || '—'}</td>
                      <td className="pr-3">
                        {rate.valid_until ? (
                          <span className={expired ? 'text-rose-500 text-xs font-semibold' : 'text-xs text-slate-500 dark:text-slate-400'}>
                            {expired ? '⚠ ' : ''}{formatDate(rate.valid_until)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin vencimiento</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingRateId(rate.id); setEditingRateData({ ...rate }) }}
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRate(rate.id)}
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:border-slate-700 dark:hover:bg-rose-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function AgentField({
  label,
  editing,
  children,
}: {
  label: string
  editing: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <div className={editing ? '' : 'text-sm font-medium text-slate-900 dark:text-white'}>
        {children}
      </div>
    </div>
  )
}
