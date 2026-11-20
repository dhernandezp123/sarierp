'use client'
import { useCallback, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, toDateInputValue } from '@/src/lib/format'
import { cardClass, fieldClassSm } from '@/src/lib/ui-classes'
import { canManageHr, canUseHrSelfService, employeeFullName, type HrEmployee } from '@/src/lib/hr'
import { hrMonthRange, type HrAbsence } from '@/src/lib/hr-report'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { HrNavigation, useScopedLoad } from './HrShared'

export function HrCalendarPage() {
  const { user, profile, loading: userLoading } = useUser()
  const manager = canManageHr(profile), allowed = canUseHrSelfService(profile), tenant = profile?.tenant_id || ''
  const [month, setMonth] = useState(toDateInputValue().slice(0, 7)), [employee, setEmployee] = useState('')
  const range = useMemo(() => { try { return hrMonthRange(month) } catch { return null } }, [month])
  const start = range?.start ?? '', end = range?.end ?? ''
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${start}:${employee}`
  const loader = useCallback(async () => {
    const [absences, employees] = await Promise.all([
      readAllReportRows<HrAbsence>((a, b) => supabase.rpc('hr_absence_calendar', { p_start: start, p_end: end, p_employee_id: employee || null }).range(a, b), { label: 'ausencias aprobadas', key: 'request_id' }),
      manager ? readAllReportRows<Pick<HrEmployee, 'id' | 'first_name' | 'last_name'>>((a, b) => supabase.from('hr_employees').select('id,first_name,last_name').eq('tenant_id', tenant).order('last_name').order('id').range(a, b), { label: 'empleados' }) : Promise.resolve([]),
    ])
    return { absences, employees }
  }, [start, end, employee, manager, tenant])
  const { data, error, loading, reload } = useScopedLoad(context, allowed && !!start, loader)
  if (userLoading) return null
  if (!allowed) return <div className={cardClass}>Tu usuario no tiene acceso al calendario de RRHH.</div>
  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Calendario de ausencias" icon={CalendarDays}
      description={manager ? 'Ausencias aprobadas del equipo. Los intervalos incluyen días no laborables; el saldo descuenta únicamente los días laborables.' : 'Tus ausencias aprobadas. El calendario no muestra datos de otros empleados.'} />
    <HrNavigation manager={manager} />
    <div className={cardClass}>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <FormField label="Mes"><input type="month" className={fieldClassSm} min="1900-01" max="2200-12" value={month} onChange={e => setMonth(e.target.value)} /></FormField>
        {manager && <FormField label="Empleado" as="div" className="sm:col-span-2"><CompactSelect aria-label="Empleado del calendario" value={employee} onValueChange={setEmployee}
          options={[{ value: '', label: 'Todo el equipo' }, ...(data?.employees ?? []).map(e => ({ value: e.id, label: employeeFullName(e) }))]} /></FormField>}
      </div>
      {!range && <p role="alert" className="text-sm text-rose-600">Selecciona un mes válido.</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
      {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando calendario…</p> : data && !error && range && <>
        {!data.absences.length ? <EmptyState title="Sin ausencias aprobadas" description="No hay ausencias para el mes y empleado seleccionados." /> : <div className="grid gap-3 md:grid-cols-7">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <p key={day} className="hidden text-center text-xs font-semibold text-slate-500 md:block">{day}</p>)}
          {Array.from({ length: range.offset }, (_, i) => <div key={`blank-${i}`} className="hidden md:block" aria-hidden="true" />)}
          {range.days.map(date => {
            const records = data.absences.filter(a => a.start_date <= date && a.end_date >= date)
            return <div key={date} className={`min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700 ${records.length ? '' : 'hidden md:block'}`}>
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{formatDate(date)}</p>
              <ul className="space-y-2">{records.map(a => <li key={a.request_id} className="break-words rounded-lg bg-sky-50 p-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                <p className="font-semibold">{a.employee_name}</p><p>{a.leave_type}</p>
              </li>)}</ul>
            </div>
          })}
        </div>}
      </>}
    </div>
  </div>
}
