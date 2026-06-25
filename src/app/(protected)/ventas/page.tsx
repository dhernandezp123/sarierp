'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Phone, MapPin, Users, Plus, X, Clock, Search, Pencil, Trash2,
  CalendarClock, Target, AlertCircle, UserCheck, UserPlus,
  ChevronLeft, ChevronRight, LayoutList, Calendar,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { fieldClass } from '@/src/lib/ui-classes'

// ─── Types ───────────────────────────────────────────────────────────────────

type TipoActividad  = 'Visita' | 'Llamada' | 'Reunión'
type TipoCliente    = 'Nuevo' | 'Mantenimiento'
type EtapaCaptacion =
  | 'Primer Contacto' | 'Prospecto Calificado' | 'Cotización Enviada'
  | 'En Negociación'  | 'Ganado'               | 'Perdido' | 'Cliente Activo'

type SalesActivity = {
  id:                   string
  tipo_actividad:       TipoActividad
  tipo_cliente:         TipoCliente
  cliente_id:           string | null
  clientes?:            { nombre: string } | null
  nombre_prospecto:     string | null
  empresa_prospecto:    string | null
  fecha_actividad:      string
  hora_inicio:          string | null
  hora_fin:             string | null
  etapa_captacion:      EtapaCaptacion | null
  comentarios:          string | null
  resultado:            string | null
  proxima_accion:       string | null
  fecha_proxima_accion: string | null
  created_by:           string | null
  profiles?:            { nombre: string | null; apellido: string | null } | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TIPOS_ACTIVIDAD: TipoActividad[] = ['Visita', 'Llamada', 'Reunión']

const ETAPAS: { value: EtapaCaptacion; color: string; bg: string }[] = [
  { value: 'Primer Contacto',      color: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-100 dark:bg-slate-700/60' },
  { value: 'Prospecto Calificado', color: 'text-blue-600 dark:text-blue-300',       bg: 'bg-blue-100 dark:bg-blue-900/40' },
  { value: 'Cotización Enviada',   color: 'text-amber-600 dark:text-amber-300',     bg: 'bg-amber-100 dark:bg-amber-900/40' },
  { value: 'En Negociación',       color: 'text-purple-600 dark:text-purple-300',   bg: 'bg-purple-100 dark:bg-purple-900/40' },
  { value: 'Ganado',               color: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  { value: 'Perdido',              color: 'text-red-600 dark:text-red-300',         bg: 'bg-red-100 dark:bg-red-900/40' },
  { value: 'Cliente Activo',       color: 'text-green-600 dark:text-green-300',     bg: 'bg-green-100 dark:bg-green-900/40' },
]

const etapaMap = Object.fromEntries(ETAPAS.map((e) => [e.value, e]))

const TIPO_ICON: Record<TipoActividad, React.ReactNode> = {
  Visita:  <MapPin  size={15} />,
  Llamada: <Phone   size={15} />,
  Reunión: <Users   size={15} />,
}

const TIPO_COLOR: Record<TipoActividad, string> = {
  Visita:  'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-900/40',
  Llamada: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/40',
  Reunión: 'text-purple-600 bg-purple-50 dark:text-purple-300 dark:bg-purple-900/40',
}

const TIPO_DOT: Record<TipoActividad, string> = {
  Visita:  'bg-blue-500',
  Llamada: 'bg-emerald-500',
  Reunión: 'bg-purple-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const formatDateHeader = (dateStr: string) => {
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00'); target.setHours(0, 0, 0, 0)
  const diff   = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diff === 0)  return 'Hoy'
  if (diff === -1) return 'Ayer'
  if (diff === 1)  return 'Mañana'
  return target.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long' })
}

function buildCalendar(year: number, month: number): (number | null)[][] {
  const firstDay    = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow    = (firstDay.getDay() + 6) % 7   // Monday = 0
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

// ─── Initial form ─────────────────────────────────────────────────────────────

const blankForm = (date?: string) => ({
  tipo_actividad:       'Visita' as TipoActividad,
  tipo_cliente:         'Mantenimiento' as TipoCliente,
  cliente_id:           '',
  nombre_prospecto:     '',
  empresa_prospecto:    '',
  fecha_actividad:      date ?? new Date().toISOString().split('T')[0],
  hora_inicio:          '',
  hora_fin:             '',
  etapa_captacion:      '' as EtapaCaptacion | '',
  comentarios:          '',
  resultado:            '',
  proxima_accion:       '',
  fecha_proxima_accion: '',
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VentasPage() {
  const { profile } = useUser()
  const [activities, setActivities]     = useState<SalesActivity[]>([])
  const [clientes, setClientes]         = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [form, setForm]                 = useState(blankForm())
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [filterTipo, setFilterTipo]     = useState<TipoActividad | ''>('')
  const [filterEtapa, setFilterEtapa]   = useState<EtapaCaptacion | ''>('')
  const [filterPeriod, setFilterPeriod] = useState<'hoy' | 'semana' | 'mes' | 'todos'>('mes')
  const [viewMode, setViewMode]         = useState<'list' | 'calendar'>('list')
  const [calYear, setCalYear]           = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth]         = useState(() => new Date().getMonth())
  const [selectedDay, setSelectedDay]   = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    setActivities([])

    let query = supabase
      .from('sales_activities')
      .select('*, clientes(nombre), profiles(nombre, apellido)')
      .is('deleted_at', null)
      .order('fecha_actividad', { ascending: false })
      .order('created_at',      { ascending: false })

    if (viewMode === 'calendar') {
      const y  = calYear
      const m  = String(calMonth + 1).padStart(2, '0')
      const ld = new Date(calYear, calMonth + 1, 0).getDate()
      query = query
        .gte('fecha_actividad', `${y}-${m}-01`)
        .lte('fecha_actividad', `${y}-${m}-${String(ld).padStart(2, '0')}`)
    } else {
      if (filterPeriod === 'hoy') {
        query = query.eq('fecha_actividad', today)
      } else if (filterPeriod === 'semana') {
        const d = new Date(); d.setDate(d.getDate() - 7)
        query = query.gte('fecha_actividad', d.toISOString().split('T')[0])
      } else if (filterPeriod === 'mes') {
        const d = new Date(); d.setDate(d.getDate() - 30)
        query = query.gte('fecha_actividad', d.toISOString().split('T')[0])
      }
      if (filterTipo)  query = query.eq('tipo_actividad', filterTipo)
      if (filterEtapa) query = query.eq('etapa_captacion', filterEtapa)
    }

    const { data, error } = await query
    if (error) toast.error(error.message)
    else setActivities(data || [])
    setLoading(false)
  }, [filterTipo, filterEtapa, filterPeriod, viewMode, calYear, calMonth, today])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  useEffect(() => {
    supabase.from('clientes')
      .select('id, nombre')
      .is('deleted_at', null)
      .order('nombre', { ascending: true })
      .then(({ data }) => setClientes(data || []))
  }, [])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openNew = (date?: string) => {
    setForm(blankForm(date))
    setEditingId(null)
    setShowModal(true)
  }

  const openEdit = (a: SalesActivity) => {
    setForm({
      tipo_actividad:       a.tipo_actividad,
      tipo_cliente:         a.tipo_cliente,
      cliente_id:           a.cliente_id || '',
      nombre_prospecto:     a.nombre_prospecto || '',
      empresa_prospecto:    a.empresa_prospecto || '',
      fecha_actividad:      a.fecha_actividad,
      hora_inicio:          a.hora_inicio || '',
      hora_fin:             a.hora_fin || '',
      etapa_captacion:      a.etapa_captacion || '',
      comentarios:          a.comentarios || '',
      resultado:            a.resultado || '',
      proxima_accion:       a.proxima_accion || '',
      fecha_proxima_accion: a.fecha_proxima_accion || '',
    })
    setEditingId(a.id)
    setShowModal(true)
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.fecha_actividad) { toast.error('La fecha es obligatoria'); return }
    if (form.tipo_cliente === 'Mantenimiento' && !form.cliente_id) {
      toast.error('Selecciona el cliente'); return
    }
    if (form.tipo_cliente === 'Nuevo' && !form.empresa_prospecto && !form.nombre_prospecto) {
      toast.error('Ingresa el nombre o empresa del prospecto'); return
    }
    setSaving(true)
    const payload: Record<string, unknown> = {
      tipo_actividad:       form.tipo_actividad,
      tipo_cliente:         form.tipo_cliente,
      cliente_id:           form.tipo_cliente === 'Mantenimiento' ? (form.cliente_id || null) : null,
      nombre_prospecto:     form.tipo_cliente === 'Nuevo' ? (form.nombre_prospecto || null) : null,
      empresa_prospecto:    form.tipo_cliente === 'Nuevo' ? (form.empresa_prospecto || null) : null,
      fecha_actividad:      form.fecha_actividad,
      hora_inicio:          form.hora_inicio  || null,
      hora_fin:             form.hora_fin     || null,
      etapa_captacion:      form.etapa_captacion || null,
      comentarios:          form.comentarios   || null,
      resultado:            form.resultado     || null,
      proxima_accion:       form.proxima_accion || null,
      fecha_proxima_accion: form.fecha_proxima_accion || null,
      updated_at:           new Date().toISOString(),
    }
    const { error } = editingId
      ? await supabase.from('sales_activities').update(payload).eq('id', editingId)
      : await supabase.from('sales_activities').insert([{ ...payload, created_by: profile?.id }])
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editingId ? 'Actividad actualizada' : 'Actividad registrada')
    setShowModal(false)
    fetchActivities()
  }

  // ── Delete (soft) ──────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('sales_activities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Actividad eliminada')
    fetchActivities()
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const activityName = (a: SalesActivity) =>
    a.tipo_cliente === 'Mantenimiento'
      ? (a.clientes?.nombre || '—')
      : (a.empresa_prospecto || a.nombre_prospecto || '—')

  const filtered     = activities.filter((a) => {
    const name = (a.clientes?.nombre || `${a.nombre_prospecto || ''} ${a.empresa_prospecto || ''}`).toLowerCase()
    return name.includes(search.toLowerCase())
  })
  const grouped      = filtered.reduce<Record<string, SalesActivity[]>>((acc, a) => {
    ;(acc[a.fecha_actividad] ??= []).push(a); return acc
  }, {})
  const sortedDates  = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const calendarDayActivities = selectedDay
    ? activities.filter((a) => a.fecha_actividad === selectedDay)
    : []

  const todayCount       = activities.filter((a) => a.fecha_actividad === today).length
  const activeProspects  = activities.filter((a) =>
    a.tipo_cliente === 'Nuevo' && !['Ganado', 'Perdido'].includes(a.etapa_captacion || '')
  ).length
  const pendingFollowUps = activities.filter((a) =>
    a.fecha_proxima_accion && a.fecha_proxima_accion >= today
  ).length

  const weeks = buildCalendar(calYear, calMonth)

  // ── Activity card renderer ─────────────────────────────────────────────────

  const renderCard = (a: SalesActivity) => {
    const etapa     = a.etapa_captacion ? etapaMap[a.etapa_captacion] : null
    const isOverdue = a.fecha_proxima_accion && a.fecha_proxima_accion < today
    return (
      <div
        key={a.id}
        className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/60 dark:hover:border-slate-600"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TIPO_COLOR[a.tipo_actividad]}`}>
              {TIPO_ICON[a.tipo_actividad]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activityName(a)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  a.tipo_cliente === 'Nuevo'
                    ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {a.tipo_cliente}
                </span>
                {etapa && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${etapa.color} ${etapa.bg}`}>
                    {etapa.value}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                <span>{a.tipo_actividad}</span>
                {(a.hora_inicio || a.hora_fin) && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {a.hora_inicio || '—'}{a.hora_fin && ` → ${a.hora_fin}`}
                  </span>
                )}
                {a.profiles && (
                  <span>{a.profiles.nombre} {a.profiles.apellido}</span>
                )}
              </div>
              {a.comentarios && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  {a.comentarios}
                </p>
              )}
              {a.resultado && (
                <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-500">
                  <span className="font-medium">Resultado:</span> {a.resultado}
                </p>
              )}
              {a.proxima_accion && (
                <div className={`mt-2 flex items-start gap-1.5 rounded-lg border px-3 py-2 text-xs ${
                  isOverdue
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
                }`}>
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-semibold">Próxima acción:</span>{' '}
                    {a.proxima_accion}
                    {a.fecha_proxima_accion && (
                      <span className="ml-1 opacity-70">
                        — {formatDate(a.fecha_proxima_accion)}
                        {isOverdue && ' · Vencida'}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={() => openEdit(a)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200">
              <Pencil size={14} />
            </button>
            <button type="button" onClick={() => handleDelete(a.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-8">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#0b1220]">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingId ? 'Editar Actividad' : 'Nueva Actividad'}
              </h2>
              <button type="button" onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 p-6">

              {/* Tipo + fecha + hora */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Actividad
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Tipo <span className="text-red-400">*</span>
                    </label>
                    <select className={fieldClass} value={form.tipo_actividad}
                      onChange={(e) => setForm((f) => ({ ...f, tipo_actividad: e.target.value as TipoActividad }))}>
                      {TIPOS_ACTIVIDAD.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Fecha <span className="text-red-400">*</span>
                    </label>
                    <input type="date" className={fieldClass} value={form.fecha_actividad}
                      onChange={(e) => setForm((f) => ({ ...f, fecha_actividad: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Desde</label>
                      <input type="time" className={fieldClass} value={form.hora_inicio}
                        onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</label>
                      <input type="time" className={fieldClass} value={form.hora_fin}
                        onChange={(e) => setForm((f) => ({ ...f, hora_fin: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cliente / Prospecto */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Cliente / Prospecto
                </p>
                <div className="mb-3 flex gap-2">
                  {(['Mantenimiento', 'Nuevo'] as TipoCliente[]).map((t) => (
                    <button key={t} type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo_cliente: t, cliente_id: '', nombre_prospecto: '', empresa_prospecto: '' }))}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                        form.tipo_cliente === t
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}>
                      {t === 'Mantenimiento' ? <UserCheck size={14} /> : <UserPlus size={14} />}
                      {t}
                    </button>
                  ))}
                </div>
                {form.tipo_cliente === 'Mantenimiento' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Cuenta <span className="text-red-400">*</span>
                    </label>
                    <ClienteCombobox clientes={clientes} value={form.cliente_id}
                      onChange={(id) => setForm((f) => ({ ...f, cliente_id: id }))}
                      placeholder="Buscar cliente..." className={fieldClass} />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Contacto</label>
                      <input className={fieldClass} placeholder="Nombre del contacto"
                        value={form.nombre_prospecto}
                        onChange={(e) => setForm((f) => ({ ...f, nombre_prospecto: e.target.value }))} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Empresa <span className="text-red-400">*</span>
                      </label>
                      <input className={fieldClass} placeholder="Empresa o razón social"
                        value={form.empresa_prospecto}
                        onChange={(e) => setForm((f) => ({ ...f, empresa_prospecto: e.target.value }))} />
                    </div>
                  </div>
                )}
              </div>

              {/* Etapa */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Estado en el proceso
                </p>
                <div className="flex flex-wrap gap-2">
                  {ETAPAS.map((e) => (
                    <button key={e.value} type="button"
                      onClick={() => setForm((f) => ({ ...f, etapa_captacion: f.etapa_captacion === e.value ? '' : e.value }))}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                        form.etapa_captacion === e.value
                          ? `border-transparent ${e.color} ${e.bg}`
                          : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
                      }`}>
                      {e.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Notas de la actividad
                </p>
                <div className="space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Comentarios</label>
                    <textarea rows={3} className={`${fieldClass} resize-y`}
                      placeholder="¿Qué se trató en la visita o llamada?"
                      value={form.comentarios}
                      onChange={(e) => setForm((f) => ({ ...f, comentarios: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Resultado</label>
                    <textarea rows={2} className={`${fieldClass} resize-y`}
                      placeholder="¿Cuál fue el compromiso o acuerdo alcanzado?"
                      value={form.resultado}
                      onChange={(e) => setForm((f) => ({ ...f, resultado: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Próxima acción */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Próxima Acción
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Acción pendiente</label>
                    <input className={fieldClass} placeholder="Ej: Enviar cotización, Agendar visita..."
                      value={form.proxima_accion}
                      onChange={(e) => setForm((f) => ({ ...f, proxima_accion: e.target.value }))} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha límite</label>
                    <input type="date" className={fieldClass} value={form.fecha_proxima_accion}
                      onChange={(e) => setForm((f) => ({ ...f, fecha_proxima_accion: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
              <button type="button" onClick={() => setShowModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Actividades de Ventas
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Registro de visitas, llamadas y reuniones con clientes y prospectos.
          </p>
        </div>
        <button type="button" onClick={() => openNew()}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
          <Plus size={16} />
          Nueva Actividad
        </button>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Actividades hoy',       value: todayCount,       icon: CalendarClock,
            color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/40' },
          { label: 'Prospectos activos',     value: activeProspects,  icon: Target,
            color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900/40' },
          { label: 'Seguimientos pendientes', value: pendingFollowUps, icon: AlertCircle,
            color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`flex items-center gap-4 rounded-2xl border p-4 ${bg}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-slate-900 ${color}`}>
              <Icon size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── View toggle ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50 w-fit">
        {([
          { mode: 'list'     as const, label: 'Lista',      icon: LayoutList },
          { mode: 'calendar' as const, label: 'Calendario', icon: Calendar   },
        ]).map(({ mode, label, icon: Icon }) => (
          <button key={mode} type="button"
            onClick={() => { setViewMode(mode); setSelectedDay(null) }}
            className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              viewMode === mode
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* LIST VIEW                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input className={`${fieldClass} pl-9`} placeholder="Buscar cliente o empresa..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className={fieldClass} value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value as typeof filterPeriod)}>
              <option value="hoy">Hoy</option>
              <option value="semana">Últimos 7 días</option>
              <option value="mes">Últimos 30 días</option>
              <option value="todos">Todos</option>
            </select>
            <select className={fieldClass} value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value as TipoActividad | '')}>
              <option value="">Todos los tipos</option>
              {TIPOS_ACTIVIDAD.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className={fieldClass} value={filterEtapa}
              onChange={(e) => setFilterEtapa(e.target.value as EtapaCaptacion | '')}>
              <option value="">Todas las etapas</option>
              {ETAPAS.map((e) => <option key={e.value}>{e.value}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
              <CalendarClock size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="font-medium text-slate-500 dark:text-slate-400">Sin actividades registradas</p>
              <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                Crea tu primera actividad con el botón de arriba.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {sortedDates.map((date) => (
                <div key={date}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-sm font-bold capitalize text-slate-900 dark:text-white">
                      {formatDateHeader(date)}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(date)}</span>
                    <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      {grouped[date].length} {grouped[date].length === 1 ? 'actividad' : 'actividades'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {grouped[date].map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CALENDAR VIEW                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'calendar' && (
        <div className="space-y-5">

          {/* Calendar card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">

            {/* Month navigation */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <button type="button"
                onClick={() => {
                  setSelectedDay(null)
                  if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11) }
                  else setCalMonth((m) => m - 1)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                <ChevronLeft size={16} />
              </button>
              <h2 className="font-bold capitalize text-slate-900 dark:text-white">
                {new Date(calYear, calMonth, 1).toLocaleDateString('es-HN', { month: 'long', year: 'numeric' })}
              </h2>
              <button type="button"
                onClick={() => {
                  setSelectedDay(null)
                  if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0) }
                  else setCalMonth((m) => m + 1)
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map((d) => (
                <div key={d} className="py-2.5 text-center text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div>
              {weeks.map((week, wi) => (
                <div
                  key={wi}
                  className={`grid grid-cols-7 ${wi < weeks.length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}
                >
                  {week.map((day, di) => {
                    const borderR = di < 6 ? 'border-r border-slate-100 dark:border-slate-800' : ''

                    if (!day) {
                      return (
                        <div key={`e-${wi}-${di}`}
                          className={`min-h-[76px] ${borderR} bg-slate-50/60 dark:bg-slate-800/20`} />
                      )
                    }

                    const dateStr    = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const dayActs    = activities.filter((a) => a.fecha_actividad === dateStr)
                    const isToday    = dateStr === today
                    const isSel      = selectedDay === dateStr
                    const hasOverdue = dayActs.some((a) => a.fecha_proxima_accion && a.fecha_proxima_accion < today)
                    const tipoSet    = [...new Set(dayActs.map((a) => a.tipo_actividad))] as TipoActividad[]

                    return (
                      <button key={dateStr} type="button"
                        onClick={() => setSelectedDay(isSel ? null : dateStr)}
                        className={`relative flex min-h-[76px] flex-col gap-1.5 p-2 text-left transition ${borderR}
                          ${isSel
                            ? 'bg-slate-900 dark:bg-white'
                            : isToday
                            ? 'bg-blue-50 dark:bg-blue-950/30'
                            : 'bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-slate-800/40'
                          }
                        `}
                      >
                        {/* Day number */}
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold
                          ${isSel
                            ? 'bg-white text-slate-900 dark:bg-slate-900 dark:text-white'
                            : isToday
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-700 dark:text-slate-300'
                          }
                        `}>
                          {day}
                        </span>

                        {/* Tipo dots */}
                        {dayActs.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 px-0.5">
                            {tipoSet.map((t) => {
                              const tc = dayActs.filter((a) => a.tipo_actividad === t).length
                              return (
                                <span key={t} className="flex items-center gap-0.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${TIPO_DOT[t]} ${isSel ? 'opacity-50' : ''}`} />
                                  {tc > 1 && (
                                    <span className={`text-[9px] font-bold leading-none ${isSel ? 'text-white/50 dark:text-slate-900/50' : 'text-slate-400 dark:text-slate-500'}`}>
                                      {tc}
                                    </span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        )}

                        {/* Overdue dot */}
                        {hasOverdue && (
                          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-400" />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            {[
              { label: 'Visita',              dot: 'bg-blue-500' },
              { label: 'Llamada',             dot: 'bg-emerald-500' },
              { label: 'Reunión',             dot: 'bg-purple-500' },
              { label: 'Seguimiento vencido', dot: 'bg-red-400' },
            ].map(({ label, dot }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
              </span>
            ))}
          </div>

          {/* Day detail panel */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : selectedDay ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold capitalize text-slate-900 dark:text-white">
                    {formatDateHeader(selectedDay)}
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(selectedDay)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {calendarDayActivities.length}{' '}
                    {calendarDayActivities.length === 1 ? 'actividad' : 'actividades'}
                  </span>
                  <button type="button" onClick={() => openNew(selectedDay)}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Plus size={12} /> Agregar
                  </button>
                </div>
              </div>

              {calendarDayActivities.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-700">
                  <p className="text-sm text-slate-400 dark:text-slate-500">Sin actividades para este día.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {calendarDayActivities.map(renderCard)}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center dark:border-slate-700">
              <Calendar size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Selecciona un día para ver sus actividades.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
