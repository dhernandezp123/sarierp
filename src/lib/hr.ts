import { parseDateValue } from '@/src/lib/format'

/** Recursos Humanos fase 1. La autorización efectiva vive en RLS y en las RPC hr_*. */
export const HR_CONTRACT_TYPES = ['Indefinido', 'Temporal', 'Por obra', 'Practicante'] as const
export const HR_LEAVE_TYPES = ['Vacaciones', 'Permiso con goce', 'Permiso sin goce', 'Incapacidad'] as const
export const HR_LEAVE_STATUSES = ['Pendiente', 'Aprobada', 'Rechazada', 'Cancelada'] as const

export type HrContractType = typeof HR_CONTRACT_TYPES[number]
export type HrLeaveType = typeof HR_LEAVE_TYPES[number]
export type HrLeaveStatus = typeof HR_LEAVE_STATUSES[number]

export type HrEmployee = {
  id: string; tenant_id: string; profile_id: string | null; employee_code: string; first_name: string; last_name: string
  national_id: string; birth_date: string | null; email: string; phone: string; address: string
  emergency_contact_name: string; emergency_contact_phone: string; department: string; job_title: string
  manager_id: string | null; hire_date: string; contract_type: HrContractType; status: 'Activo' | 'Inactivo'
  termination_date: string | null; vacation_days_per_year: number; revision: number
}

export type HrLeaveRequest = {
  id: string; employee_id: string; leave_type: HrLeaveType; start_date: string; end_date: string; business_days: number
  reason: string; status: HrLeaveStatus; review_notes: string; reviewed_at: string | null; created_at: string
}

type RoleProfile = { rol?: string | null; status?: string | null; is_active?: boolean | null } | null | undefined

export function canManageHr(profile: RoleProfile) {
  return profile?.rol === 'Admin' && profile.status === 'Aprobado' && profile.is_active === true
}

export function canUseHrSelfService(profile: RoleProfile) {
  return !!profile?.rol && profile.rol !== 'Cliente' && profile.status === 'Aprobado' && profile.is_active === true
}

export function employeeFullName(employee: Pick<HrEmployee, 'first_name' | 'last_name'> | null | undefined) {
  return employee ? `${employee.first_name} ${employee.last_name}`.trim() : ''
}

/** Días hábiles lunes a viernes, inclusive. Igual que public.hr_business_days. */
export function hrBusinessDays(start: string, end: string) {
  const from = parseDateValue(start), to = parseDateValue(end)
  if (!from || !to || to < from) return 0
  let days = 0
  for (const day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
    const weekday = day.getDay()
    if (weekday !== 0 && weekday !== 6) days++
  }
  return days
}

/** Las solicitudes pendientes reservan saldo igual que en el servidor. */
export function vacationBalance(employee: Pick<HrEmployee, 'id' | 'vacation_days_per_year'>, requests: HrLeaveRequest[], year: number) {
  const committed = requests.filter(request => request.employee_id === employee.id && request.leave_type === 'Vacaciones'
    && (request.status === 'Aprobada' || request.status === 'Pendiente') && Number(request.start_date.slice(0, 4)) === year)
  const used = committed.filter(request => request.status === 'Aprobada').reduce((sum, request) => sum + request.business_days, 0)
  const pending = committed.filter(request => request.status === 'Pendiente').reduce((sum, request) => sum + request.business_days, 0)
  const allowance = Number(employee.vacation_days_per_year) || 0
  return { allowance, used, pending, available: allowance - used - pending }
}

export function validateLeaveRequest(input: { leave_type: string; start_date: string; end_date: string }, available: number) {
  if (!input.start_date || !input.end_date) return 'Indica las fechas de inicio y fin'
  if (input.end_date < input.start_date) return 'La fecha de fin no puede ser anterior al inicio'
  if (input.start_date.slice(0, 4) !== input.end_date.slice(0, 4)) return 'Divide la solicitud por año calendario'
  const days = hrBusinessDays(input.start_date, input.end_date)
  if (days < 1) return 'El rango no contiene días hábiles'
  if (input.leave_type === 'Vacaciones' && days > available) return `Saldo insuficiente: solicitas ${days} día(s) y tienes ${available} disponible(s)`
  return ''
}

export const leaveStatusTone: Record<HrLeaveStatus, string> = {
  Pendiente: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Aprobada: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Rechazada: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  Cancelada: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}
