'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, CheckCircle2, Send, DollarSign, XCircle, Plus, Trash2, Download, MinusCircle, PlusCircle, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { primaryButtonClass, secondaryButtonClass, cardClass, fieldClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { InvoicePdf, type InvoicePdfData } from '@/src/components/pdf/invoice-pdf'

type Invoice = {
  id: string
  invoice_number: string | null
  invoice_type: 'Proforma' | 'Factura'
  status: string
  quotation_id: string | null
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_direccion: string | null
  cliente_email: string | null
  issue_date: string | null
  due_date: string | null
  paid_date: string | null
  subtotal: number
  tax_rate: number
  tax_amount: number
  total: number
  currency: string
  exchange_rate: number
  total_lps: number | null
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  // SAR fields
  cai: string | null
  rango_desde: string | null
  rango_hasta: string | null
  fecha_limite_emision: string | null
  lugar_emision: string | null
  es_exonerado: boolean
  orden_compra_exenta: string | null
  no_constancia_exonerado: string | null
  no_registro_sag: string | null
  isv_18_amount: number
  importe_exento: number
  importe_exonerado: number
  // NC/ND fields
  parent_invoice_id: string | null
  motivo: string | null
  parent_invoice?: { invoice_number: string | null } | null
}

type LinkedNote = {
  id: string
  invoice_number: string | null
  invoice_type: string
  status: string
  total: number
  currency: string
  issue_date: string | null
  motivo: string | null
}

type CompanySettings = {
  legal_name: string | null
  trade_name: string | null
  rtn: string | null
  address: string | null
  phone: string | null
  email: string | null
  invoice_footer_note: string | null
}

type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  sort_order: number
}

type Payment = {
  id: string
  amount: number
  currency: string
  payment_date: string
  payment_method: string | null
  reference: string | null
  notes: string | null
}

const STATUS_FLOW: Record<string, { next: string; label: string; icon: React.ReactNode } | null> = {
  Borrador: { next: 'Enviada', label: 'Marcar como enviada', icon: <Send className="h-4 w-4" /> },
  Enviada: { next: 'Aprobada', label: 'Registrar aprobación', icon: <CheckCircle2 className="h-4 w-4" /> },
  Aprobada: { next: 'Pagada', label: 'Registrar pago', icon: <DollarSign className="h-4 w-4" /> },
  Pagada: null,
  Vencida: null,
  Anulada: null,
}

