import type { ReportPdfData } from '@/src/components/pdf/report-pdf'
import { formatDate, formatDateTime } from './format'

export type FiscalDocumentTable = 'invoices' | 'purchase_documents' | 'withholding_documents'
export type FiscalVoidRequest = {
  id: string; document_id: string; document_table: FiscalDocumentTable
  document_type: string; document_number: string; cai: string | null; point_of_sale: string | null
  issue_date: string | null; currency: string; total: number; reason: string
  status: 'Pendiente' | 'Aprobada' | 'Rechazada'; requested_at: string; requested_by: string; requested_by_name: string
  reviewed_at: string | null; reviewed_by_name: string | null; review_reason: string | null
  accounting_result: 'Reversado' | 'Sin asiento previo' | 'No fiscal' | null
  original_entry_id: string | null; reversal_entry_id: string | null; originals_confirmed: boolean
  document_snapshot?: { document: { payable_id?: string }; items?: { description?: string; quantity?: number; amount?: number }[] }
}
type FinanceProfile = { id: string; tenant_id?: string | null; rol: string; status: string; is_active: boolean }
export function canRequestFiscalVoid(profile: FinanceProfile | null, userId?: string) {
  return !!profile && !!userId && profile.id === userId && !!profile.tenant_id && profile.status === 'Aprobado'
    && profile.is_active && ['Admin', 'Finanzas', 'Contabilidad'].includes(profile.rol)
}
export function canReviewFiscalVoid(profile: FinanceProfile | null, userId?: string) {
  return canRequestFiscalVoid(profile, userId) && profile?.rol === 'Contabilidad'
}
export function fiscalVoidDocumentHref(row: FiscalVoidRequest) {
  return row.document_table === 'invoices' ? `/invoicing/${row.document_id}`
    : `/accounting/purchases?document=${row.document_id}&table=${row.document_table}`
}
export function fiscalVoidReport(rows: FiscalVoidRequest[], filters: string[]): ReportPdfData {
  return {
    title: 'Registro de solicitudes de anulación', subtitle: 'Documentos conservados y decisiones de Contabilidad',
    generatedAt: formatDateTime(new Date()), filters,
    metrics: ['Pendiente', 'Aprobada', 'Rechazada'].map(status => ({ label: status, value: String(rows.filter(r => r.status === status).length) })),
    columns: [
      { key: 'document', label: 'Documento / CAI' }, { key: 'office', label: 'Oficina / emisión' },
      { key: 'amount', label: 'Importe / moneda', align: 'right' }, { key: 'request', label: 'Solicitud' },
      { key: 'decision', label: 'Decisión' }, { key: 'accounting', label: 'Registro contable' },
    ],
    rows: rows.map(r => ({
      document: `${r.document_type} ${r.document_number}\nCAI: ${r.cai || 'No aplica'}`,
      office: `${r.point_of_sale || '—'}\n${formatDate(r.issue_date)}`,
      amount: `${r.currency} ${Number(r.total).toFixed(2)}`,
      request: `${formatDateTime(r.requested_at)} · ${r.requested_by_name}\n${r.reason}`,
      decision: `${r.status}${r.reviewed_at ? ` · ${formatDateTime(r.reviewed_at)} · ${r.reviewed_by_name}\n${r.review_reason}` : ''}`,
      accounting: r.accounting_result ? `${r.accounting_result}${r.original_entry_id ? `\nOriginal: ${r.original_entry_id}` : ''}${r.reversal_entry_id ? `\nReverso: ${r.reversal_entry_id}` : ''}` : 'Sin decisión de anulación',
    })),
  }
}
