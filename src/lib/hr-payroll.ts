export type HrCompensation = { id: string; employee_id: string; effective_from: string; currency: string; salary_mode: string; monthly_salary: number; frequency: string; source: string }
export type HrPayrollConcept = { id: string; code: string; name: string; kind: string; debit_account_id: string | null; credit_account_id: string | null; active: boolean; revision: number }
export type HrPayrollRun = { id: string; kind: string; starts_on: string; ends_on: string; pay_date: string; currency: string; status: string; gross: number; deductions: number; employer: number; net: number; review_source: string; journal_entry_id: string | null; reversal_entry_id: string | null }
export type HrPayslip = { benefit_calculation_id?: string | null; id: string; run_id: string; kind: string; starts_on: string; ends_on: string; pay_date: string; currency: string; status: string; company: { name: string; rtn?: string; address?: string }; employee: { code: string; name: string }; gross: number; deductions: number; employer: number; net: number; items: { name: string; kind: string; amount: number; source: string }[] }
export const HR_PAY_FREQUENCIES = ['Semanal', 'Catorcenal', 'Quincenal', 'Mensual'] as const
export const HR_SALARY_MODES = ['Fijo', 'Variable', 'Mixto'] as const
export const HR_PAYROLL_KINDS = ['Nómina', 'Vacaciones', 'Liquidación'] as const