const STATUS_COLOR: Record<string, string> = {
  Borrador: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Enviada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Aprobada: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Vencida: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  Anulada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('T')[0].split('-')
  return `${day}/${m}/${y}`
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-2 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-white">{value || '—'}</span>
    </div>
  )
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [linkedNotes, setLinkedNotes] = useState<LinkedNote[]>([])
  const [companySetting, setCompanySetting] = useState<CompanySettings | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payMethod, setPayMethod] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    setLoading(true)
    const [invRes, itemsRes, paymentsRes, settingsRes, notesRes] = await Promise.all([
      supabase.from('invoices').select('*, parent_invoice:parent_invoice_id(invoice_number)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
      supabase.from('invoice_payments').select('*').eq('invoice_id', id).order('payment_date', { ascending: false }),
      supabase.from('company_settings').select('legal_name, trade_name, rtn, address, phone, email, invoice_footer_note').limit(1).single(),
      supabase.from('invoices').select('id, invoice_number, invoice_type, status, total, currency, issue_date, motivo').eq('parent_invoice_id', id).order('created_at'),
    ])

    if (invRes.error) { toast.error('Factura no encontrada'); router.push('/invoicing'); return }
    setInvoice(invRes.data as Invoice)
    setItems((itemsRes.data || []) as InvoiceItem[])
    setPayments((paymentsRes.data || []) as Payment[])
    setLinkedNotes((notesRes.data || []) as LinkedNote[])
    if (!settingsRes.error) setCompanySetting(settingsRes.data as CompanySettings)
    setLoading(false)
  }

  const advanceStatus = async () => {
    if (!invoice) return
    const flow = STATUS_FLOW[invoice.status]
    if (!flow) return
    setAdvancing(true)
    const updateData: Record<string, string | null> = { status: flow.next }
    if (flow.next === 'Pagada') updateData.paid_date = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('invoices').update(updateData).eq('id', invoice.id)
    if (error) { toast.error(error.message); setAdvancing(false); return }
    toast.success(`Estado actualizado: ${flow.next}`)
    fetchAll()
    setAdvancing(false)
  }

  const cancelInvoice = async () => {
    if (!invoice) return
    setCancelling(true)
    const { error } = await supabase.from('invoices').update({ status: 'Anulada' }).eq('id', invoice.id)
    if (error) { toast.error(error.message); setCancelling(false); return }
    toast.success('Factura anulada')
    fetchAll()
    setCancelling(false)
  }

  const savePayment = async () => {
    if (!invoice || !payAmount || !payDate) { toast.error('Monto y fecha son requeridos'); return }
    setSavingPayment(true)
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: invoice.id,
      amount: parseFloat(payAmount),
      currency: invoice.currency,
      payment_date: payDate,
      payment_method: payMethod || null,
      reference: payRef || null,
      notes: payNotes || null,
      created_by: user?.id || null,
    })
    if (error) { toast.error(error.message); setSavingPayment(false); return }
    toast.success('Pago registrado')
    setShowPaymentModal(false)
    setPayAmount(''); setPayMethod(''); setPayRef(''); setPayNotes('')
    fetchAll()
    setSavingPayment(false)
  }

  const deletePayment = async (payId: string) => {
    const { error } = await supabase.from('invoice_payments').delete().eq('id', payId)
    if (error) { toast.error(error.message); return }
    toast.success('Pago eliminado')
    fetchAll()
  }

  if (loading || !invoice) return <PageSkeleton cards={2} rows={4} />

  const flow = STATUS_FLOW[invoice.status]
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0)
  const pending = invoice.total - paidTotal

  const gravado18 = invoice.subtotal - invoice.importe_exento - invoice.importe_exonerado - Math.max(0, invoice.subtotal - invoice.importe_exento - invoice.importe_exonerado - (invoice.isv_18_amount > 0 ? invoice.isv_18_amount / 0.18 : 0))
  const isv15 = invoice.tax_amount - invoice.isv_18_amount
  const gravado15 = isv15 > 0 ? isv15 / 0.15 : (invoice.subtotal - invoice.importe_exento - invoice.importe_exonerado)

  const pdfData: InvoicePdfData = {
    invoice_number: invoice.invoice_number || '',
    invoice_type: invoice.invoice_type as 'Factura' | 'Proforma' | 'Nota de Crédito' | 'Nota de Débito',
    status: invoice.status,
    issue_date: invoice.issue_date || '',
    due_date: invoice.due_date,
    currency: invoice.currency,
    exchange_rate: invoice.exchange_rate,
    notes: invoice.notes,
    cliente_nombre: invoice.cliente_nombre,
    cliente_rtn: invoice.cliente_rtn,
    cliente_direccion: invoice.cliente_direccion,
    cliente_email: invoice.cliente_email,
    items: items.map((it) => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, amount: it.amount, isv_rate: 15 })),
    subtotal: invoice.subtotal,
    tax_amount: invoice.tax_amount,
    total: invoice.total,
    total_lps: invoice.total_lps,
    importe_exento: invoice.importe_exento || 0,
    importe_exonerado: invoice.importe_exonerado || 0,
    isv_15_amount: isv15,
    isv_18_amount: invoice.isv_18_amount || 0,
    gravado_15: gravado15,
    gravado_18: invoice.isv_18_amount > 0 ? invoice.isv_18_amount / 0.18 : 0,
    es_exonerado: invoice.es_exonerado || false,
    orden_compra_exenta: invoice.orden_compra_exenta,
    no_constancia_exonerado: invoice.no_constancia_exonerado,
    no_registro_sag: invoice.no_registro_sag,
    parent_invoice_number: invoice.parent_invoice?.invoice_number ?? null,
    motivo: invoice.motivo ?? null,
    cai: invoice.cai,
    rango_desde: invoice.rango_desde,
    rango_hasta: invoice.rango_hasta,
    fecha_limite_emision: invoice.fecha_limite_emision,
    lugar_emision: invoice.lugar_emision,
    company_legal_name: companySetting?.legal_name || 'SARI EXPRESS S DE R.L. DE C.V.',
    company_trade_name: companySetting?.trade_name || null,
    company_rtn: companySetting?.rtn || null,
    company_address: companySetting?.address || null,
    company_phone: companySetting?.phone || null,
    company_email: companySetting?.email || null,
    company_invoice_footer: companySetting?.invoice_footer_note || null,
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Facturación', href: '/invoicing' },
          { label: invoice.invoice_number || 'Detalle de factura' },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <button type="button" onClick={() => router.push('/invoicing')} className={secondaryButtonClass}>
            <ChevronLeft className="h-4 w-4" />
            Volver
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
              {invoice.invoice_type}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              {invoice.invoice_number || 'Sin número'}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[invoice.status] || ''}`}>
                {invoice.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {flow && (
            <button
              type="button"
              onClick={flow.next === 'Pagada' ? () => setShowPaymentModal(true) : advanceStatus}
              disabled={advancing}
              className={primaryButtonClass}
            >
              {flow.icon}
              {flow.label}
            </button>
          )}
          <PDFDownloadLink
            document={<InvoicePdf data={pdfData} />}
            fileName={`${invoice.invoice_type}-${invoice.invoice_number || id}.pdf`}
          >
            {({ loading: pdfLoading }) => (
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={pdfLoading}
              >
                <Download className="h-4 w-4" />
                {pdfLoading ? 'Generando...' : 'Descargar PDF'}
              </button>
            )}
          </PDFDownloadLink>
          {invoice.invoice_type === 'Factura' && !['Anulada'].includes(invoice.status) && (
            <>
              <button
                type="button"
                onClick={() => router.push(`/invoicing/new?parent=${invoice.id}&doc_type=nc`)}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
              >
                <MinusCircle className="h-4 w-4" />
                Nota de Crédito
              </button>
              <button
                type="button"
                onClick={() => router.push(`/invoicing/new?parent=${invoice.id}&doc_type=nd`)}
                className="inline-flex items-center gap-2 rounded-xl border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
              >
                <PlusCircle className="h-4 w-4" />
                Nota de Débito
              </button>
            </>
          )}
          {!['Pagada', 'Anulada'].includes(invoice.status) && (
            <button
              type="button"
              onClick={cancelInvoice}
              disabled={cancelling}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <XCircle className="h-4 w-4" />
              Anular
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Left: items + payments */}
        <div className="space-y-6 xl:col-span-2">
          {/* Line items */}
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Líneas de factura</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="pb-2 pr-4">Descripción</th>
                    <th className="pb-2 pr-4 text-right">Qty</th>
                    <th className="pb-2 pr-4 text-right">Precio unit.</th>
                    <th className="pb-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2.5 pr-4 text-slate-700 dark:text-slate-300">{it.description}</td>
                      <td className="pr-4 text-right">{it.quantity}</td>
                      <td className="pr-4 text-right">{invoice.currency} {it.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="text-right font-medium">{invoice.currency} {it.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 dark:border-slate-600">
                    <td colSpan={3} className="py-2.5 pr-4 text-right text-sm text-slate-500">Subtotal</td>
                    <td className="text-right font-medium">{invoice.currency} {invoice.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pr-4 text-right text-sm text-slate-500">ISV ({invoice.tax_rate}%)</td>
                    <td className="text-right font-medium">{invoice.currency} {invoice.tax_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                  <tr className="border-t-2 border-slate-900 dark:border-white">
                    <td colSpan={3} className="py-2.5 pr-4 text-right font-bold text-slate-900 dark:text-white">TOTAL</td>
                    <td className="text-right text-lg font-bold text-slate-900 dark:text-white">
                      {invoice.currency} {invoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  {invoice.currency === 'USD' && invoice.total_lps && (
                    <tr>
                      <td colSpan={3} className="pr-4 text-right text-xs text-slate-400">≈ HNL (TC {invoice.exchange_rate})</td>
                      <td className="text-right text-xs text-slate-400">
                        HNL {invoice.total_lps.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </section>

          {/* Payments */}
          <section className={cardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Pagos registrados</h2>
              {!['Anulada'].includes(invoice.status) && (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Registrar pago
                </button>
              )}
            </div>

            {payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Sin pagos registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="pb-2 pr-4">Fecha</th>
                      <th className="pb-2 pr-4">Método</th>
                      <th className="pb-2 pr-4">Referencia</th>
                      <th className="pb-2 text-right">Monto</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2.5 pr-4">{formatDate(p.payment_date)}</td>
                        <td className="pr-4 text-slate-600 dark:text-slate-400">{p.payment_method || '—'}</td>
                        <td className="pr-4 text-slate-600 dark:text-slate-400">{p.reference || '—'}</td>
                        <td className="text-right font-semibold text-emerald-700 dark:text-emerald-400">
                          {p.currency} {p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => deletePayment(p.id)}
                            className="ml-2 rounded p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {payments.length > 0 && (
              <div className="mt-4 flex justify-end gap-8 border-t border-slate-200 pt-3 dark:border-slate-700 text-sm">
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total pagado</p>
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">
                    {invoice.currency} {paidTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Saldo pendiente</p>
                  <p className={`font-bold ${pending <= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {invoice.currency} {Math.max(0, pending).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right col: info */}
        <div className="space-y-4">
          <section className={cardClass}>
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Datos del documento</h3>
            <InfoRow label="Número" value={invoice.invoice_number} />
            <InfoRow label="Tipo" value={invoice.invoice_type} />
            <InfoRow label="Estado" value={invoice.status} />
            <InfoRow label="Emisión" value={formatDate(invoice.issue_date)} />
            <InfoRow label="Vencimiento" value={formatDate(invoice.due_date)} />
            {invoice.paid_date && <InfoRow label="Pagado el" value={formatDate(invoice.paid_date)} />}
          </section>

          <section className={cardClass}>
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Cliente</h3>
            <p className="font-semibold text-slate-900 dark:text-white">{invoice.cliente_nombre || '—'}</p>
            {invoice.cliente_rtn && <p className="mt-1 text-xs text-slate-500">RTN: {invoice.cliente_rtn}</p>}
            {invoice.cliente_direccion && <p className="mt-1 text-xs text-slate-500">{invoice.cliente_direccion}</p>}
            {invoice.cliente_email && <p className="mt-1 text-xs text-slate-500">{invoice.cliente_email}</p>}
          </section>

          {invoice.notes && (
            <section className={cardClass}>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Notas</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{invoice.notes}</p>
            </section>
          )}

          {/* Factura original (cuando este doc es NC/ND) */}
          {invoice.parent_invoice_id && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-950/20">
              <div className="mb-2 flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                  Emitida contra
                </p>
              </div>
              {invoice.motivo && (
                <p className="mb-2 text-xs italic text-slate-600 dark:text-slate-400">{invoice.motivo}</p>
              )}
              <button
                type="button"
                onClick={() => router.push(`/invoicing/${invoice.parent_invoice_id}`)}
                className="text-sm font-semibold text-blue-600 underline dark:text-blue-400"
              >
                Ver factura original →
              </button>
            </section>
          )}

          {/* Notas vinculadas (NC/ND) — solo para Facturas */}
          {linkedNotes.length > 0 && (
            <section className={cardClass}>
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Notas vinculadas</h3>
              <div className="space-y-2">
                {linkedNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => router.push(`/invoicing/${note.id}`)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <div>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold mr-2 ${
                        note.invoice_type === 'Nota de Crédito'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                      }`}>
                        {note.invoice_type === 'Nota de Crédito' ? 'NC' : 'ND'}
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {note.invoice_number || 'Sin número'}
                      </span>
                      <span className="ml-2 text-xs text-slate-500">{formatDate(note.issue_date)}</span>
                    </div>
                    <span className={`font-semibold ${note.invoice_type === 'Nota de Crédito' ? 'text-rose-600 dark:text-rose-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      {note.invoice_type === 'Nota de Crédito' ? '-' : '+'}{note.currency} {note.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </button>
                ))}
              </div>
              {/* Balance efectivo */}
              {invoice.invoice_type === 'Factura' && (
                <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500 dark:text-slate-400">Factura original</span>
                    <span>{invoice.currency} {invoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {linkedNotes.map((note) => (
                    <div key={note.id} className="flex justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{note.invoice_type === 'Nota de Crédito' ? 'Crédito' : 'Débito'}</span>
                      <span className={note.invoice_type === 'Nota de Crédito' ? 'text-rose-600' : 'text-orange-600'}>
                        {note.invoice_type === 'Nota de Crédito' ? '-' : '+'}{note.currency} {note.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-700">
                    <span>Balance efectivo</span>
                    <span className="text-slate-900 dark:text-white">
                      {invoice.currency} {(
                        invoice.total +
                        linkedNotes.reduce((s, n) => s + (n.invoice_type === 'Nota de Débito' ? n.total : -n.total), 0)
                      ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </section>
          )}

          {invoice.quotation_id && (
            <button
              type="button"
              onClick={() => router.push(`/quotations/${invoice.quotation_id}`)}
              className={`w-full ${secondaryButtonClass}`}
            >
              Ver cotización vinculada
            </button>
          )}
        </div>
      </div>

      {/* Payment modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-[#0b1220]">
            <div className="border-b border-slate-200 p-5 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Registrar pago</h2>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Monto ({invoice.currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`Ej. ${invoice.total.toFixed(2)}`}
                  min="0"
                  step="0.01"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Fecha de pago <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Método de pago
                </label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={fieldClass}>
                  <option value="">Seleccionar...</option>
                  <option value="Transferencia">Transferencia bancaria</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Referencia / No. de transacción
                </label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Notas
                </label>
                <textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  rows={2}
                  className={`${fieldClass} resize-none`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={savePayment}
                disabled={savingPayment}
                className={primaryButtonClass}
              >
                {savingPayment ? 'Guardando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
