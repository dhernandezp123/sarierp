'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { formatDate, toDateInputValue } from '@/src/lib/format'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { HR_LEAVE_TYPES, leaveStatusTone, validateLeaveDates, type HrLeavePreview, type HrLeaveRequest, type HrLeaveStatus, type HrLeaveType, type HrVacationPeriod } from '@/src/lib/hr'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'

export function HrNavigation({ manager }: { manager: boolean }) {
  const pathname = usePathname()
  const items = [
    ...(manager ? [{ href: '/rrhh', label: 'Empleados' }, { href: '/rrhh/solicitudes', label: 'Vacaciones y permisos' }, { href: '/rrhh/configuracion', label: 'Calendario y reglas' }] : []),
    { href: '/rrhh/mi-ficha', label: 'Mi ficha' },
  ]
  return <nav aria-label="Recursos Humanos" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
    {items.map(item => {
      const active = pathname === item.href
      return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
        className={'rounded-xl px-3 py-2 text-sm font-medium ' + (active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>{item.label}</Link>
    })}
  </nav>
}

export function LeaveStatusBadge({ status }: { status: HrLeaveStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${leaveStatusTone[status]}`}>{status}</span>
}

export function formatLeaveRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`
}

/**
 * Carga ligada a la identidad actual: una respuesta tardía no se aplica
 * después de cerrar sesión o cambiar de usuario/empresa.
 */
export function useScopedLoad<T>(context: string, enabled: boolean, loader: () => Promise<T>) {
  const owner = useRef(''), generation = useRef(0)
  const [state, setState] = useState<{ context: string; data: T | null; error: string } | null>(null)
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  const reload = useCallback(async () => {
    if (!enabled) return
    const run = ++generation.current
    try {
      const data = await loader()
      if (owner.current === context && generation.current === run) setState({ context, data, error: '' })
    } catch (error) {
      if (owner.current === context && generation.current === run) setState({ context, data: null, error: (error as Error).message })
    }
  }, [context, enabled, loader])
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer) }, [reload])
  const current = state?.context === context ? state : null
  return { data: current?.data ?? null, error: current?.error ?? '', loading: enabled && !current, reload }
}

/**
 * Devuelve el foco al control que abrió el diálogo. Los diálogos de RRHH se montan desde estado
 * (sin DialogTrigger), así que Radix no tiene a dónde volver y el foco caería en <body>.
 * Se captura el elemento activo al montar, antes de que Radix mueva el foco al diálogo.
 */
export function useReturnFocus() {
  const [origin] = useState(() => (typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null))
  return useCallback((event: Event) => {
    if (!origin || origin === document.body) return
    event.preventDefault()
    setTimeout(() => { if (origin.isConnected) origin.focus() }, 0)
  }, [origin])
}

