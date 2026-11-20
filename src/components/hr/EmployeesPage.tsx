'use client'
import { useCallback, useMemo, useState } from 'react'
import { CalendarRange, Plus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, toDateInputValue } from '@/src/lib/format'
import { cardClass, fieldClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { HR_CONTRACT_TYPES, HR_WORK_SCHEDULES, canManageHr, employeeFullName, workScheduleLabel, type HrContractType, type HrEmployee, type HrVacationSummary, type HrWorkSchedule } from '@/src/lib/hr'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { HrNavigation, LeaveRequestDialog, useReturnFocus, useScopedLoad } from './HrShared'
import { VacationDetailDialog } from './VacationDetailDialog'
import { HrHistoryDialog } from './HrHistoryDialog'
import { HrExportButtons } from './HrExportButtons'
import { hrBalanceRows } from '@/src/lib/hr-report'

type LinkableProfile = { id: string; nombre: string | null; apellido: string | null; email: string | null; rol: string }
type Resources = { employees: HrEmployee[]; summary: Map<string, HrVacationSummary>; profiles: LinkableProfile[] }
type EmployeeForm = Omit<HrEmployee, 'id' | 'tenant_id' | 'revision' | 'vacation_days_override' | 'birth_date' | 'termination_date' | 'profile_id' | 'manager_id'>
  & { vacation_days_override: string; birth_date: string; termination_date: string; profile_id: string; manager_id: string }

const emptyForm = (): EmployeeForm => ({
  employee_code: '', first_name: '', last_name: '', national_id: '', birth_date: '', email: '', phone: '', address: '',
  emergency_contact_name: '', emergency_contact_phone: '', department: '', job_title: '', manager_id: '',
  hire_date: toDateInputValue(), contract_type: 'Indefinido', status: 'Activo', termination_date: '', work_schedule: 'L-V', vacation_days_override: '', profile_id: '',
})

const toForm = (employee: HrEmployee): EmployeeForm => ({
  ...employee, birth_date: employee.birth_date || '', termination_date: employee.termination_date || '',
  profile_id: employee.profile_id || '', manager_id: employee.manager_id || '', vacation_days_override: employee.vacation_days_override == null ? '' : String(employee.vacation_days_override),
})

export function EmployeesPage() {
  const { user, profile, loading: userLoading } = useUser()
  const manager = canManageHr(profile), tenant = profile?.tenant_id || ''
  const context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const loader = useCallback(async (): Promise<Resources> => {
    const [employees, summary, profiles] = await Promise.all([
      readAllReportRows<HrEmployee>((a, b) => supabase.from('hr_employees').select('*').eq('tenant_id', tenant).order('last_name').order('id').range(a, b), { label: 'empleados' }),
      supabase.rpc('hr_vacation_summary').then(({ data: rows, error: rpcError }) => {
        if (rpcError) throw new Error('No se pudo cargar el saldo de vacaciones. Reintenta la consulta.')
        return new Map(((rows || []) as HrVacationSummary[]).map(row => [row.employee_id, row]))
      }),
      readAllReportRows<LinkableProfile>((a, b) => supabase.from('profiles').select('id,nombre,apellido,email,rol').eq('tenant_id', tenant).neq('rol', 'Cliente').order('nombre').order('id').range(a, b), { label: 'usuarios' }),
    ])
    return { employees, summary, profiles }
  }, [tenant])
  const { data, error, loading, reload } = useScopedLoad(context, manager && !!tenant, loader)
  const [query, setQuery] = useState(''), [status, setStatus] = useState('Activo'), [page, setPage] = useState(1), [size, setSize] = useState(25)
  const [editor, setEditor] = useState<{ employee?: HrEmployee } | null>(null)
  const [leaveFor, setLeaveFor] = useState<HrEmployee | null>(null)
  const [vacationsFor, setVacationsFor] = useState<HrEmployee | null>(null)
  const [historyFor, setHistoryFor] = useState<HrEmployee | null>(null)

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es')
    return (data?.employees || []).filter(employee => (status === 'Todos' || employee.status === status) && (!term ||
      `${employee.employee_code} ${employeeFullName(employee)} ${employee.department} ${employee.job_title} ${employee.email}`.toLocaleLowerCase('es').includes(term)))
  }, [data, query, status])
  const visible = filtered.slice((page - 1) * size, page * size)
  const names = useMemo(() => new Map((data?.employees || []).map(employee => [employee.id, employeeFullName(employee)])), [data])

  if (userLoading) return null
  if (!manager) return <div className={cardClass}>Solo Administración puede gestionar empleados.</div>

  return <div className="space-y-6">
    <FinancePageHeader eyebrow="Recursos Humanos" title="Empleados" icon={UserRound}
      description="Ficha del personal, puesto, jornada y vacaciones por aniversario de ingreso."
      actions={<div className="flex flex-wrap gap-2"><HrExportButtons rows={() => hrBalanceRows(filtered, data!.summary)} filename="rrhh-saldos" disabled={loading || !!error || !filtered.length} />
        <button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} onClick={() => setEditor({})}><Plus size={16} aria-hidden="true" />Nuevo empleado</button></div>} />
    <HrNavigation manager />
    <div className={cardClass}>
      <div className="mb-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Buscar" className="lg:col-span-3"><input className={fieldClassSm} value={query} placeholder="Código, nombre, departamento o cargo" onChange={event => { setQuery(event.target.value); setPage(1) }} /></FormField>
        <FormField label="Estado" as="div"><CompactSelect aria-label="Estado" value={status} onValueChange={value => { setStatus(value); setPage(1) }}
          options={['Activo', 'Inactivo', 'Todos'].map(value => ({ value, label: value }))} /></FormField>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-rose-600">{error} <button type="button" className="underline" onClick={() => void reload()}>Reintentar</button></p>}
      {loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando empleados…</p>
        : !filtered.length ? <EmptyState title="No hay empleados" description="Registra la primera ficha para comenzar." action={{ label: 'Nuevo empleado', onClick: () => setEditor({}) }} />
          : <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
              <th className="py-2 pr-4">Código</th><th className="py-2 pr-4">Empleado</th><th className="py-2 pr-4">Puesto</th><th className="py-2 pr-4">Jefe directo</th>
              <th className="py-2 pr-4">Ingreso</th><th className="py-2 pr-4 text-right">Vacaciones disponibles</th><th className="py-2" /></tr></thead>
            <tbody>{visible.map(employee => {
              const balance = data?.summary.get(employee.id)
              return <tr key={employee.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-3 pr-4 font-mono text-xs">{employee.employee_code}</td>
                <td className="py-3 pr-4"><p className="font-medium text-slate-900 dark:text-white">{employeeFullName(employee)}</p>
                  <p className="text-xs text-slate-500">{employee.status === 'Inactivo' ? `Baja ${formatDate(employee.termination_date)}` : `${workScheduleLabel(employee.work_schedule)} · ${employee.profile_id ? 'con usuario ERP' : 'sin usuario ERP'}`}</p></td>
                <td className="py-3 pr-4">{employee.job_title || '—'}<p className="text-xs text-slate-500">{employee.department}</p></td>
                <td className="py-3 pr-4">{employee.manager_id ? names.get(employee.manager_id) : '—'}</td>
                <td className="py-3 pr-4">{formatDate(employee.hire_date)}</td>
                <td className="py-3 pr-4 text-right">{balance ? <>{balance.available} día(s)
                  <span className="mt-1 flex flex-wrap justify-end gap-1 text-[11px] font-semibold">
                    {balance.expired_unused && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Vencido con saldo</span>}
                    {balance.overdue_unscheduled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Sin programar</span>}
                    {balance.advance_used > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Anticipo {balance.advance_used}</span>}
                  </span>
                  {balance.earned_periods === 0 && <span className="block text-xs text-slate-500">Antes del primer aniversario</span>}</> : '—'}</td>
                <td className="py-3 text-right"><div className="flex justify-end gap-2">
                  <button type="button" className="inline-flex items-center gap-1 text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setVacationsFor(employee)}><CalendarRange size={14} aria-hidden="true" />Vacaciones</button>
                  {employee.status === 'Activo' && <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setLeaveFor(employee)}>Solicitud</button>}
                  <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setEditor({ employee })}>Editar</button>
                  <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setHistoryFor(employee)}>Historial</button>
                </div></td>
              </tr>
            })}</tbody>
          </table>
            <Pagination page={page} pageSize={size} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1) }} />
          </div>}
    </div>
    {editor && data && <EmployeeDialog employee={editor.employee} employees={data.employees} profiles={data.profiles}
      onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void reload() }} />}
    {leaveFor && <LeaveRequestDialog employeeId={leaveFor.id} employeeName={employeeFullName(leaveFor)}
      onClose={() => setLeaveFor(null)} onSaved={() => { setLeaveFor(null); void reload() }} />}
    {vacationsFor && <VacationDetailDialog employee={vacationsFor} onClose={() => setVacationsFor(null)} onChanged={() => void reload()} />}
    {historyFor && <HrHistoryDialog employee={historyFor} names={new Map([
      ...(data?.employees ?? []).map(e => [e.id, employeeFullName(e)] as const),
      ...(data?.profiles ?? []).map(p => [p.id, `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() || p.email || 'Usuario ERP'] as const),
    ])} onClose={() => setHistoryFor(null)} />}
  </div>
}

function EmployeeDialog({ employee, employees, profiles, onClose, onSaved }: {
  employee?: HrEmployee; employees: HrEmployee[]; profiles: LinkableProfile[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<EmployeeForm>(() => employee ? toForm(employee) : emptyForm())
  const returnFocus = useReturnFocus()
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) => setForm(current => ({ ...current, [key]: value }))
  const linked = new Set(employees.filter(item => item.id !== employee?.id && item.profile_id).map(item => item.profile_id))
  const problem = !form.employee_code.trim() || !form.first_name.trim() || !form.last_name.trim() ? 'Código, nombres y apellidos son obligatorios'
    : !form.hire_date ? 'Indica la fecha de ingreso'
      : form.status === 'Inactivo' && !form.termination_date ? 'Indica la fecha de salida'
        : form.termination_date && form.termination_date < form.hire_date ? 'La salida no puede ser anterior al ingreso'
          : form.vacation_days_override && (Number(form.vacation_days_override) < 10 || Number(form.vacation_days_override) > 60) ? 'El mínimo por período debe estar entre 10 y 60 días' : ''

  async function save() {
    if (problem || busy) return
    setBusy(true)
    const payload = { ...form, termination_date: form.status === 'Inactivo' ? form.termination_date : '' }
    const { error } = await supabase.rpc('hr_save_employee', { p_id: employee?.id ?? null, p_revision: employee?.revision ?? null, p_employee: payload })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success(employee ? 'Ficha actualizada' : 'Empleado registrado')
    onSaved()
  }
  const text = (key: keyof EmployeeForm, label: string, required = false, type = 'text', className = '') =>
    <FormField label={label} required={required} className={className}><input type={type} className={fieldClass} disabled={busy}
      value={String(form[key] ?? '')} onChange={event => set(key, event.target.value as never)} /></FormField>

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="grid-cols-1 max-h-[90dvh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={returnFocus}>
      <DialogTitle>{employee ? `Editar ficha · ${employeeFullName(employee)}` : 'Nuevo empleado'}</DialogTitle>
      <DialogDescription>Los datos personales solo los ven Administración y el propio empleado, si tiene usuario vinculado.</DialogDescription>
      <div className="space-y-8">
        <FormSection title="Datos personales">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {text('employee_code', 'Código', true)}{text('first_name', 'Nombres', true)}{text('last_name', 'Apellidos', true)}
            {text('national_id', 'Identidad')}{text('birth_date', 'Fecha de nacimiento', false, 'date')}{text('phone', 'Teléfono', false, 'tel')}
            {text('email', 'Correo', false, 'email')}{text('address', 'Dirección', false, 'text', 'sm:col-span-2')}
            {text('emergency_contact_name', 'Contacto de emergencia')}{text('emergency_contact_phone', 'Teléfono de emergencia', false, 'tel')}
          </div>
        </FormSection>
        <FormSection title="Puesto y contrato">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {text('department', 'Departamento')}{text('job_title', 'Cargo')}
            <FormField label="Jefe directo" as="div"><CompactSelect aria-label="Jefe directo" value={form.manager_id} disabled={busy} onValueChange={value => set('manager_id', value)}
              options={[{ value: '', label: 'Sin jefe directo' }, ...employees.filter(item => item.id !== employee?.id && item.status === 'Activo').map(item => ({ value: item.id, label: employeeFullName(item), description: item.job_title }))]} /></FormField>
            {text('hire_date', 'Fecha de ingreso', true, 'date')}
            <FormField label="Tipo de contrato" required as="div"><CompactSelect aria-label="Tipo de contrato" value={form.contract_type} disabled={busy}
              onValueChange={value => set('contract_type', value as HrContractType)} options={HR_CONTRACT_TYPES.map(value => ({ value, label: value }))} /></FormField>
            <FormField label="Jornada laboral" required as="div" hint="Define qué días consumen vacaciones. El sábado de medio día cuenta 1 día (Art. 346)."><CompactSelect aria-label="Jornada laboral" value={form.work_schedule} disabled={busy}
              onValueChange={value => set('work_schedule', value as HrWorkSchedule)} options={HR_WORK_SCHEDULES.map(item => ({ value: item.value, label: item.label }))} /></FormField>
            <FormField label="Mínimo de vacaciones por período" hint="Opcional; solo puede mejorar la escala legal 10/12/15/20. Rige para los períodos que se ganen desde hoy; para períodos ya ganados registra un ajuste."><input inputMode="numeric" className={fieldClass} disabled={busy}
              placeholder="Escala legal" value={form.vacation_days_override} onChange={event => set('vacation_days_override', event.target.value.replace(/\D/g, '').slice(0, 2))} /></FormField>
          </div>
        </FormSection>
        <FormSection title="Estado y acceso">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Estado" required as="div"><CompactSelect aria-label="Estado" value={form.status} disabled={busy}
              onValueChange={value => set('status', value as EmployeeForm['status'])} options={[{ value: 'Activo', label: 'Activo' }, { value: 'Inactivo', label: 'Inactivo (baja)' }]} /></FormField>
            {form.status === 'Inactivo' && text('termination_date', 'Fecha de salida', true, 'date')}
            <FormField label="Usuario del ERP" as="div" hint="Opcional. Permite al empleado consultar su ficha y pedir vacaciones." className={form.status === 'Inactivo' ? '' : 'sm:col-span-2'}>
              <CompactSelect aria-label="Usuario del ERP" value={form.profile_id} disabled={busy} onValueChange={value => set('profile_id', value)}
                options={[{ value: '', label: 'Sin usuario vinculado' }, ...profiles.map(item => ({ value: item.id, disabled: linked.has(item.id),
                  label: `${item.nombre || ''} ${item.apellido || ''}`.trim() || item.email || item.id, description: `${item.rol}${linked.has(item.id) ? ' · ya vinculado' : ''}` }))]} />
            </FormField>
          </div>
        </FormSection>
      </div>
      {problem && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{problem}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="button" className={primaryButtonClass} disabled={busy || !!problem} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar ficha'}</button>
      </div>
    </DialogContent>
  </Dialog>
}
