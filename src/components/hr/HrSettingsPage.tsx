'use client'
import { useCallback, useMemo, useState } from 'react'
import { CalendarCog, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate } from '@/src/lib/format'
import { cardClass, fieldClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { canManageHr, suggestedHolidays, type HrHoliday } from '@/src/lib/hr'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { HrNavigation, useScopedLoad } from './HrShared'

const weekday = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('es-HN', { weekday: 'long' })

export function HrSettingsPage() {
  const { user, profile, loading: userLoading } = useUser()
  const manager = canManageHr(profile), tenant = profile?.tenant_id || ''
  const context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const loader = useCallback(async () => {
    const [settings, holidays] = await Promise.all([
      supabase.from('hr_settings').select('max_advance_days').eq('tenant_id', tenant).maybeSingle<{ max_advance_days: number }>(),
      readAllReportRows<HrHoliday>((a, b) => supabase.from('hr_holidays').select('id,holiday_date,name').eq('tenant_id', tenant).order('holiday_date').order('id').range(a, b), { label: 'feriados' }),
    ])
    if (settings.error) throw new Error('No se pudo cargar la configuración de RRHH. Reintenta la consulta.')
    return { maxAdvance: settings.data?.max_advance_days ?? 0, holidays }
  }, [tenant])
  const { data, error, loading, reload } = useScopedLoad(context, manager && !!tenant, loader)

  if (userLoading) return null
  if (!manager) return <div className={cardClass}>Solo Administración puede configurar Recursos Humanos.</div>

  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Calendario y reglas" icon={CalendarCog}
      description="Feriados que no consumen vacaciones ni permisos, y tope de anticipo de vacaciones de la empresa." />
    <HrNavigation manager />
    {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
    {loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando…</p> : data && <>
      <AdvanceSettings key={data.maxAdvance} current={data.maxAdvance} onSaved={() => void reload()} />
      <HolidayCalendar holidays={data.holidays} onChanged={() => void reload()} />
    </>}
  </div>
}

function AdvanceSettings({ current, onSaved }: { current: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(current)), [busy, setBusy] = useState(false)
  const days = Number(value), valid = value !== '' && Number.isInteger(days) && days >= 0 && days <= 30
  async function save() {
    if (!valid || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('hr_save_settings', { p_max_advance_days: days })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Tope de anticipo actualizado')
    onSaved()
  }
  return <section className={cardClass}>
    <FormSection title="Anticipo de vacaciones" description="Política interna (el Código del Trabajo no lo regula). Días del próximo período que se pueden tomar antes de ganarlo; siempre requiere aprobación de Administración. 0 desactiva los anticipos. Un cambio aplica a solicitudes nuevas.">
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Anticipo máximo (días laborables)" required hint="Entre 0 y 30.">
          <input inputMode="numeric" className={fieldClass} disabled={busy} value={value} onChange={event => setValue(event.target.value.replace(/\D/g, '').slice(0, 2))} /></FormField>
        <div><button type="button" className={primaryButtonClass} disabled={busy || !valid || days === current} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
      </div>
    </FormSection>
  </section>
}

function HolidayCalendar({ holidays, onChanged }: { holidays: HrHoliday[]; onChanged: () => void }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(String(thisYear))
  const [form, setForm] = useState({ date: '', name: '' }), [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<HrHoliday | null>(null)
  const yearHolidays = useMemo(() => holidays.filter(holiday => holiday.holiday_date.startsWith(`${year}-`)), [holidays, year])
  const saved = new Set(holidays.map(holiday => holiday.holiday_date))
  const suggestions = suggestedHolidays(Number(year)).filter(item => !saved.has(item.date))

  async function add(items: { date: string; name: string }[]) {
    if (!items.length || busy) return
    setBusy(true)
    for (const item of items) {
      const { error } = await supabase.rpc('hr_save_holiday', { p_date: item.date, p_name: item.name })
      if (error) { setBusy(false); toast.error(error.message); onChanged(); return }
    }
    setBusy(false)
    toast.success(items.length === 1 ? 'Feriado guardado' : `${items.length} feriados guardados`)
    setForm({ date: '', name: '' })
    onChanged()
  }
  async function remove(holiday: HrHoliday) {
    setRemoving(null)
    const { error } = await supabase.rpc('hr_delete_holiday', { p_date: holiday.holiday_date })
    if (error) { toast.error(error.message); return }
    toast.success('Feriado eliminado')
    onChanged()
  }
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map(value => ({ value: String(value), label: String(value) }))

  return <section className={cardClass}>
    <FormSection title="Calendario laboral" description="Los feriados no se cuentan en vacaciones ni permisos. Cambiar el calendario no recalcula solicitudes ya registradas."
      actions={<div className="w-32"><CompactSelect aria-label="Año" value={year} onValueChange={setYear} options={years} /></div>}>
      <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Fecha" required><input type="date" className={fieldClassSm} disabled={busy} value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></FormField>
        <FormField label="Nombre" required className="lg:col-span-2"><input className={fieldClassSm} disabled={busy} maxLength={120} value={form.name} placeholder="Semana Morazánica" onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></FormField>
        <div><button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} disabled={busy || !form.date || !form.name.trim()}
          onClick={() => void add([{ date: form.date, name: form.name.trim() }])}><Plus size={16} aria-hidden="true" />Agregar</button></div>
      </div>
      <div className="mt-6">
        {!yearHolidays.length ? <EmptyState title={`Sin feriados en ${year}`} description="Agrega feriados o revisa las sugerencias del Código del Trabajo." />
          : <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{yearHolidays.map(holiday => <li key={holiday.id} className="flex items-center justify-between gap-3 py-2">
            <span><strong className="tabular-nums">{formatDate(holiday.holiday_date)}</strong> <span className="text-slate-500">({weekday(holiday.holiday_date)})</span> · {holiday.name}</span>
            <button type="button" aria-label={`Eliminar ${holiday.name}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40" disabled={busy} onClick={() => setRemoving(holiday)}><Trash2 size={16} aria-hidden="true" /></button>
          </li>)}</ul>}
      </div>
      {suggestions.length > 0 && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-sm font-semibold text-slate-900 dark:text-white">Sugerencias del Art. 339 para {year}</p>
            <p className="mt-1 max-w-2xl text-xs text-slate-600 dark:text-slate-300">Basadas en el texto original del Código. Reformas posteriores pueden trasladar fechas (por ejemplo, los feriados de octubre a la Semana Morazánica). Revísalas antes de agregarlas.</p></div>
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void add(suggestions)}>Agregar todas</button>
        </div>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{suggestions.map(item => <li key={item.date} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 dark:bg-slate-900">
          <span><strong className="tabular-nums">{formatDate(item.date)}</strong> · {item.name}</span>
          <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" disabled={busy} onClick={() => void add([item])}>Agregar</button>
        </li>)}</ul>
      </div>}
    </FormSection>
    <ConfirmDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null) }} title="Eliminar feriado"
      description={removing ? `${formatDate(removing.holiday_date)} · ${removing.name}. Las solicitudes ya registradas conservan sus días.` : ''}
      confirmLabel="Eliminar" cancelLabel="Volver" danger onConfirm={() => { if (removing) void remove(removing) }} />
  </section>
}
