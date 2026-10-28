import type { InvoiceFiscalOptionsValue } from '@/src/components/invoicing/InvoiceFiscalOptions'
import type { TaxTreatment } from '@/src/lib/invoice-fiscal'

export type DraftEditorItem = { id: string; description: string; quantity: string; unit_price: string; amount: number; isv_rate: 0 | 15 | 18; discount_amount?: string; income_account_id?: string; tax_treatment?: TaxTreatment; source_pricing_item_id?: string }
export type DraftEditorState = {
  invoiceType: 'Factura'; clienteId: string; quotationId: string; issueDate: string; dueDate: string
  currency: string; exchangeRate: string; notes: string; motivo: string; items: DraftEditorItem[]
  fiscalOptions: InvoiceFiscalOptionsValue; sourceCurrency: string
}
export type InvoiceDraft = {
  id: string; revision: number; status: 'Borrador' | 'Pendiente de aprobación' | 'Aprobada' | 'Rechazada' | 'Emitida' | 'Descartada'
  invoice_payload: Record<string, unknown>; items: Record<string, unknown>[]; editor_state: DraftEditorState
  quotation_id: string | null; source_invoice_id: string | null; source_snapshot: Record<string, unknown> | null
  invoice_id: string | null; reason: string | null; review_reason: string | null; reviewed_at: string | null
  created_at: string; updated_at: string
}
export function draftLabel(id: string) { return `BOR-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}` }
export function draftEditorSignature(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(draftEditorSignature).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${draftEditorSignature(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export function draftInvoicePayload(state: DraftEditorState, fiscal: Record<string, unknown>, pointOfSale: string) {
  return {
    invoice_type: 'Factura', cliente_id: state.clienteId || null, issue_date: state.issueDate || null,
    due_date: state.dueDate || null, currency: state.currency, exchange_rate: state.exchangeRate.trim() ? Number(state.exchangeRate) : null,
    notes: state.notes || null, point_of_sale: pointOfSale || null,
    line_discounts: Object.fromEntries(state.items.filter(item => item.source_pricing_item_id).map(item => [item.source_pricing_item_id!, Number(item.discount_amount || 0)])),
    line_accounts: Object.fromEntries(state.items.filter(item => item.source_pricing_item_id && item.income_account_id).map(item => [item.source_pricing_item_id!, item.income_account_id])), ...fiscal,
  }
}
export function draftItemPayload(items: DraftEditorItem[]) {
  return items.map((item, sort_order) => ({ description: item.description.trim(), quantity: Number(item.quantity) || 0,
    unit_price: Number(item.unit_price) || 0, discount_amount: Number(item.discount_amount || 0), isv_rate: item.isv_rate,
    tax_treatment: item.tax_treatment, income_account_id: item.income_account_id || null, sort_order }))
}
export function draftEditorFromInvoice(invoice: Record<string, unknown>, items: Record<string, unknown>[], options: InvoiceFiscalOptionsValue, date: string): DraftEditorState {
  const reference = invoice.reference_equivalence as { currency?: string; rate?: number; operation?: 'multiply' | 'divide' } | null
  return { invoiceType: 'Factura', clienteId: String(invoice.cliente_id || ''), quotationId: '', issueDate: date, dueDate: '',
    currency: String(invoice.currency || 'HNL'), exchangeRate: String(invoice.exchange_rate || 1), notes: String(invoice.notes || ''), motivo: '', sourceCurrency: '',
    fiscalOptions: { ...options, mode: (invoice.fiscal_mode as InvoiceFiscalOptionsValue['mode']) || 'Mixta', order: String(invoice.orden_compra_exenta || ''), registry: String(invoice.no_constancia_exonerado || ''), sag: String(invoice.no_registro_sag || ''), documents: (invoice.exoneration_documents as InvoiceFiscalOptionsValue['documents']) || [], referenceEnabled: Boolean(reference), referenceCurrency: reference?.currency || options.referenceCurrency, referenceRate: reference?.rate ? String(reference.rate) : '', referenceOperation: reference?.operation || 'divide' },
    items: items.map(item => ({ id: String(item.id), description: String(item.description || ''), quantity: String(item.quantity ?? ''), unit_price: String(item.unit_price ?? ''), discount_amount: String(item.discount_amount || 0), amount: Number(item.amount || 0), isv_rate: Number(item.isv_rate || 0) as 0 | 15 | 18, tax_treatment: item.tax_treatment as TaxTreatment | undefined, income_account_id: String(item.income_account_id || '') })),
  }
}
