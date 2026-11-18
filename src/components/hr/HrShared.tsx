'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { formatDate, toDateInputValue } from '@/src/lib/format'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { HR_LEAVE_TYPES, hrBusinessDays, leaveStatusTone, validateLeaveRequest, type HrLeaveStatus, type HrLeaveType } from '@/src/lib/hr'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'

export function HrNavigation({ manager }: { manager: boolean }) {
  const pathname = usePathname()
  const items = [
    ...(manager ? [{ href: '/rrhh', label: 'Empleados' }, { href: '/rrhh/solicitudes', label: 'Vacaciones y permisos' }] : []),
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

export function LeaveRequestDialog({ employeeId, employeeName, availableFor, onClose, onSaved }: {
  /** El saldo depende del año de la fecha de inicio elegida, no del año en curso. */
  employeeId: string; employeeName: string; availableFor: (year: number) => number; onClose: () => void; onSaved: () => void
}) {
  const today = toDateInputValue()
  const [form, setForm] = useState({ leave_type: 'Vacaciones' as HrLeaveType, start_date: today, end_date: today, reason: '' })
  const [busy, setBusy] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const days = hrBusinessDays(form.start_date, form.end_date)
  const year = Number(form.start_date.slice(0, 4)), available = Number.isInteger(year) && year > 0 ? availableFor(year) : 0
  const problem = validateLeaveRequest(form, available)
  const update = (patch: Partial<typeof form>) => { requestId.current = crypto.randomUUID(); setForm(current => ({ ...current, ...patch })) }
  async function submit() {
    if (problem || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('hr_request_leave', { p_request_id: requestId.current, p_employee_id: employeeId,
      p_leave_type: form.leave_type, p_start: form.start_date, p_end: form.end_date, p_reason: form.reason.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Solicitud enviada')
    onSaved()
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="sm:max-w-lg">
      <DialogTitle>Nueva solicitud</DialogTitle>
      <DialogDescription>{employeeName}. Se cuentan días hábiles de lunes a viernes; los feriados no se descuentan automáticamente.</DialogDescription>
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
      <p className="text-sm text-slate-600 dark:text-slate-300">Días hábiles: <strong>{days}</strong>{form.leave_type === 'Vacaciones' && <> · Disponibles en {year}: <strong>{available}</strong></>}</p>
      {problem && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className={primaryButtonClass} disabled={busy || !!problem} onClick={() => void submit()}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
      </div>
    </DialogContent>
  </Dialog>
}
