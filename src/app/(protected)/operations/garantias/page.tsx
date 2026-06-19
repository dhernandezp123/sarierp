'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle, Clock, Plus, X } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'

// ─── Types ───────────────────────────────────────────────────────────────────

type Garantia = {
  id: string
  booking_id: string | null
  naviera: string
  contenedor: string | null
  bl_number: string | null
  monto: number
  moneda: string
  fecha_deposito: string
  fecha_vencimiento_libre: string | null
  fecha_recuperacion: string | null
  status: 'Depositada' | 'Recuperada' | 'Vencida'
  notas: string | null
  created_at: string
  bookings?: { routing_number: string | null; booking_number: string | null } | null
}

type Booking = { id: string; routing_number: string | null; booking_number: string | null }

const MONEDAS = ['USD', 'HNL', 'EUR']

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  Depositada: { label: 'Depositada',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',    icon: Clock },
  Recuperada: { label: 'Recuperada',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle },
  Vencida:    { label: 'Vencida',     cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',             icon: AlertTriangle },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtMoney = (n: number, cur = 'USD') =>
  `${cur} ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

function getDaysUntil(date: string | null): number | null {
  if (!date) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((new Date(date + 'T00:00:00').getTime() - today.getTime()) / 86400000)
}

function VencimientoBadge({ fecha, status }: { fecha: string | null; status: string }) {
  if (status !== 'Depositada' || !fecha) return <span className="text-slate-400 text-xs">—</span>
  const days = getDaysUntil(fecha)
  if (days === null) return <span className="text-slate-400 text-xs">—</span>
  if (days < 0)  return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300"><AlertTriangle className="h-3 w-3" />Vencida hace {Math.abs(days)} días</span>
  if (days <= 7) return <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"><AlertTriangle className="h-3 w-3" />{days === 0 ? 'Vence hoy' : `${days} días`}</span>
  if (days <= 14) return <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">{days} días</span>
  return <span className="text-sm text-slate-600 dark:text-slate-300">{fmtDate(fecha)}</span>
}

const INITIAL_FORM = {
  booking_id: '',
  naviera: '',
  contenedor: '',
  bl_number: '',
  monto: '',
  moneda: 'USD',
  fecha_deposito: new Date().toISOString().split('T')[0],
  fecha_vencimiento_libre: '',
  notas: '',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GarantiasNavierasPage() {
  const { user } = useUser()
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [filterStatus, setFilterStatus] = useState<string>('Activas')
  const [filterNaviera, setFilterNaviera] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [garantiasRes, bookingsRes] = await Promise.all([
      supabase
        .from('garantias_navieras')
        .select('*, bookings(routing_number, booking_number)')
        .order('fecha_deposito', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, routing_number, booking_number')
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    if (garantiasRes.error) toast.error('Error al cargar garantías')
    setGarantias((garantiasRes.data || []) as Garantia[])
    setBookings(bookingsRes.data || [])
    setLoading(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSave = async () => {
    if (!form.naviera.trim()) { toast.info('La naviera es obligatoria'); return }
    const monto = parseFloat(form.monto)
    if (isNaN(monto) || monto <= 0) { toast.info('Ingresa un monto válido'); return }
    if (!form.fecha_deposito) { toast.info('La fecha de depósito es obligatoria'); return }

    setSaving(true)
    const { error } = await supabase.from('garantias_navieras').insert({
      booking_id:             form.booking_id || null,
      naviera:                form.naviera.trim(),
      contenedor:             form.contenedor.trim() || null,
      bl_number:              form.bl_number.trim() || null,
      monto,
      moneda:                 form.moneda,
      fecha_deposito:         form.fecha_deposito,
      fecha_vencimiento_libre: form.fecha_vencimiento_libre || null,
      notas:                  form.notas.trim() || null,
      created_by:             user?.id || null,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Garantía registrada')
    setForm(INITIAL_FORM)
    setShowForm(false)
    load()
  }

  const marcarRecuperada = async (g: Garantia) => {
    const today = new Date().toISOString().split('T')[0]
    const { error } = await supabase
      .from('garantias_navieras')
      .update({ status: 'Recuperada', fecha_recuperacion: today })
      .eq('id', g.id)
    if (error) { toast.error(error.message); return }
    toast.success('Garantía marcada como recuperada')
    load()
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const depositadas = garantias.filter((g) => g.status === 'Depositada')
  const totalDeposited = depositadas.reduce((s, g) => s + Number(g.monto), 0)
  const alertas = depositadas.filter((g) => {
    const d = getDaysUntil(g.fecha_vencimiento_libre)
    return d !== null && d <= 14
  })

  // ── Filters ───────────────────────────────────────────────────────────────
  const navieras = Array.from(new Set(garantias.map((g) => g.naviera))).sort()

  const filtered = garantias.filter((g) => {
    const matchStatus =
      filterStatus === 'Todas'   ? true :
      filterStatus === 'Activas' ? g.status === 'Depositada' :
      g.status === filterStatus

    const matchNaviera = !filterNaviera || g.naviera === filterNaviera
    return matchStatus && matchNaviera
  })

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Operaciones
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
            Garantías Navieras
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registro y seguimiento de depósitos de garantía por contenedor a navieras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" />
          Nueva garantía
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Depositado activo</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            {fmtMoney(totalDeposited)}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{depositadas.length} garantía{depositadas.length !== 1 ? 's' : ''} activa{depositadas.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={`${cardClass} ${alertas.length > 0 ? 'border-orange-300 dark:border-orange-700/60' : ''}`}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Por vencer (≤ 14 días)</p>
          <p className={`mt-1 text-2xl font-bold ${alertas.length > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'}`}>
            {alertas.length}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">requieren atención</p>
        </div>
        <div className={cardClass}>
          <p className="text-xs text-slate-500 dark:text-slate-400">Recuperadas</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {garantias.filter((g) => g.status === 'Recuperada').length}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">histórico total</p>
        </div>
      </div>

      {/* Formulario nueva garantía */}
      {showForm && (
        <div className={`${cardClass} border-blue-200 dark:border-blue-800/60`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Nueva Garantía</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Booking / Embarque</label>
              <select name="booking_id" value={form.booking_id} onChange={handleChange} className={fieldClass}>
                <option value="">Sin vincular</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.routing_number || b.id.slice(0, 8)} {b.booking_number ? `· ${b.booking_number}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Naviera <span className="text-red-400">*</span></label>
              <input name="naviera" value={form.naviera} onChange={handleChange} placeholder="Ej. MAERSK, COSCO" className={fieldClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Contenedor</label>
              <input name="contenedor" value={form.contenedor} onChange={handleChange} placeholder="MOLU1234567" className={fieldClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">BL / Referencia</label>
              <input name="bl_number" value={form.bl_number} onChange={handleChange} placeholder="BL-XXXXXXXXX" className={fieldClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Monto <span className="text-red-400">*</span></label>
              <input name="monto" type="number" step="0.01" min="0" value={form.monto} onChange={handleChange} placeholder="0.00" className={fieldClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Moneda</label>
              <select name="moneda" value={form.moneda} onChange={handleChange} className={fieldClass}>
                {MONEDAS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Fecha depósito <span className="text-red-400">*</span></label>
              <input name="fecha_deposito" type="date" value={form.fecha_deposito} onChange={handleChange} className={fieldClass} />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Fecha límite devolución contenedor</label>
              <input name="fecha_vencimiento_libre" type="date" value={form.fecha_vencimiento_libre} onChange={handleChange} className={fieldClass} />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500">Notas</label>
              <textarea name="notas" value={form.notas} onChange={handleChange} rows={2} placeholder="Observaciones, número de confirmación de depósito..." className={`${fieldClass} resize-y`} />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className={secondaryButtonClass}>Cancelar</button>
            <button type="button" onClick={handleSave} disabled={saving} className={primaryButtonClass}>
              {saving ? 'Guardando...' : 'Registrar garantía'}
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className={`${cardClass} py-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {['Activas', 'Todas', 'Depositada', 'Recuperada', 'Vencida'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilterStatus(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filterStatus === s
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {navieras.length > 0 && (
            <select
              value={filterNaviera}
              onChange={(e) => setFilterNaviera(e.target.value)}
              className={`${fieldClass} w-auto`}
            >
              <option value="">Todas las navieras</option>
              {navieras.map((n) => <option key={n}>{n}</option>)}
            </select>
          )}
          <span className="ml-auto text-xs text-slate-400">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Tabla */}
      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={8} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Sin garantías"
            description="Registra el primer depósito de garantía con el botón Nueva garantía."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  {['Naviera', 'Contenedor / BL', 'Booking', 'Monto', 'Depósito', 'Devolución', 'Estado', 'Acciones'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const statusCfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.Depositada
                  const Icon = statusCfg.icon
                  return (
                    <tr key={g.id} className="border-b border-slate-100 transition hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/20">

                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-white">{g.naviera}</p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{g.contenedor || '—'}</p>
                        {g.bl_number && <p className="text-xs text-slate-400">{g.bl_number}</p>}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {g.bookings
                          ? g.bookings.routing_number || g.bookings.booking_number || '—'
                          : '—'}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                        {fmtMoney(g.monto, g.moneda)}
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {fmtDate(g.fecha_deposito)}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {g.status === 'Recuperada'
                          ? <span className="text-xs text-slate-400">Recuperada {fmtDate(g.fecha_recuperacion)}</span>
                          : <VencimientoBadge fecha={g.fecha_vencimiento_libre} status={g.status} />
                        }
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusCfg.cls}`}>
                          <Icon className="h-3 w-3" />
                          {statusCfg.label}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {g.status === 'Depositada' && (
                          <button
                            type="button"
                            onClick={() => marcarRecuperada(g)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                          >
                            Marcar recuperada
                          </button>
                        )}
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
