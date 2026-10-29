import type { AccountingAccount } from './accounting'

export type ServiceSourceKind = 'service' | 'product'
export type ServiceTaxVariant = 'I' | 'E' | 'Exonerada'
export type ServiceConcept = { kind: ServiceSourceKind; code: string; label: string; taxable?: boolean }
export type ServiceAccountingProfile = { id: string; source_kind: ServiceSourceKind; source_code: string; revision: number }
export type ServiceAccountingVariant = {
  id?: string; profile_id?: string; tax_variant: ServiceTaxVariant
  income_account_id: string | null; expense_account_id: string | null
  income_applicable: boolean; expense_applicable: boolean
}
export const serviceTaxLabels: Record<ServiceTaxVariant, string> = { I: 'I · Gravada', E: 'E · Exenta', Exonerada: 'Exonerada' }
export function fiscalAccountVariant(treatment: string | undefined, rate: number): ServiceTaxVariant {
  return treatment === 'Exonerada' ? 'Exonerada' : treatment === 'Exenta' ? 'E' : rate > 0 ? 'I' : 'E'
}
export function eligibleServiceAccount(account: AccountingAccount | undefined, side: 'income' | 'expense') {
  return Boolean(account?.active && account.postable && account.account_level === 'Auxiliar'
    && (side === 'income' ? account.kind === 'Ingreso' : ['Costo', 'Gasto'].includes(account.kind)))
}
export function serviceAssignmentStatus(variants: ServiceAccountingVariant[], accounts: AccountingAccount[]) {
  const byId = new Map(accounts.map(account => [account.id, account]))
  const classification = variants.length === 0
  const income = classification || variants.some(v => v.income_applicable && !eligibleServiceAccount(byId.get(v.income_account_id || ''), 'income'))
  const expense = classification || variants.some(v => v.expense_applicable && !eligibleServiceAccount(byId.get(v.expense_account_id || ''), 'expense'))
  return { classification, income, expense, pending: classification || income || expense }
}
export function serviceAssignmentCounts(rows: { variants: ServiceAccountingVariant[] }[], accounts: AccountingAccount[]) {
  return rows.reduce((counts, row) => {
    const status = serviceAssignmentStatus(row.variants, accounts)
    return { total: counts.total + 1, pending: counts.pending + Number(status.pending), income: counts.income + Number(status.income), expense: counts.expense + Number(status.expense), classification: counts.classification + Number(status.classification) }
  }, { total: 0, pending: 0, income: 0, expense: 0, classification: 0 })
}
export function pricingServiceReference(rateCode: string | null | undefined, itemType: string | null | undefined, product: string | null | undefined, concepts: ServiceConcept[]): ServiceConcept | undefined {
  const code = rateCode?.startsWith('origin_charge:') ? rateCode.split(':')[1] : rateCode
  return concepts.find(c => c.kind === 'service' && c.code === code)
    || (itemType === 'freight' && !rateCode?.startsWith('origin_charge:') && !rateCode?.startsWith('destination_charge:') ? concepts.find(c => c.kind === 'product' && c.code === product) : undefined)
}