/** Marcas legales de una solicitud: fracción (Art. 346/351), anticipo y suspensión (Art. 351). */
export function LeaveFlags({ request }: { request: Pick<HrLeaveRequest, 'is_fractioned' | 'is_advance' | 'suspended_at' | 'original_end_date'> }) {
  const flags = [
    request.is_fractioned && { label: 'Fraccionada', title: 'Excepción a días consecutivos (Art. 346/351)', tone: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
    request.is_advance && { label: 'Anticipo', title: 'Incluye días del período aún no ganado', tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
    request.suspended_at && { label: 'Suspendida', title: request.original_end_date ? `Fin original ${formatDate(request.original_end_date)}` : 'Suspendida (Art. 351)', tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
  ].filter(Boolean) as { label: string; title: string; tone: string }[]
  if (!flags.length) return null
  return <span className="mt-1 flex flex-wrap gap-1">{flags.map(flag => <span key={flag.label} title={flag.title} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${flag.tone}`}>{flag.label}</span>)}</span>
}

/** Tabla de períodos por aniversario; la misma para Admin y autoservicio. */
export function VacationPeriodsTable({ periods }: { periods: HrVacationPeriod[] }) {
  if (!periods.length) return <p className="text-sm text-slate-500">Sin períodos.</p>
  return <div className="overflow-x-auto"><table className="w-full text-sm">
    <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
      <th className="py-2 pr-3">Período</th><th className="py-2 pr-3">Vigencia</th><th className="py-2 pr-3 text-right">Derecho</th><th className="py-2 pr-3 text-right">Ajustes</th>
      <th className="py-2 pr-3 text-right">Gozados</th><th className="py-2 pr-3 text-right">Pendientes</th><th className="py-2 pr-3 text-right">Disponible</th><th className="py-2">Estado</th></tr></thead>
    <tbody>{periods.map(period => <tr key={period.period_number} className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-2 pr-3 font-medium">{period.period_number}</td>
      <td className="py-2 pr-3 whitespace-nowrap">{formatLeaveRange(period.earned_on, period.ends_on)}</td>
      <td className="py-2 pr-3 text-right">{period.is_earned ? period.entitlement : '—'}</td>
      <td className="py-2 pr-3 text-right">{period.adjustments || '—'}</td>
      <td className="py-2 pr-3 text-right">{period.approved}</td>
      <td className="py-2 pr-3 text-right">{period.pending}</td>
      <td className={`py-2 pr-3 text-right font-semibold ${period.available < 0 ? 'text-violet-700 dark:text-violet-300' : ''}`}>{period.available}</td>
      <td className="py-2 text-xs">{!period.is_earned ? <span className="text-slate-500">{period.available < 0 ? `Anticipo de ${-period.available} día(s); ` : ''}se gana el {formatDate(period.earned_on)}</span>
        : <span className="flex flex-wrap gap-1">
          {period.expired_unused && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" title="Art. 350: período vencido con saldo sin acumulación autorizada">Vencido con saldo</span>}
          {period.overdue_unscheduled && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" title="Art. 348: programar dentro de los 3 meses siguientes">Sin programar</span>}
          {period.accumulated && <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">Acumulación autorizada</span>}
          {!period.expired_unused && !period.overdue_unscheduled && !period.accumulated && <span className="text-slate-500">{period.available === 0 ? 'Gozado' : 'Vigente'}</span>}
        </span>}</td>
    </tr>)}</tbody>
  </table></div>
}

/** Vista previa del servidor con espera corta; descarta respuestas de fechas anteriores. */
function useLeavePreview(employeeId: string, leaveType: string, start: string, end: string) {
  const key = `${employeeId}|${leaveType}|${start}|${end}`
  const [state, setState] = useState<{ key: string; preview: HrLeavePreview | null; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const formProblem = validateLeaveDates(start, end)
  useEffect(() => {
    if (formProblem) return
    let alive = true
    const timer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('hr_preview_leave', { p_employee_id: employeeId, p_leave_type: leaveType, p_start: start, p_end: end })
      if (alive) setState({ key, preview: error ? null : data as HrLeavePreview, error: error ? 'No se pudo calcular la solicitud. Reintenta.' : '' })
    }, 300)
    return () => { alive = false; clearTimeout(timer) }
  }, [key, employeeId, leaveType, start, end, formProblem, attempt])
  const current = state?.key === key ? state : null
  const retry = () => { setState(null); setAttempt(value => value + 1) }
  return { preview: current?.preview ?? null, error: formProblem || current?.error || current?.preview?.error || '', loading: !formProblem && !current,
    canRetry: !!current?.error, retry }
}

export function LeaveRequestDialog({ employeeId, employeeName, onClose, onSaved }: {
  employeeId: string; employeeName: string; onClose: () => void; onSaved: () => void
}) {
  const today = toDateInputValue()
  const [form, setForm] = useState({ leave_type: 'Vacaciones' as HrLeaveType, start_date: today, end_date: today, reason: '' })
  const [busy, setBusy] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const returnFocus = useReturnFocus()
  const { preview, error: problem, loading, canRetry, retry } = useLeavePreview(employeeId, form.leave_type, form.start_date, form.end_date)
  const update = (patch: Partial<typeof form>) => { requestId.current = crypto.randomUUID(); setForm(current => ({ ...current, ...patch })) }
  async function submit() {
    if (problem || loading || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('hr_request_leave', { p_request_id: requestId.current, p_employee_id: employeeId,
      p_leave_type: form.leave_type, p_start: form.start_date, p_end: form.end_date, p_reason: form.reason.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Solicitud enviada')
    onSaved()
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="grid-cols-1 sm:max-w-lg" onCloseAutoFocus={returnFocus}>
      <DialogTitle>Nueva solicitud</DialogTitle>
      <DialogDescription>{employeeName}. Se cuentan los días laborables de su jornada; los feriados del calendario no se descuentan.</DialogDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tipo" required as="div" className="sm:col-span-2">
          <CompactSelect aria-label="Tipo" value={form.leave_type} disabled={busy} onValueChange={value => update({ leave_type: value as HrLeaveType })}
            options={HR_LEAVE_TYPES.map(type => ({ value: type, label: type }))} />
        </FormField>
        <FormField label="Desde" required><input type="date" className={fieldClass} disabled={busy} value={form.start_date}
          onChange={event => update({ start_date: event.target.value, end_date: form.end_date < event.target.value ? event.target.value : form.end_date })} /></FormField>
        <FormField label="Hasta" required><input type="date" className={fieldClass} disabled={busy} min={form.start_date} value={form.end_date}
          onChange={event => update({ end_date: event.target.value })} /></FormField>
        <FormField label="Motivo" className="sm:col-span-2"><textarea className={`${fieldClass} h-24 py-3`} maxLength={1000} disabled={busy}
          value={form.reason} onChange={event => update({ reason: event.target.value })} /></FormField>
      </div>
      <div aria-live="polite" className="space-y-2 text-sm">
        {loading ? <p className="text-slate-500">Calculando…</p> : preview && !preview.error && <>
          <p className="text-slate-600 dark:text-slate-300">Días laborables: <strong>{preview.days}</strong>
            {preview.allocations?.length ? <> · {preview.allocations.map(item => `${item.days} del período ${item.period}${item.advance ? ' (anticipo)' : ''}`).join(', ')}</> : null}</p>
          {preview.fractioned && <p className="rounded-xl bg-sky-50 px-3 py-2 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">Vacaciones fraccionadas: el Código del Trabajo prevé días consecutivos (Art. 346 y 351). Quedará registrado como excepción.</p>}
          {preview.advance && <p className="rounded-xl bg-violet-50 px-3 py-2 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">Incluye anticipo de un período aún no ganado; se descontará cuando se acredite.</p>}
        </>}
        {problem && <p role="alert" className="text-rose-600 dark:text-rose-300">{problem}
          {canRetry && <button type="button" className="ml-2 underline" onClick={retry}>Reintentar cálculo</button>}
        </p>}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className={primaryButtonClass} disabled={busy || loading || !!problem} onClick={() => void submit()}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
      </div>
    </DialogContent>
  </Dialog>
}
