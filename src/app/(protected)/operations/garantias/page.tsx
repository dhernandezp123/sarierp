'use client'

import { guaranteeTotalsByCurrency } from '@/src/lib/guarantees'
import { readAllReportRows } from '@/src/lib/report-query'
import { toDateInputValue } from '@/src/lib/format'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle, Clock, Landmark, Plus, type LucideIcon } from 'lucide-react'
import { FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { CostStatusBadge } from '@/src/components/pricing/CostStatus'
import {
  OperationFilterMetric,
  operationPrimaryButtonClass,
  operationSecondaryButtonClass,
  operationTableHeadClass,
} from '@/src/components/operations/OperationsWorkspace'
import { SidePanel } from '@/src/components/ui/side-panel'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { markFormSaved } from '@/src/components/ui/UnsavedChangesGuard'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
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
  bookings?: Booking | null
}

type Booking = { id: string; booking_number: string | null; shipping_instructions: { routing_number: string | null } | null }

const MONEDAS = ['USD', 'HNL', 'EUR']

const STATUS_CONFIG: Record<string, { label: string; tone: 'amber' | 'emerald' | 'red'; icon: LucideIcon }> = {
  Depositada: { label: 'Depositada', tone: 'amber', icon: Clock },
  Recuperada: { label: 'Recuperada', tone: 'emerald', icon: CheckCircle },
  Vencida: { label: 'Vencida', tone: 'red', icon: AlertTriangle },
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
  fecha_deposito: toDateInputValue(),
  fecha_vencimiento_libre: '',
  notas: '',
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GarantiasNavierasPage() {
  const { user, profile, loading: userLoading } = useUser()
  const canManage = profile?.status === 'Aprobado' && !!profile.is_active && ['Admin', 'Operaciones'].includes(profile.rol)
  const [garantias, setGarantias] = useState<Garantia[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [loadError, setLoadError] = useState('')
  const loadVersion = useRef(0)
  const [showForm, setShowForm] = useState(false)
  const [recoverTarget, setRecoverTarget] = useState<Garantia | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [filterStatus, setFilterStatus] = useState<string>('Activas')
  const [filterNaviera, setFilterNaviera] = useState('')

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    if (!user?.id || !canManage) { setLoading(false); return }
    setLoading(true)
    setLoadError('')
    try {
      const [rows, bookingRows] = await Promise.all([
        readAllReportRows((from, to) => supabase.from('garantias_navieras')
          .select('*, bookings!garantias_navieras_booking_id_fkey(id, booking_number, shipping_instructions!bookings_shipping_instruction_id_fkey(routing_number))')
          .order('fecha_deposito', { ascending: false }).order('id').range(from, to),
          { label: 'garantías', isCurrent: () => loadVersion.current === version }),
        readAllReportRows((from, to) => supabase.from('bookings')
          .select('id, booking_number, shipping_instructions!bookings_shipping_instruction_id_fkey(routing_number)')
          .order('created_at', { ascending: false }).order('id').range(from, to),
          { label: 'bookings', isCurrent: () => loadVersion.current === version }),
      ])
      if (version !== loadVersion.current) return
      guaranteeTotalsByCurrency(rows as unknown as Garantia[])
      setGarantias(rows as unknown as Garantia[])
      setBookings(bookingRows as unknown as Booking[])
    } catch (error) {
      if (version !== loadVersion.current) return
      setGarantias([])
      setBookings([])
      setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar las garantías.')
    } finally { if (version === loadVersion.current) setLoading(false) }
  }, [user?.id, canManage])
  useEffect(() => {
    if (userLoading) return
    const versionRef = loadVersion
    const timer = window.setTimeout(() => void load(), 0)
    return () => { window.clearTimeout(timer); ++versionRef.current }
  }, [load, userLoading])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSave = async () => {
    if (savingRef.current || !canManage) return
    if (!form.naviera.trim()) { toast.info('La naviera es obligatoria'); return }
    const monto = parseFloat(form.monto)
    if (!Number.isFinite(monto) || monto <= 0) { toast.info('Ingresa un monto válido'); return }
    if (!form.fecha_deposito) { toast.info('La fecha de depósito es obligatoria'); return }

    savingRef.current = true
    setSaving(true)
    try {
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
    markFormSaved()
    setForm({ ...INITIAL_FORM, fecha_deposito: toDateInputValue() })
    setShowForm(false)
    await load()
    } catch { toast.error('No se pudo confirmar el registro. Revisa el listado antes de reintentar.') }
    finally { savingRef.current = false; setSaving(false) }
  }

  const marcarRecuperada = async (g: Garantia) => {
    if (savingRef.current || !canManage) return
    savingRef.current = true
    setSaving(true)
    try {
    const today = toDateInputValue()
    const { error } = await supabase
      .from('garantias_navieras')
      .update({ status: 'Recuperada', fecha_recuperacion: today })
      .eq('id', g.id)
      .eq('status', 'Depositada')
      .select('id').single()
    if (error) { toast.error(error.message); return }
    toast.success('Garantía marcada como recuperada')
    await load()
    } catch { toast.error('No se pudo confirmar la recuperación. Actualiza el listado.') }
    finally { savingRef.current = false; setSaving(false) }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const depositadas = garantias.filter((g) => g.status === 'Depositada')
  const totalsByCurrency = guaranteeTotalsByCurrency(depositadas)
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
      filterStatus === 'Por vencer' ? alertas.includes(g) :
      g.status === filterStatus

    const matchNaviera = !filterNaviera || g.naviera === filterNaviera
    return matchStatus && matchNaviera
  })

  // ─── Render ───────────────────────────────────────────────────────────────
  if (userLoading) return <TableSkeleton rows={5} cols={8} />
  if (!canManage) return <EmptyState title="Acceso restringido" description="Garantías está disponible para Operaciones y Administración con cuenta aprobada y activa." />

  const metricValue = (value: string | number) => loading ? '…' : loadError ? 'No disponible' : value
  const statusCounts: Record<string, number> = {
    Activas: depositadas.length,
    'Por vencer': alertas.length,
    Todas: garantias.length,
    Depositada: depositadas.length,
    Recuperada: garantias.filter((g) => g.status === 'Recuperada').length,
    Vencida: garantias.filter((g) => g.status === 'Vencida').length,
  }

  return (
    <div className="space-y-6">
      <FinancePageHeader
        eyebrow="Operaciones"
        icon={Landmark}
        title="Garantías navieras"
        description="Depósitos de garantía por contenedor: vencimientos de devolución y recuperación."
        actions={
          <button type="button" onClick={() => setShowForm(true)} className={operationPrimaryButtonClass}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Nueva garantía
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <OperationFilterMetric
          label="Depositado activo"
          value={metricValue(totalsByCurrency.length ? totalsByCurrency.map(([currency, total]) => fmtMoney(total, currency)).join(' · ') : 'Sin depósitos')}
          detail={`${depositadas.length} garantía${depositadas.length !== 1 ? 's' : ''} activa${depositadas.length !== 1 ? 's' : ''}`}
          icon={Landmark}
          tone="sky"
          active={filterStatus === 'Activas'}
          onClick={() => setFilterStatus('Activas')}
        />
        <OperationFilterMetric
          label="Por vencer (≤ 14 días)"
          value={metricValue(alertas.length)}
          detail={alertas.length > 0 ? 'Devolver el contenedor a tiempo' : 'Sin vencimientos cercanos'}
          icon={AlertTriangle}
          tone={alertas.length > 0 ? 'red' : 'slate'}
          active={filterStatus === 'Por vencer'}
          onClick={() => setFilterStatus(filterStatus === 'Por vencer' ? 'Activas' : 'Por vencer')}
        />
        <OperationFilterMetric
          label="Recuperadas"
          value={metricValue(statusCounts.Recuperada)}
          detail="Histórico total"
          icon={CheckCircle}
          tone="emerald"
          active={filterStatus === 'Recuperada'}
          onClick={() => setFilterStatus(filterStatus === 'Recuperada' ? 'Activas' : 'Recuperada')}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220] md:flex-row md:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {['Activas', 'Por vencer', 'Todas', 'Recuperada', 'Vencida'].map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filterStatus === s}
              onClick={() => setFilterStatus(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 ${
                filterStatus === s
                  ? 'border-[#B3282D] bg-rose-50 text-[#B3282D] dark:border-rose-400 dark:bg-rose-950/40 dark:text-rose-200'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {s === 'Recuperada' ? 'Recuperadas' : s === 'Vencida' ? 'Vencidas' : s}
              <span className="tabular-nums opacity-70">{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        {navieras.length > 0 && (
          <label className="flex items-center gap-2 md:ml-auto">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Naviera</span>
            <select value={filterNaviera} onChange={(e) => setFilterNaviera(e.target.value)} className={`${fieldClass} h-10 w-auto`}>
              <option value="">Todas</option>
              {navieras.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6"><TableSkeleton rows={5} cols={7} /></div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 p-6 text-rose-700 dark:text-rose-300">
            {loadError}
            <button type="button" onClick={() => void load()} className={financeActionClass}>Reintentar</button>
          </div>
        ) : filtered.length === 0 ? (
          garantias.length === 0 ? (
            <EmptyState
              title="Sin garantías"
              description="Registra el primer depósito de garantía con el botón Nueva garantía."
              action={{ label: 'Nueva garantía', onClick: () => setShowForm(true) }}
            />
          ) : (
            <EmptyState
              title="Sin resultados"
              description="Ninguna garantía coincide con el filtro."
              action={{ label: 'Ver activas', onClick: () => { setFilterStatus('Activas'); setFilterNaviera('') } }}
            />
          )
        ) : (
          <div className="relative overflow-x-auto" role="region" aria-label="Garantías navieras" tabIndex={0}>
            <table className="w-full min-w-[880px] text-sm">
              <thead className={operationTableHeadClass}>
                <tr>
                  {['Naviera', 'Contenedor / BL', 'Operación', 'Monto', 'Depósito', 'Devolución', 'Estado'].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-4 py-3">{h}</th>
                  ))}
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const statusCfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.Depositada
                  return (
                    <tr key={g.id} className="border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-slate-900 dark:text-white">{g.naviera}</th>
                      <td className="px-4 py-3">
                        <span className="block font-medium text-slate-800 dark:text-slate-200">{g.contenedor || '—'}</span>
                        {g.bl_number && <span className="block text-xs text-slate-500 dark:text-slate-400">{g.bl_number}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {g.bookings ? g.bookings.shipping_instructions?.routing_number || g.bookings.booking_number || '—' : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">{fmtMoney(g.monto, g.moneda)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{fmtDate(g.fecha_deposito)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {g.status === 'Recuperada'
                          ? <span className="text-xs text-slate-500 dark:text-slate-400">Recuperada {fmtDate(g.fecha_recuperacion)}</span>
                          : <VencimientoBadge fecha={g.fecha_vencimiento_libre} status={g.status} />}
                      </td>
                      <td className="px-4 py-3">
                        <CostStatusBadge tone={statusCfg.tone} icon={statusCfg.icon} className="whitespace-nowrap">{statusCfg.label}</CostStatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {g.status === 'Depositada' && (
                          <button
                            type="button"
                            onClick={() => setRecoverTarget(g)}
                            disabled={saving}
                            className="whitespace-nowrap rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800/60 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
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

      <SidePanel
        open={showForm}
        onClose={() => setShowForm(false)}
        size="md"
        eyebrow="Operaciones · Garantías"
        title="Nueva garantía"
        description="Registra el depósito y la fecha límite para devolver el contenedor."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="guarantee-booking_id" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Booking / operación</label>
              <select id="guarantee-booking_id" name="booking_id" value={form.booking_id} onChange={handleChange} className={fieldClass}>
                <option value="">Sin vincular</option>
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shipping_instructions?.routing_number || b.id.slice(0, 8)} {b.booking_number ? `· ${b.booking_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="guarantee-naviera" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Naviera *</label>
              <input id="guarantee-naviera" name="naviera" value={form.naviera} onChange={handleChange} placeholder="Ej. MAERSK, COSCO" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="guarantee-contenedor" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Contenedor</label>
              <input id="guarantee-contenedor" name="contenedor" value={form.contenedor} onChange={handleChange} placeholder="MOLU1234567" className={fieldClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="guarantee-bl_number" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">BL / referencia</label>
              <input id="guarantee-bl_number" name="bl_number" value={form.bl_number} onChange={handleChange} placeholder="BL-XXXXXXXXX" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="guarantee-monto" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Monto *</label>
              <input id="guarantee-monto" name="monto" type="number" step="0.01" min="0" inputMode="decimal" value={form.monto} onChange={handleChange} placeholder="0.00" className={`${fieldClass} tabular-nums`} />
            </div>
            <div>
              <label htmlFor="guarantee-moneda" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Moneda</label>
              <select id="guarantee-moneda" name="moneda" value={form.moneda} onChange={handleChange} className={fieldClass}>
                {MONEDAS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="guarantee-fecha_deposito" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Fecha de depósito *</label>
              <input id="guarantee-fecha_deposito" name="fecha_deposito" type="date" value={form.fecha_deposito} onChange={handleChange} className={`${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
            <div>
              <label htmlFor="guarantee-fecha_vencimiento_libre" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Límite de devolución del contenedor</label>
              <input id="guarantee-fecha_vencimiento_libre" name="fecha_vencimiento_libre" type="date" value={form.fecha_vencimiento_libre} onChange={handleChange} className={`${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="guarantee-notas" className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Notas</label>
              <textarea id="guarantee-notas" name="notas" value={form.notas} onChange={handleChange} rows={3} placeholder="Observaciones, número de confirmación del depósito..." className={`${fieldClass} h-auto resize-y py-3`} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => setShowForm(false)} className={operationSecondaryButtonClass}>Cancelar</button>
            <button type="button" onClick={handleSave} disabled={saving} className={operationPrimaryButtonClass}>
              {saving ? 'Guardando...' : 'Registrar garantía'}
            </button>
          </div>
        </div>
      </SidePanel>

      <ConfirmDialog
        open={recoverTarget !== null}
        onOpenChange={(open) => { if (!open) setRecoverTarget(null) }}
        title="Marcar garantía como recuperada"
        description={recoverTarget ? `Se registrará la recuperación de ${fmtMoney(recoverTarget.monto, recoverTarget.moneda)} de ${recoverTarget.naviera} con fecha de hoy.` : undefined}
        confirmLabel="Marcar recuperada"
        onConfirm={() => {
          const target = recoverTarget
          setRecoverTarget(null)
          if (target) void marcarRecuperada(target)
        }}
      />
    </div>
  )
}
