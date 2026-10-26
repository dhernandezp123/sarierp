import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllReportRows, readReportRowsByIds } from './report-query'
import type { BillingQueueRow } from './billing-readiness'

export type InvoiceType = 'Proforma' | 'Factura' | 'Nota de Crédito' | 'Nota de Débito'

export type Invoice = {
  id: string
  invoice_number: string | null
  point_of_sale?: string | null
  invoice_type: InvoiceType
  status: string
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_email: string | null
  issue_date: string | null
  due_date: string | null
  payment_condition: string | null
  credit_days: number | null
  total: number
  currency: string
  quotation_id: string | null
  parent_invoice_id: string | null
  invoice_payments: Array<{
    amount: number
    currency: string
    payment_date: string
    status: 'Aplicado' | 'Reversado'
  }> | null
}

export type ReceivableSummary = {
  invoice_id: string
  currency: string
  original_total: number
  credit_notes: number
  debit_notes: number
  adjusted_total: number
  balance: number
  paid_total: number
  stored_status: string
  receivable_status: string
  days_overdue: number
}

export async function loadInvoiceList(client: Pick<SupabaseClient, 'from' | 'rpc'>, isCurrent = () => true) {
  const [invoiceRows, receivables, queue] = await Promise.all([
    readAllReportRows((from, to) => client.from('invoices')
      .select('id, invoice_number, point_of_sale, invoice_type, status, cliente_id, cliente_nombre, cliente_rtn, cliente_email, issue_date, due_date, payment_condition, credit_days, total, currency, quotation_id, parent_invoice_id')
      .is('deleted_at', null).order('created_at', { ascending: false }).order('id').range(from, to),
    { label: 'facturas', isCurrent }) as Promise<Omit<Invoice, 'invoice_payments'>[]>,
    readAllReportRows<ReceivableSummary>((from, to) => client.from('invoice_receivables')
      .select('invoice_id, currency, original_total, credit_notes, debit_notes, adjusted_total, balance, paid_total, stored_status, receivable_status, days_overdue')
      .order('invoice_id').range(from, to), { label: 'saldos de facturas', key: 'invoice_id', isCurrent }),
    readAllReportRows<BillingQueueRow>((from, to) => client.rpc('get_billing_work_queue')
      .order('quotation_id').range(from, to), { label: 'cola por facturar', key: 'quotation_id', isCurrent })
      .then(data => ({ data, error: '' }))
      .catch(error => ({ data: [] as BillingQueueRow[], error: error instanceof Error ? error.message : 'No se pudo cargar la cola por facturar.' })),
  ])
  const invoiceIds = new Set(invoiceRows.map(row => row.id))
  const balances = new Map(receivables.map(row => [row.invoice_id, row]))
  if (receivables.some(row => !invoiceIds.has(row.invoice_id)) || invoiceRows.some(row =>
    row.invoice_type === 'Factura' && !['Borrador', 'Anulada'].includes(row.status) && !balances.has(row.id))) {
    throw new Error('Las facturas y sus saldos cambiaron durante la carga. Reintenta la consulta.')
  }
  type Payment = NonNullable<Invoice['invoice_payments']>[number] & { id: string; invoice_id: string }
  const payments = await readReportRowsByIds<Payment>([...invoiceIds], (batch, from, to) => client.from('invoice_payments')
    .select('id, invoice_id, amount, currency, payment_date, status').in('invoice_id', batch).order('id').range(from, to),
  { label: 'cobros de facturas', isCurrent })
  const grouped = new Map<string, Payment[]>()
  for (const payment of payments) { const rows = grouped.get(payment.invoice_id) || []; rows.push(payment); grouped.set(payment.invoice_id, rows) }
  return {
    invoices: invoiceRows.map(row => ({ ...row, status: balances.get(row.id)?.receivable_status || row.status, invoice_payments: grouped.get(row.id) || [] })),
    receivables, workQueue: queue.data, workQueueError: queue.error,
  }
}
