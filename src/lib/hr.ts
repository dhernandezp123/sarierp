/**
 * Recursos Humanos. La autorización efectiva vive en RLS y en las RPC hr_*; los saldos,
 * días laborables y asignación a períodos se calculan solo en el servidor
 * (docs/hr-vacation-policy.md). Aquí quedan tipos, etiquetas y validaciones de forma.
 */
export const HR_CONTRACT_TYPES = ['Indefinido', 'Temporal', 'Por obra', 'Practicante'] as const
export const HR_LEAVE_TYPES = ['Vacaciones', 'Permiso con goce', 'Permiso sin goce', 'Incapacidad'] as const
export const HR_LEAVE_STATUSES = ['Pendiente', 'Aprobada', 'Rechazada', 'Cancelada'] as const
export const HR_WORK_SCHEDULES = [
  { value: 'L-V', label: 'Lunes a viernes' },
  { value: 'L-S', label: 'Lunes a sábado' },
  { value: 'L-S medio', label: 'Lunes a viernes y sábado medio día' },
] as const
export const HR_ADJUSTMENT_KINDS = ['Apertura', 'Corrección'] as const

export type HrContractType = typeof HR_CONTRACT_TYPES[number]
export type HrLeaveType = typeof HR_LEAVE_TYPES[number]
export type HrLeaveStatus = typeof HR_LEAVE_STATUSES[number]
export type HrWorkSchedule = typeof HR_WORK_SCHEDULES[number]['value']
export type HrAdjustmentKind = typeof HR_ADJUSTMENT_KINDS[number]

export type HrEmployee = {
  id: string; tenant_id: string; profile_id: string | null; employee_code: string; first_name: string; last_name: string
  national_id: string; birth_date: string | null; email: string; phone: string; address: string
  emergency_contact_name: string; emergency_contact_phone: string; department: string; job_title: string
  manager_id: string | null; hire_date: string; contract_type: HrContractType; status: 'Activo' | 'Inactivo'
  termination_date: string | null; work_schedule: HrWorkSchedule; vacation_days_override: number | null; revision: number
}

export type HrLeaveRequest = {
  id: string; employee_id: string; leave_type: HrLeaveType; start_date: string; end_date: string; business_days: number
  reason: string; status: HrLeaveStatus; review_notes: string; reviewed_at: string | null; created_at: string
  is_fractioned: boolean; is_advance: boolean; original_end_date: string | null; suspended_at: string | null; suspension_notes: string
}

export type HrVacationPeriod = {
  period_number: number; earned_on: string; ends_on: string; is_earned: boolean; entitlement: number; adjustments: number
  approved: number; pending: number; available: number; accumulated: boolean; overdue_unscheduled: boolean; expired_unused: boolean
}

export type HrLedgerEntry = { id: string; period_number: number; kind: HrAdjustmentKind; days: number; reason: string; created_at: string }
export type HrAccumulation = { employee_id: string; from_period: number; to_period: number; reason: string; created_at: string }
export type HrVacationSummary = { employee_id: string; earned_periods: number; available: number; advance_used: number; overdue_unscheduled: boolean; expired_unused: boolean }
export type HrHoliday = { id: string; holiday_date: string; name: string }
export type HrLeavePreview = { days: number; error: string | null; allocations?: { period: number; days: number; advance: boolean }[]; fractioned?: boolean; advance?: boolean }

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

export function workScheduleLabel(value: string | null | undefined) {
  return HR_WORK_SCHEDULES.find(item => item.value === value)?.label ?? 'Lunes a viernes'
}

/** Art. 346: mínimo legal de días laborables por período cumplido. */
export function legalVacationDays(period: number) {
  return period <= 1 ? 10 : period === 2 ? 12 : period === 3 ? 15 : 20
}

/** Solo forma de fechas; días, saldo y traslapes los valida hr_preview_leave. */
export function validateLeaveDates(start: string, end: string) {
  if (!start || !end) return 'Indica las fechas de inicio y fin'
  if (end < start) return 'La fecha de fin no puede ser anterior al inicio'
  return ''
}

/** Período disponible total: ganados menos el anticipo ya usado del siguiente. */
export function vacationTotals(periods: HrVacationPeriod[]) {
  const earned = periods.filter(period => period.is_earned)
  const next = periods.find(period => !period.is_earned)
  const advance = next ? Math.max(-next.available, 0) : 0
  return {
    available: earned.reduce((sum, period) => sum + period.available, 0) - advance,
    advance, nextEarnedOn: next?.earned_on ?? null, nextEntitlement: next ? legalVacationDays(next.period_number) : null,
  }
}

const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
export function easterSunday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

function shift(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return iso(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
}

/**
 * Sugerencia del Art. 339 (texto original). Reformas posteriores pueden mover fechas,
 * p. ej. la Semana Morazánica: Admin debe revisarlas antes de guardar.
 */
export function suggestedHolidays(year: number) {
  const easter = easterSunday(year)
  return [
    { date: iso(year, 1, 1), name: 'Año Nuevo' },
    { date: shift(easter, -3), name: 'Jueves Santo' },
    { date: shift(easter, -2), name: 'Viernes Santo' },
    { date: shift(easter, -1), name: 'Sábado de Gloria' },
    { date: iso(year, 4, 14), name: 'Día de las Américas' },
    { date: iso(year, 5, 1), name: 'Día del Trabajo' },
    { date: iso(year, 9, 15), name: 'Día de la Independencia' },
    { date: iso(year, 10, 3), name: 'Día de Francisco Morazán' },
    { date: iso(year, 10, 12), name: 'Día de la Raza' },
    { date: iso(year, 10, 21), name: 'Día de las Fuerzas Armadas' },
    { date: iso(year, 12, 25), name: 'Navidad' },
  ].sort((left, right) => left.date.localeCompare(right.date))
}

export const leaveStatusTone: Record<HrLeaveStatus, string> = {
  Pendiente: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  Aprobada: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Rechazada: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  Cancelada: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}
