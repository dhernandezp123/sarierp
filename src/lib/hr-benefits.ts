export type BenefitComponent = 'vacation' | 'vacation_balance' | 'notice' | 'severance' | 'bonus13' | 'bonus14' | 'fixed_term'
export const BENEFIT_COMPONENTS: { value: BenefitComponent; label: string }[] = [
 { value: 'vacation', label: 'Pago de vacaciones aprobadas' }, { value: 'vacation_balance', label: 'Vacaciones al terminar' },
 { value: 'notice', label: 'Preaviso' }, { value: 'severance', label: 'Cesantía' }, { value: 'bonus13', label: 'Décimo tercer mes' },
 { value: 'bonus14', label: 'Décimo cuarto mes' }, { value: 'fixed_term', label: 'Indemnización de plazo restante' },
]
export const BENEFIT_CAUSES = [
 { value: 'despido_injustificado', label: 'Despido injustificado' }, { value: 'despido_indirecto', label: 'Despido indirecto (art. 114)' },
 { value: 'renuncia', label: 'Renuncia voluntaria' }, { value: 'despido_justificado', label: 'Despido justificado' },
 { value: 'mutuo_acuerdo', label: 'Mutuo acuerdo' }, { value: 'fallecimiento_natural', label: 'Fallecimiento natural' }, { value: 'fin_contrato', label: 'Vencimiento de contrato' },
]
export type BenefitRow = { start: string; end: string; ordinary: string; in_kind: string; extraordinary: string; worked_days: string; source: string }
export type BenefitLine = { component: BenefitComponent; name: string; units: number; unit_amount: number; gross: number; credited: number; credits: { id: string; amount: number; reference: string }[]; net: number; excess_credit: number; period_start: string; legal_basis: string }
export type BenefitBasis = { start: string; end: string; ordinary: number; in_kind: number; extraordinary: number; worked_days: number; rows: BenefitRow[] }
export type BenefitSnapshot = { vacation_partial_days: number; vacation_advance_excess: number; vacation_periods: { period_number: number; available: number; is_earned: boolean }[]; version: string; fingerprint: string; kind: string; employee_id: string; employee_name: string; employee_code: string; hire_date: string; as_of: string; currency: string; ordinary_daily: number; indemnity_daily: number; tenure_360: number | null; cap_months: number | null; cause: string | null; basis6: BenefitBasis; basis13: BenefitBasis | null; basis14: BenefitBasis | null; lines: BenefitLine[]; total: number }
export type BenefitCredit = { id: string; employee_id: string; component: BenefitComponent; period_start: string; leave_request_id: string | null; currency: string; amount: number; paid_on: string; reference: string; source: string; voided_at: string | null }
export type BenefitCalculation = { id: string; employee_id: string; payroll_run_id: string; created_at: string; snapshot: BenefitSnapshot }

const iso = (d: Date) => d.toISOString().slice(0, 10)
function date(value: string) { const d = new Date(`${value}T12:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(d.valueOf()) || iso(d) !== value) throw new Error('Fecha inválida'); return d }
export function benefitWindows(hire: string, cutoff: string) {
 date(hire); const end = date(cutoff)
 if (cutoff < hire) throw new Error('El corte es anterior al ingreso')
 const next = new Date(end); next.setUTCDate(next.getUTCDate() + 1)
 const day = next.getUTCDate(); const first = new Date(next); first.setUTCDate(1); first.setUTCMonth(first.getUTCMonth() - 6)
 const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1, 0); first.setUTCDate(Math.min(day, last.getUTCDate()))
 const y = end.getUTCFullYear(), month = end.getUTCMonth()
 return { average: { start: hire > iso(first) ? hire : iso(first), end: cutoff }, bonus13: { start: hire > `${y}-01-01` ? hire : `${y}-01-01`, end: cutoff }, bonus14: { start: hire > `${month < 6 ? y - 1 : y}-07-01` ? hire : `${month < 6 ? y - 1 : y}-07-01`, end: cutoff } }
}
export function benefitRows(start: string, end: string, worked: boolean): BenefitRow[] {
 let cursor = date(start); date(end); if (start > end) throw new Error('Período inválido')
 const rows: BenefitRow[] = []
 while (iso(cursor) <= end) {
  const last = new Date(cursor); last.setUTCMonth(last.getUTCMonth() + 1, 0)
  const stop = iso(last) > end ? end : iso(last)
  rows.push({ start: iso(cursor), end: stop, ordinary: '', in_kind: '0', extraordinary: '0', worked_days: worked ? '' : '0', source: '' })
  cursor = date(stop); cursor.setUTCDate(cursor.getUTCDate() + 1)
 }
 return rows
}

export const formatBenefitRate = (value: number, currency: string) => currency + ' ' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
