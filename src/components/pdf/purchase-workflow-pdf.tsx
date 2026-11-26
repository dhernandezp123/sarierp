import { FiscalDocumentLayout, type FiscalLayoutData } from './FiscalDocumentLayout'
import { purchaseWorkflowAmounts, type PurchaseWorkflowDocument } from '@/src/lib/purchase-workflow'
import { formatDate, formatMoney } from '@/src/lib/format'

export function PurchaseWorkflowPdf({ data, logo }: { data: PurchaseWorkflowDocument; logo?: string | null }) {
  const totals = purchaseWorkflowAmounts(data.items, data.fiscal_mode, true)
  const layout: FiscalLayoutData = {
    title: data.kind === 'Solicitud' ? 'SOLICITUD DE COMPRA' : 'ORDEN DE COMPRA',
    number: data.document_number, status: data.status, issue_date: data.issue_date, due_date: data.due_date,
    issuer: data.issuer_snapshot || { legal_name: 'Sari Express' },
    party_label: 'PROVEEDOR', party: { name: data.supplier_snapshot.name || 'Por definir', identity: data.supplier_snapshot.rtn,
      address: data.supplier_snapshot.address, phone: data.supplier_snapshot.phone, email: data.supplier_snapshot.email },
    currency: data.currency, total_currency: data.currency, total: Number(data.total),
    lines: data.items.map(line => ({ description: line.description, quantity: Number(line.quantity), unit_price: Number(line.unit_price),
      discount: Number(line.discount_amount), tax: line.tax_treatment === 'Gravada' ? `${line.tax_rate}%` : line.tax_treatment,
      amount: Number(line.amount) + Number(line.tax) })),
    totals: [{ label: 'Subtotal antes de descuentos', value: totals.subtotal + totals.discounts },
      { label: 'Descuentos y rebajas', value: totals.discounts }, { label: 'Importe exonerado', value: totals.exonerated },
      { label: 'Importe exento', value: totals.exempt }, { label: 'Importe gravado 15%', value: totals.taxable15 },
      { label: 'Importe gravado 18%', value: totals.taxable18 }, { label: 'ISV 15%', value: totals.tax15 }, { label: 'ISV 18%', value: totals.tax18 }],
    conditions: [`Estado: ${data.status}`, `Condición de pago: ${data.payment_condition === 'Credito' ? 'Crédito' : 'Contado'}`,
      `Medio de pago previsto: ${data.payment_method || 'Por definir'}${data.payment_reference ? ` · ${data.payment_reference}` : ''}`,
      ...(data.supplier_reference ? [`Referencia de cotización / factura: ${data.supplier_reference}`] : []),
      ...(data.supplier_cai ? [`CAI del proveedor (referencia): ${data.supplier_cai}`] : []),
      ...(data.approved_at ? [`Aprobada: ${formatDate(data.approved_at)}`] : []),
      'Este documento no constituye factura, comprobante de pago ni crédito fiscal.'],
    notes: data.commercial_notes,
    equivalence: data.currency === 'USD' ? `Equivalencia informativa: ${formatMoney(Number(data.total) * Number(data.exchange_rate), 'HNL')} · T/C ${data.exchange_rate}` : null,
    fiscal: null, footer_note: 'Documento comercial · Numeración interna', copy_legend: 'Compras · Documento no fiscal',
  }
  return FiscalDocumentLayout({ data: layout, logo: logo || data.issuer_snapshot?.logo_url })
}
