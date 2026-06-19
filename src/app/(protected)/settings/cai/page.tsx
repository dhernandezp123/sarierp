'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, CheckCircle2, AlertTriangle, Trash2, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type CaiRange = {
  id: string
  cai: string
  rango_desde: string
  rango_hasta: string
  fecha_limite_emision: string
  lugar_emision: string | null
  is_active: boolean
  created_at: string
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}

function isNearExpiry(fecha: string | null): boolean {
  if (!fecha) return false
  const diff = (new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 30
}

function isExpired(fecha: string | null): boolean {
  if (!fecha) return false
  return fecha < new Date().toISOString().slice(0, 10)
}

function parseSarNumber(n: string): number {
  return parseInt(n.replace(/-/g, '').slice(-8), 10) || 0
}

function getRangeUsedPct(active: CaiRange, used: number): number {
  const desde = parseSarNumber(active.rango_desde)
  const hasta = parseSarNumber(active.rango_hasta)
  const total = hasta - desde + 1
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
}

const emptyForm = {
  cai: '',
  rango_desde: '',
  rango_hasta: '',
  fecha_limite_emision: '',
  lugar_emision: '',
}

export default function CaiSettingsPage() {
  const { profile } = useUser()
  const isAdmin = profile?.rol === 'Admin'

  const [loading, setLoading] = useState(true)
  const [ranges, setRanges] = useState<CaiRange[]>([])
  const [usedCount, setUsedCount] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [rangesRes, countRes] = await Promise.all([
      supabase.from('cai_ranges').select('*').order('created_at', { ascending: false }),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).not('cai', 'is', null).eq('invoice_type', 'Factura'),
    ])
    if (rangesRes.error) toast.error('Error al cargar rangos CAI')
    setRanges((rangesRes.data || []) as CaiRange[])
    setUsedCount(countRes.count || 0)
    setLoading(false)
  }

  const handleSave = async () => {
    if (!form.cai || !form.rango_desde || !form.rango_hasta || !form.fecha_limite_emision) {
      toast.error('CAI, rango y fecha límite son requeridos')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('cai_ranges').insert({
      cai: form.cai.trim(),
      rango_desde: form.rango_desde.trim(),
      rango_hasta: form.rango_hasta.trim(),
      fecha_limite_emision: form.fecha_limite_emision,
      lugar_emision: form.lugar_emision.trim() || null,
      is_active: false,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Rango CAI registrado')
    setForm(emptyForm)
    setShowForm(false)
    fetchAll()
  }

  const activateRange = async (id: string) => {
    setActivating(id)
    // Desactivar todos primero
    await supabase.from('cai_ranges').update({ is_active: false }).neq('id', 'none')
    const { error } = await supabase.from('cai_ranges').update({ is_active: true }).eq('id', id)
    setActivating(null)
    if (error) { toast.error(error.message); return }
    toast.success('Rango CAI activado')
    fetchAll()
  }

  const deleteRange = async (id: string, isActive: boolean) => {
    if (isActive) { toast.error('No puedes eliminar el rango activo'); return }
    const { error } = await supabase.from('cai_ranges').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Rango eliminado')
    fetchAll()
  }

  const activeRange = ranges.find((r) => r.is_active)
  const pct = activeRange ? getRangeUsedPct(activeRange, usedCount) : 0
  const nearExpiry = activeRange && isNearExpiry(activeRange.fecha_limite_emision)
  const expired = activeRange && isExpired(activeRange.fecha_limite_emision)
  const nearLimit = pct >= 80

  if (loading) return <PageSkeleton cards={1} rows={4} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Configuración
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Rangos CAI — SAR</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gestión de Códigos de Autorización de Impresión para facturas.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            Registrar rango CAI
          </button>
        )}
      </div>

      {/* Status del rango activo */}
      {activeRange ? (
        <div className={`rounded-2xl border p-5 ${
          expired ? 'border-rose-300 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/30'
          : nearExpiry || nearLimit ? 'border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30'
          : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {expired ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              ) : nearExpiry || nearLimit ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              ) : (
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              )}
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {expired ? 'Rango CAI vencido' : nearExpiry || nearLimit ? 'Alerta de rango CAI' : 'Rango CAI activo'}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                  CAI: {activeRange.cai}
                </p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-slate-500 dark:text-slate-400">Vence: <span className={`font-semibold ${expired ? 'text-rose-600' : nearExpiry ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{formatDate(activeRange.fecha_limite_emision)}</span></p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">Facturas emitidas: <span className="font-semibold text-slate-900 dark:text-white">{usedCount}</span></p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Rango desde</p>
              <p className="font-mono font-semibold text-slate-900 dark:text-white">{activeRange.rango_desde}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Rango hasta</p>
              <p className="font-mono font-semibold text-slate-900 dark:text-white">{activeRange.rango_hasta}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Lugar de emisión</p>
              <p className="font-semibold text-slate-900 dark:text-white">{activeRange.lugar_emision || '—'}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Uso del rango</span>
              <span className={nearLimit ? 'font-bold text-amber-600' : ''}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {(nearExpiry || nearLimit || expired) && (
              <p className={`mt-2 text-xs font-semibold ${expired ? 'text-rose-600' : 'text-amber-600'}`}>
                {expired ? '⚠ El rango CAI ha vencido. Debes registrar y activar un nuevo rango antes de emitir facturas.' :
                 nearExpiry ? `⚠ El rango vence en menos de 30 días. Solicita un nuevo CAI al SAR.` :
                 `⚠ El rango está al ${pct}% de uso. Solicita pronto un nuevo CAI al SAR.`}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800/50 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Sin rango CAI activo</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                No puedes emitir facturas SAR sin un rango CAI activo. Registra uno y actívalo.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form nuevo rango */}
      {showForm && isAdmin && (
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Nuevo rango CAI</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                CAI <span className="text-red-500">*</span>
              </label>
              <input
                value={form.cai}
                onChange={(e) => setForm((p) => ({ ...p, cai: e.target.value }))}
                placeholder="XXXXXX-XXXXX-XXXXX-XXXXXXXX-XXXXX-XX"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rango desde <span className="text-red-500">*</span>
              </label>
              <input
                value={form.rango_desde}
                onChange={(e) => setForm((p) => ({ ...p, rango_desde: e.target.value }))}
                placeholder="000-001-01-00000001"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rango hasta <span className="text-red-500">*</span>
              </label>
              <input
                value={form.rango_hasta}
                onChange={(e) => setForm((p) => ({ ...p, rango_hasta: e.target.value }))}
                placeholder="000-001-01-00000500"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Fecha límite de emisión <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.fecha_limite_emision}
                onChange={(e) => setForm((p) => ({ ...p, fecha_limite_emision: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Lugar de emisión
              </label>
              <input
                value={form.lugar_emision}
                onChange={(e) => setForm((p) => ({ ...p, lugar_emision: e.target.value }))}
                placeholder="Ej. San Pedro Sula, Honduras"
                className={fieldClass}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
              {saving ? 'Guardando...' : 'Guardar rango'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className={secondaryButtonClass}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Lista de rangos */}
      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          Historial de rangos CAI
        </h2>
        {ranges.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No hay rangos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3 pr-4">CAI</th>
                  <th className="pb-3 pr-4">Rango</th>
                  <th className="pb-3 pr-4">Fecha límite</th>
                  <th className="pb-3 pr-4">Lugar</th>
                  <th className="pb-3 pr-4 text-center">Estado</th>
                  {isAdmin && <th className="pb-3" />}
                </tr>
              </thead>
              <tbody>
                {ranges.map((r) => {
                  const exp = isExpired(r.fecha_limite_emision)
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-3 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {r.cai}
                      </td>
                      <td className="pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {r.rango_desde}<br />→ {r.rango_hasta}
                      </td>
                      <td className={`pr-4 text-sm ${exp ? 'text-rose-500 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {formatDate(r.fecha_limite_emision)}
                        {exp && <span className="ml-1">⚠</span>}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-400">{r.lugar_emision || '—'}</td>
                      <td className="pr-4 text-center">
                        {r.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Activo
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Inactivo
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="flex gap-1 justify-end">
                            {!r.is_active && !exp && (
                              <button
                                type="button"
                                onClick={() => activateRange(r.id)}
                                disabled={activating === r.id}
                                className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400"
                              >
                                {activating === r.id ? '...' : 'Activar'}
                              </button>
                            )}
                            {!r.is_active && (
                              <button
                                type="button"
                                onClick={() => deleteRange(r.id, r.is_active)}
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:border-slate-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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
