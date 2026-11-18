'use client'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { formatDate, formatDateTime } from '@/src/lib/format'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { HR_ADJUSTMENT_KINDS, employeeFullName, vacationTotals, workScheduleLabel, type HrAccumulation, type HrAdjustmentKind, type HrEmployee, type HrLedgerEntry, type HrVacationPeriod } from '@/src/lib/hr'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { VacationPeriodsTable, useScopedLoad } from './HrShared'

type Detail = { periods: HrVacationPeriod[]; ledger: HrLedgerEntry[]; accumulation: HrAccumulation | null }

/** Vacaciones de un empleado para Admin: períodos, saldos históricos, ajustes y acumulación (Art. 350). */
export function VacationDetailDialog({ employee, onClose, onChanged }: { employee: HrEmployee; onClose: () => void; onChanged: () => void }) {
  const { user, profile } = useUser()
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${employee.id}`
  const loader = useCallback(async (): Promise<Detail> => {
    const [periods, ledger, accumulation] = await Promise.all([
      supabase.rpc('hr_vacation_periods', { p_employee_id: employee.id }),
      supabase.from('hr_vacation_ledger').select('id,period_number,kind,days,reason,created_at').eq('employee_id', employee.id).order('created_at', { ascending: false }).order('id'),
      supabase.from('hr_vacation_accumulations').select('*').eq('employee_id', employee.id).maybeSingle<HrAccumulation>(),
    ])
    if (periods.error || ledger.error || accumulation.error) throw new Error('No se pudieron cargar las vacaciones del empleado. Reintenta.')
    return { periods: periods.data as HrVacationPeriod[], ledger: ledger.data as HrLedgerEntry[], accumulation: accumulation.data }
  }, [employee.id])
  const { data, error, loading, reload } = useScopedLoad(context, true, loader)
  const refresh = () => { void reload(); onChanged() }
  const totals = data ? vacationTotals(data.periods) : null
  const earned = data?.periods.filter(period => period.is_earned) ?? []

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
      <DialogTitle>Vacaciones · {employeeFullName(employee)}</DialogTitle>
      <DialogDescription>Ingreso {formatDate(employee.hire_date)} · {workScheduleLabel(employee.work_schedule)}. Los períodos se ganan en cada aniversario (Art. 346).</DialogDescription>
      {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando…</p> : data && totals && <div className="space-y-8">
        <p className="text-sm text-slate-600 dark:text-slate-300">Disponible: <strong>{totals.available} día(s)</strong>
          {totals.advance > 0 && <> · anticipo usado {totals.advance}</>}
          {totals.nextEarnedOn && <> · próximo período el {formatDate(totals.nextEarnedOn)}</>}</p>
        <VacationPeriodsTable periods={data.periods} />
        <AdjustmentForm employeeId={employee.id} periods={data.periods} onSaved={refresh} />
        <AccumulationSection employeeId={employee.id} earned={earned} accumulation={data.accumulation} onSaved={refresh} />
        <FormSection title="Movimientos" description="Inmutables: una corrección se registra como otro movimiento.">
          {!data.ledger.length ? <p className="text-sm text-slate-500">Sin ajustes registrados.</p>
            : <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{data.ledger.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span><strong>{entry.kind}</strong> · período {entry.period_number} · {entry.reason}</span>
              <span className="tabular-nums"><strong>{entry.days > 0 ? `+${entry.days}` : entry.days}</strong> · {formatDateTime(entry.created_at)}</span>
            </li>)}</ul>}
        </FormSection>
      </div>}
    </DialogContent>
  </Dialog>
}

function AdjustmentForm({ employeeId, periods, onSaved }: { employeeId: string; periods: HrVacationPeriod[]; onSaved: () => void }) {
  const [form, setForm] = useState({ kind: 'Apertura' as HrAdjustmentKind, period: '', days: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const update = (patch: Partial<typeof form>) => { requestId.current = crypto.randomUUID(); setForm(current => ({ ...current, ...patch })) }
  const options = periods.filter(period => form.kind === 'Corrección' || period.is_earned)
    .map(period => ({ value: String(period.period_number), label: `Período ${period.period_number}`, description: `${formatDate(period.earned_on)}${period.is_earned ? '' : ' · aún no ganado'}` }))
  const days = Number(form.days)
  // Apertura: días tomados antes del ERP (se guardan en negativo).
  const signed = form.kind === 'Apertura' ? -Math.abs(days) : days
  const problem = !form.period ? 'Selecciona el período' : !form.days || !Number.isInteger(days) || days === 0 || Math.abs(days) > 60 ? 'Días entre 1 y 60' : !form.reason.trim() ? 'Indica el motivo' : ''
  async function save() {
    if (problem || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('hr_add_vacation_adjustment', { p_request_id: requestId.current, p_employee_id: employeeId,
      p_period: Number(form.period), p_kind: form.kind, p_days: signed, p_reason: form.reason.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Ajuste registrado')
    requestId.current = crypto.randomUUID()
    setForm({ kind: form.kind, period: '', days: '', reason: '' })
    onSaved()
  }
  return <FormSection title="Saldo histórico y ajustes" description="Apertura: días ya tomados antes del ERP en un período (una por período). Corrección: suma o resta días con motivo.">
    <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <FormField label="Tipo" required as="div"><CompactSelect aria-label="Tipo de ajuste" value={form.kind} disabled={busy} onValueChange={value => update({ kind: value as HrAdjustmentKind, period: '' })}
        options={HR_ADJUSTMENT_KINDS.map(value => ({ value, label: value === 'Apertura' ? 'Apertura (días ya tomados)' : 'Corrección' }))} /></FormField>
      <FormField label="Período" required as="div"><CompactSelect aria-label="Período" value={form.period} disabled={busy} placeholder="Seleccionar" onValueChange={value => update({ period: value })} options={options} /></FormField>
      <FormField label={form.kind === 'Apertura' ? 'Días ya tomados' : 'Días (+ suma, − resta)'} required>
        <input inputMode="numeric" className={fieldClass} disabled={busy} value={form.days} placeholder={form.kind === 'Apertura' ? '5' : '-2'}
          onChange={event => update({ days: event.target.value.replace(form.kind === 'Apertura' ? /\D/g : /(?!^-)[^\d]/g, '').slice(0, 3) })} /></FormField>
      <FormField label="Motivo" required className="lg:col-span-1"><input className={fieldClass} disabled={busy} maxLength={1000} value={form.reason} onChange={event => update({ reason: event.target.value })} /></FormField>
    </div>
    <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
      {problem && form.days && <span className="text-sm text-slate-500">{problem}</span>}
      <button type="button" className={primaryButtonClass} disabled={busy || !!problem} onClick={() => void save()}>{busy ? 'Guardando…' : 'Registrar ajuste'}</button>
    </div>
  </FormSection>
}

function AccumulationSection({ employeeId, earned, accumulation, onSaved }: { employeeId: string; earned: HrVacationPeriod[]; accumulation: HrAccumulation | null; onSaved: () => void }) {
  const [from, setFrom] = useState(''), [count, setCount] = useState('1'), [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false)
  const to = from ? Number(from) + Number(count) - 1 : 0
  const valid = !!from && to <= (earned.at(-1)?.period_number ?? 0) && !!reason.trim()
  async function authorize() {
    setConfirming(false); setBusy(true)
    const { error } = await supabase.rpc('hr_authorize_accumulation', { p_employee_id: employeeId, p_from_period: Number(from), p_to_period: to, p_reason: reason.trim() })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Acumulación autorizada')
    onSaved()
  }
  return <FormSection title="Acumulación (Art. 350)" description="Por ley no se acumulan vacaciones. Excepción única: hasta 2 períodos para labores técnicas, de dirección o de confianza de difícil reemplazo. Requiere constancia firmada (Art. 355).">
    {accumulation ? <p className="text-sm text-slate-700 dark:text-slate-200">Autorizada para {accumulation.from_period === accumulation.to_period ? `el período ${accumulation.from_period}` : `los períodos ${accumulation.from_period} y ${accumulation.to_period}`} el {formatDateTime(accumulation.created_at)}: {accumulation.reason}</p>
      : !earned.length ? <p className="text-sm text-slate-500">Disponible cuando el empleado tenga períodos ganados.</p>
        : <><div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Desde el período" required as="div"><CompactSelect aria-label="Desde el período" value={from} disabled={busy} placeholder="Seleccionar" onValueChange={setFrom}
            options={earned.map(period => ({ value: String(period.period_number), label: `Período ${period.period_number}` }))} /></FormField>
          <FormField label="Períodos" required as="div"><CompactSelect aria-label="Períodos" value={count} disabled={busy} onValueChange={setCount}
            options={[{ value: '1', label: '1 período' }, { value: '2', label: '2 períodos' }]} /></FormField>
          <FormField label="Justificación" required className="sm:col-span-2"><input className={fieldClass} disabled={busy} maxLength={1000} value={reason} placeholder="Puesto de dirección de difícil reemplazo" onChange={event => setReason(event.target.value)} /></FormField>
        </div>
          <div className="mt-4 flex justify-end">
            <button type="button" className={secondaryButtonClass} disabled={busy || !valid} onClick={() => setConfirming(true)}>Autorizar acumulación</button>
          </div></>}
    <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Autorizar acumulación"
      description={`Es la única acumulación permitida para este empleado (Art. 350) y no se puede revertir desde el ERP. Cubre ${count === '2' ? `los períodos ${from} y ${to}` : `el período ${from}`}.`}
      confirmLabel="Autorizar" cancelLabel="Volver" onConfirm={() => void authorize()} />
  </FormSection>
}
