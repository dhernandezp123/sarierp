import { browserRequestStorage, requestKey, pendingRequestKey, completeRequest } from './pending-request'
import { formatDate, formatMoney } from './format'
import { readAllReportRows } from './report-query'
import type { SupabaseClient } from '@supabase/supabase-js'

export type SupplierPaymentStatus = 'Aplicado' | 'Reversado'
type Amount = number | string | null

// Contrato de supplier_payable_balances; nunca volver a derivar saldos de embeds.
export type SupplierPayable = {
  id: string; tenant_id: string; proveedor_id: string
  descripcion: string; numero_factura_proveedor: string | null
  monto: Amount; moneda: string; tipo: 'AP'; parent_ap_id: null
  fecha_factura: string | null; fecha_vencimiento: string | null
  stored_status: string; status: string; notas: string | null; documento_url: string | null
  created_at: string
  cancellation_reason: string | null; cancelled_at: string | null
  proveedores: { id: string; nombre: string; tipo: string; terminos_pago: number } | null
  quotations: { id: string; quotation_number: string | null } | null
  bookings: { id: string; booking_number: string | null } | null
  credit_notes: Amount; debit_notes: Amount; total_adjusted: Amount
  paid_total: Amount; pending_balance: Amount; paid_this_month: Amount
  days_overdue: number; as_of_date: string
  has_inconsistent_movements: boolean; has_negative_obligation: boolean
  has_overpayment: boolean; needs_reconciliation: boolean
}

export function supplierAmount(value: Amount | undefined): number | null {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

export function formatSupplierAmount(value: Amount | undefined, currency: string) {
  const amount = supplierAmount(value)
  return amount === null ? 'Por conciliar' : formatMoney(amount, currency)
}

export function supplierPayableIssue(row: SupplierPayable): string {
  if (row.has_inconsistent_movements) return 'Movimientos inconsistentes: conciliar moneda, proveedor o monto.'
  if (row.has_negative_obligation) return 'Las notas superan la obligacion original.'
  if (row.has_overpayment) return 'Sobrepago: ' + formatSupplierAmount(-(supplierAmount(row.pending_balance) ?? 0), row.moneda)
  if (row.needs_reconciliation) return 'Cuenta anulada con movimientos activos: requiere conciliacion.'
  return ''
}

export function supplierPayableOpenAmount(row: SupplierPayable): number {
  const balance = supplierAmount(row.pending_balance)
  return row.status !== 'Anulada' && !row.has_inconsistent_movements && !row.has_negative_obligation
    && balance !== null && balance > 0 ? balance : 0
}

export function supplierPayableSummary(rows: SupplierPayable[], currency: string) {
  const matching = rows.filter(row => row.moneda === currency)
  const sum = (get: (row: SupplierPayable) => number) => matching.reduce((total, row) => total + Math.round(get(row) * 100), 0) / 100
  return {
    pending: sum(supplierPayableOpenAmount),
    overdue: sum(row => row.days_overdue > 0 ? supplierPayableOpenAmount(row) : 0),
    paidThisMonth: sum(row => supplierAmount(row.paid_this_month) ?? 0),
    overpaid: sum(row => row.has_overpayment ? -(supplierAmount(row.pending_balance) ?? 0) : 0),
    reconciliationCount: matching.filter(row => row.needs_reconciliation).length,
  }
}

// Las mismas filas alimentan tabla, CSV y PDF del reporte financiero.
export function supplierPayableReportRow(row: SupplierPayable) {
  return {
    __key: row.id, __href: '/accounts-payable/' + row.id,
    __date: row.fecha_vencimiento || row.fecha_factura || '',
    __client: row.proveedores?.nombre || 'Sin proveedor', __status: row.status, __currency: row.moneda,
    __amount: supplierPayableOpenAmount(row),
    __overpayment: row.has_overpayment ? -(supplierAmount(row.pending_balance) ?? 0) : 0,
    __reconciliation: row.needs_reconciliation ? 1 : 0,
    proveedor: row.proveedores?.nombre || 'Sin proveedor', tipo: row.proveedores?.tipo || '-',
    factura: row.numero_factura_proveedor || '-', cotizacion: row.quotations?.quotation_number || '-',
    descripcion: row.descripcion, vencimiento: formatDate(row.fecha_vencimiento), estado: row.status,
    base: formatSupplierAmount(row.monto, row.moneda),
    notas: 'NC ' + formatSupplierAmount(row.credit_notes, row.moneda) + ' / ND ' + formatSupplierAmount(row.debit_notes, row.moneda),
    ajustado: formatSupplierAmount(row.total_adjusted, row.moneda),
    pagado: formatSupplierAmount(row.paid_total, row.moneda), saldo: formatSupplierAmount(row.pending_balance, row.moneda),
    revision: supplierPayableIssue(row) || '-',
  }
}

export async function loadSupplierPayables(client: Pick<SupabaseClient, 'from'>, { supplierId, isCurrent = () => true }: {
  supplierId?: string; isCurrent?: () => boolean
} = {}): Promise<SupplierPayable[]> {
  const rows = await readAllReportRows((from, to) => {
    const query = client.from('supplier_payable_balances').select('*').order('id')
    return (supplierId ? query.eq('proveedor_id', supplierId) : query).range(from, to)
  }, { label: 'saldos de proveedores', isCurrent })
  return rows as SupplierPayable[]
}

export function appliedSupplierPayments<T extends { status: string }>(payments: T[] | null | undefined): T[] {
  return (payments || []).filter(payment => payment.status === 'Aplicado')
}

// Mantener nombres y namespace existentes para las solicitudes financieras.
export function supplierActionKey(scope: string, storage = browserRequestStorage(), generate = () => crypto.randomUUID()) {
  return requestKey(`sari:supplier-action:${scope}`, storage, generate)
}
export function pendingSupplierActionKey(scope: string, storage = browserRequestStorage()) {
  return pendingRequestKey(`sari:supplier-action:${scope}`, storage)
}
export function completeSupplierAction(scope: string, confirmedKey: string, storage = browserRequestStorage()) {
  completeRequest(`sari:supplier-action:${scope}`, confirmedKey, storage)
}
