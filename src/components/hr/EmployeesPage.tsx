'use client'
import { useCallback, useMemo, useState } from 'react'
import { Plus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, toDateInputValue } from '@/src/lib/format'
import { cardClass, fieldClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { HR_CONTRACT_TYPES, canManageHr, employeeFullName, vacationBalance, type HrContractType, type HrEmployee, type HrLeaveRequest } from '@/src/lib/hr'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { HrNavigation, LeaveRequestDialog, useScopedLoad } from './HrShared'

type LinkableProfile = { id: string; nombre: string | null; apellido: string | null; email: string | null; rol: string }
type Resources = { employees: HrEmployee[]; requests: HrLeaveRequest[]; profiles: LinkableProfile[] }
type EmployeeForm = Omit<HrEmployee, 'id' | 'tenant_id' | 'revision' | 'vacation_days_per_year' | 'birth_date' | 'termination_date' | 'profile_id' | 'manager_id'>
  & { vacation_days_per_year: string; birth_date: string; termination_date: string; profile_id: string; manager_id: string }

const emptyForm = (): EmployeeForm => ({
  employee_code: '', first_name: '', last_name: '', national_id: '', birth_date: '', email: '', phone: '', address: '',
  emergency_contact_name: '', emergency_contact_phone: '', department: '', job_title: '', manager_id: '',
  hire_date: toDateInputValue(), contract_type: 'Indefinido', status: 'Activo', termination_date: '', vacation_days_per_year: '10', profile_id: '',
})

const toForm = (employee: HrEmployee): EmployeeForm => ({
  ...employee, birth_date: employee.birth_date || '', termination_date: employee.termination_date || '',
  profile_id: employee.profile_id || '', manager_id: employee.manager_id || '', vacation_days_per_year: String(employee.vacation_days_per_year),
})

export function EmployeesPage() {
  const { user, profile, loading: userLoading } = useUser()
  const manager = canManageHr(profile), tenant = profile?.tenant_id || ''
  const context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const loader = useCallback(async (): Promise<Resources> => {
    const [employees, requests, profiles] = await Promise.all([
      readAllReportRows<HrEmployee>((a, b) => supabase.from('hr_employees').select('*').eq('tenant_id', tenant).order('last_name').order('id').range(a, b), { label: 'empleados' }),
      readAllReportRows<HrLeaveRequest>((a, b) => supabase.from('hr_leave_requests').select('*').eq('tenant_id', tenant).in('status', ['Pendiente', 'Aprobada']).eq('leave_type', 'Vacaciones').order('id').range(a, b), { label: 'vacaciones' }),
      readAllReportRows<LinkableProfile>((a, b) => supabase.from('profiles').select('id,nombre,apellido,email,rol').eq('tenant_id', tenant).neq('rol', 'Cliente').order('nombre').order('id').range(a, b), { label: 'usuarios' }),
    ])
    return { employees, requests, profiles }
  }, [tenant])
  const { data, error, loading, reload } = useScopedLoad(context, manager && !!tenant, loader)
  const [query, setQuery] = useState(''), [status, setStatus] = useState('Activo'), [page, setPage] = useState(1), [size, setSize] = useState(25)
  const [editor, setEditor] = useState<{ employee?: HrEmployee } | null>(null)
  const [leaveFor, setLeaveFor] = useState<HrEmployee | null>(null)
  const year = new Date().getFullYear()

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
      description="Ficha del personal, puesto, contrato y días de vacaciones por año."
      actions={<button type="button" className={`${primaryButtonClass} inline-flex items-center gap-2`} onClick={() => setEditor({})}><Plus size={16} aria-hidden="true" />Nuevo empleado</button>} />
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
              <th className="py-2 pr-4">Ingreso</th><th className="py-2 pr-4 text-right">Vacaciones {year}</th><th className="py-2" /></tr></thead>
            <tbody>{visible.map(employee => {
              const balance = vacationBalance(employee, data?.requests || [], year)
              return <tr key={employee.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-3 pr-4 font-mono text-xs">{employee.employee_code}</td>
                <td className="py-3 pr-4"><p className="font-medium text-slate-900 dark:text-white">{employeeFullName(employee)}</p>
                  <p className="text-xs text-slate-500">{employee.status === 'Inactivo' ? `Baja ${formatDate(employee.termination_date)}` : employee.profile_id ? 'Con usuario ERP' : 'Sin usuario ERP'}</p></td>
                <td className="py-3 pr-4">{employee.job_title || '—'}<p className="text-xs text-slate-500">{employee.department}</p></td>
                <td className="py-3 pr-4">{employee.manager_id ? names.get(employee.manager_id) : '—'}</td>
                <td className="py-3 pr-4">{formatDate(employee.hire_date)}</td>
                <td className="py-3 pr-4 text-right">{balance.available} / {balance.allowance}{balance.pending > 0 && <p className="text-xs text-amber-600">{balance.pending} pendiente(s)</p>}</td>
                <td className="py-3 text-right"><div className="flex justify-end gap-2">
                  {employee.status === 'Activo' && <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setLeaveFor(employee)}>Solicitud</button>}
                  <button type="button" className="text-sm font-medium text-[#B3282D] hover:underline dark:text-rose-300" onClick={() => setEditor({ employee })}>Editar</button>
                </div></td>
              </tr>
            })}</tbody>
          </table>
            <Pagination page={page} pageSize={size} total={filtered.length} onPageChange={setPage} onPageSizeChange={value => { setSize(value); setPage(1) }} />
          </div>}
    </div>
    {editor && data && <EmployeeDialog employee={editor.employee} employees={data.employees} profiles={data.profiles}
      onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void reload() }} />}
    {leaveFor && data && <LeaveRequestDialog employeeId={leaveFor.id} employeeName={employeeFullName(leaveFor)}
      availableFor={target => vacationBalance(leaveFor, data.requests, target).available} onClose={() => setLeaveFor(null)} onSaved={() => { setLeaveFor(null); void reload() }} />}
  </div>
}

function EmployeeDialog({ employee, employees, profiles, onClose, onSaved }: {
  employee?: HrEmployee; employees: HrEmployee[]; profiles: LinkableProfile[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<EmployeeForm>(() => employee ? toForm(employee) : emptyForm())
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) => setForm(current => ({ ...current, [key]: value }))
  const linked = new Set(employees.filter(item => item.id !== employee?.id && item.profile_id).map(item => item.profile_id))
  const problem = !form.employee_code.trim() || !form.first_name.trim() || !form.last_name.trim() ? 'Código, nombres y apellidos son obligatorios'
    : !form.hire_date ? 'Indica la fecha de ingreso'
      : form.status === 'Inactivo' && !form.termination_date ? 'Indica la fecha de salida'
        : form.termination_date && form.termination_date < form.hire_date ? 'La salida no puede ser anterior al ingreso'
          : !/^\d{1,2}(\.\d)?$/.test(form.vacation_days_per_year) || Number(form.vacation_days_per_year) > 60 ? 'Días de vacaciones entre 0 y 60' : ''

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
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
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
            <FormField label="Vacaciones por año (días hábiles)" required hint="Según antigüedad y política interna."><input inputMode="decimal" className={fieldClass} disabled={busy}
              value={form.vacation_days_per_year} onChange={event => set('vacation_days_per_year', event.target.value)} /></FormField>
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
