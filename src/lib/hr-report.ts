import { formatDate } from './format'
import { reportCsvCell } from './report-view'
import { employeeFullName, workScheduleLabel, type HrEmployee, type HrLeaveRequest, type HrVacationSummary } from './hr'

export type HrAbsence = { request_id: string; employee_id: string; employee_code: string; employee_name: string; leave_type: string; start_date: string; end_date: string; business_days: number }
export type HrHistoryEntry = { id: string; revision: number; action: string; changes: Record<string, { before: unknown; after: unknown }>; created_at: string; created_by: string | null }

export function hrMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mes inválido')
  const [year, number] = month.split('-').map(Number)
  if (year < 1900 || year > 2200) throw new Error('Año fuera de rango')
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${count}`, offset: (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7,
    days: Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`) }
}

export function hrRequestRows(requests: HrLeaveRequest[], employees: Map<string, HrEmployee>): (string | number)[][] {
  return [['Código', 'Empleado', 'Tipo', 'Desde', 'Hasta', 'Días laborables', 'Estado', 'Anticipo', 'Fraccionada', 'Suspendida'],
    ...requests.map(r => [employees.get(r.employee_id)?.employee_code ?? '', employeeFullName(employees.get(r.employee_id)), r.leave_type,
      formatDate(r.start_date), formatDate(r.end_date), Number(r.business_days), r.status, r.is_advance ? 'Sí' : 'No', r.is_fractioned ? 'Sí' : 'No', r.suspended_at ? 'Sí' : 'No'])]
}

export function hrBalanceRows(employees: HrEmployee[], summary: Map<string, HrVacationSummary>): (string | number)[][] {
  return [['Código', 'Empleado', 'Departamento', 'Jornada', 'Estado', 'Días disponibles', 'Anticipo usado'], ...employees.map(e => {
    const balance = summary.get(e.id)
    if (!balance) throw new Error('No se puede exportar un saldo incompleto')
    return [e.employee_code, employeeFullName(e), e.department, workScheduleLabel(e.work_schedule), e.status, Number(balance.available), Number(balance.advance_used)]
  })]
}

export function hrCsv(rows: (string | number)[][]) {
  return '\uFEFF' + rows.map(row => row.map(reportCsvCell).join(',')).join('\r\n')
}
