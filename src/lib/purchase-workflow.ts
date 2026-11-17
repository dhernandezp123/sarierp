import { invoiceLineAmounts, calculateInvoiceFiscal, roundMoney, type FiscalMode, type TaxTreatment } from './invoice-fiscal'
import { calculateTaxAmount } from './tax'
import type { FiscalIssuer } from '@/src/components/pdf/FiscalDocumentLayout'
import { parseDateValue, toDateInputValue } from './format'
import type { AccountingAccount } from './accounting'

export function purchaseExpenseAccounts(accounts: AccountingAccount[]) {
  return accounts.filter(account => account.kind === 'Gasto' && account.active && account.postable)
}

export function selectPurchaseExpenseAccount(line: PurchaseWorkflowLine, id: string, accounts: AccountingAccount[]) {
  const account = purchaseExpenseAccounts(accounts).find(a => a.id === id)
  if (id && !account) throw new Error('Selecciona una cuenta de gasto activa que admita movimientos.')
  const previous = accounts.find(a => a.id === line.account_id)
  return { ...line, account_id: account?.id || null,
    description: !line.description.trim() || line.description === previous?.name ? account?.name || '' : line.description,
    service_catalog_kind: null, service_catalog_code: null }
}

export type PurchaseWorkflowKind = 'Solicitud' | 'Orden'
export type PurchaseWorkflowStatus = 'Borrador' | 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Cancelada' | 'Parcialmente facturada' | 'Facturada'
export type PurchaseWorkflowLine = {
  id: string; description: string; quantity: number; unit_price: number; discount_amount: number
  tax_rate: number; tax_treatment: TaxTreatment; account_id: string | null
  service_catalog_kind?: 'service' | 'product' | null; service_catalog_code?: string | null
  amount?: number; tax?: number
}
export type PurchaseWorkflowDocument = {
  id: string; kind: PurchaseWorkflowKind; document_number: string; status: PurchaseWorkflowStatus; revision: number
  supplier_id: string | null; office_id: string | null; source_request_id: string | null
  issue_date: string; due_date: string; currency: string; exchange_rate: number; fiscal_mode: FiscalMode
  payment_condition: 'Contado' | 'Credito'; payment_method: string; payment_reference: string
  supplier_reference: string; supplier_cai: string; internal_notes: string; commercial_notes: string
  issuer_snapshot: FiscalIssuer | null
  supplier_snapshot: { name?: string; rtn?: string | null; address?: string | null; phone?: string | null; email?: string | null }
  items: PurchaseWorkflowLine[]; subtotal: number; tax_amount: number; total: number
  created_by: string; approved_by: string | null; approved_at: string | null
}
export type PurchaseAllocation = { order_id: string; item_id: string; quantity: number; purchase_document_id: string; discount_amount: number; is_active?: boolean }
export const newPurchaseWorkflowLine = (): PurchaseWorkflowLine => ({
  id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, discount_amount: 0,
  tax_rate: 0, tax_treatment: 'Exenta', account_id: null,
})

export function purchaseWorkflowDueDate(issueDate: string, days: number) {
  const date = parseDateValue(issueDate)
  if (!date || !Number.isInteger(days) || days < 0) return issueDate
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

export function purchaseWorkflowAmounts(lines: PurchaseWorkflowLine[], mode: FiscalMode, snapshot = false) {
  const amounts = lines.map(line => {
    const amount = snapshot && line.amount != null ? Number(line.amount) : invoiceLineAmounts(line.quantity, line.unit_price, line.discount_amount).net
    const treatment = mode === 'Mixta' ? line.tax_treatment : mode
    const rate = mode === 'Exenta' || mode === 'Exonerada' ? 0 : line.tax_rate
    return { ...line, amount, isv_rate: rate, tax_treatment: treatment,
      lineTax: snapshot && line.tax != null ? Number(line.tax) : roundMoney(calculateTaxAmount(treatment === 'Gravada', amount, rate)) }
  })
  const fiscal = calculateInvoiceFiscal(amounts, mode)
  // Purchases round tax on each line; aggregate only after rounding, like the RPC.
  const tax15 = roundMoney(amounts.filter(l => l.tax_treatment === 'Gravada' && l.isv_rate === 15).reduce((sum,l) => sum+l.lineTax,0))
  const tax18 = roundMoney(amounts.filter(l => l.tax_treatment === 'Gravada' && l.isv_rate === 18).reduce((sum,l) => sum+l.lineTax,0))
  const tax = roundMoney(tax15+tax18)
  return { ...fiscal, tax15, tax18, tax, total: roundMoney(fiscal.subtotal+tax), discounts: roundMoney(lines.reduce((sum, line) => sum + Number(line.discount_amount), 0)) }
}

export function purchaseWorkflowRemaining(document: PurchaseWorkflowDocument, allocations: PurchaseAllocation[]) {
  return document.items.map(line => ({ ...line,
    remaining: Math.max(0, line.quantity - allocations.filter(a => a.order_id === document.id && a.item_id === line.id && a.is_active !== false)
      .reduce((sum, a) => sum + Number(a.quantity), 0)),
  }))
}

export function canManagePurchaseWorkflow(profile?: { rol?: string | null; status?: string | null; is_active?: boolean | null } | null) {
  return Boolean(profile && ['Admin', 'Contabilidad'].includes(profile.rol || '') && profile.status === 'Aprobado' && profile.is_active)
}
