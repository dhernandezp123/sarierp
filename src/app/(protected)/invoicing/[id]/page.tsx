'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, CheckCircle2, Send, DollarSign, XCircle, Plus, RotateCcw, Download, MinusCircle, PlusCircle, Link as LinkIcon, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { PDFDownloadLink } from '@react-pdf/renderer'
import { supabase } from '../../../../lib/supabase/client'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { primaryButtonClass, secondaryButtonClass, cardClass, fieldClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { InvoicePdf, type InvoicePdfData } from '@/src/components/pdf/invoice-pdf'
import { ReciboPagoPdf, type ReciboPagoData } from '@/src/components/pdf/recibo-pago-pdf'
import {
  getCompanyDisplayName,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'

type Invoice = {
  id: string
  invoice_number: string | null
  invoice_type: 'Proforma' | 'Factura' | 'Nota de Crédito' | 'Nota de Débito'
  status: string
  quotation_id: string | null
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_direccion: string | null
  cliente_email: string | null
  issue_date: string | null
  due_date: string | null
  payment_condition: 'Contado' | 'Credito' | null
  credit_days: number | null
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
  city: string | null
  lugar_emision_defecto: string | null
  invoice_footer_note: string | null
}

type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  sort_order: number
  isv_rate: number
}

type Payment = {
  id: string
  amount: number
  currency: string
  payment_date: string
  payment_method: string | null
  reference: string | null
  notes: string | null
  status: 'Aplicado' | 'Reversado'
  reversed_at: string | null
  reversed_by: string | null
  reversal_reason: string | null
  invoice_fiscal_type: InvoiceFiscalType | null
  point_of_sale: string | null
  invoice_payment_splits: PaymentSplit[]
}

type InvoiceFiscalType = 'Gravada' | 'Mixta' | 'Exenta' | 'Exonerada' | 'No aplica'
type PaymentMethod = 'Cheque' | 'Deposito' | 'Transferencia' | 'Tarjeta debito' | 'Tarjeta credito' | 'Mixto'
type SplitMethod = Exclude<PaymentMethod, 'Mixto'>

type PaymentSplit = {
  id: string
  payment_method: SplitMethod
  amount: number
  reference: string | null
}

type PaymentSplitInput = {
  enabled: boolean
  amount: string
  reference: string
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Deposito', label: 'Depósito' },
  { value: 'Transferencia', label: 'Transferencia' },
  { value: 'Tarjeta debito', label: 'Tarjeta de débito' },
  { value: 'Tarjeta credito', label: 'Tarjeta de crédito' },
  { value: 'Mixto', label: 'Mixto' },
]

const SPLIT_METHODS: Array<{ value: SplitMethod; label: string }> = PAYMENT_METHODS
  .filter((method): method is { value: SplitMethod; label: string } => method.value !== 'Mixto')

const emptyPaymentSplits = (): Record<SplitMethod, PaymentSplitInput> => ({
  Cheque: { enabled: false, amount: '', reference: '' },
  Deposito: { enabled: false, amount: '', reference: '' },
  Transferencia: { enabled: false, amount: '', reference: '' },
  'Tarjeta debito': { enabled: false, amount: '', reference: '' },
  'Tarjeta credito': { enabled: false, amount: '', reference: '' },
})

function getInvoiceFiscalType(invoice: Invoice): InvoiceFiscalType {
  if (invoice.invoice_type === 'Proforma') return 'No aplica'
  const fiscalComponentCount = [
    Number(invoice.tax_amount) > 0,
    Number(invoice.importe_exento) > 0,
    Number(invoice.importe_exonerado) > 0,
  ].filter(Boolean).length

  if (fiscalComponentCount > 1) return 'Mixta'
  if (invoice.es_exonerado || Number(invoice.importe_exonerado) > 0) return 'Exonerada'
  if (Number(invoice.tax_amount) === 0 && Number(invoice.importe_exento) > 0) return 'Exenta'
  return 'Gravada'
}

function paymentMethodLabel(method: string | null) {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label || method || '—'
}

function paymentReferenceLabel(method: PaymentMethod | SplitMethod | '') {
  if (method === 'Cheque') return 'Número de cheque'
  if (method === 'Deposito') return 'Número de depósito / referencia'
  if (method === 'Transferencia') return 'Número de referencia de transferencia'
  if (method === 'Tarjeta debito' || method === 'Tarjeta credito') {
    return 'Número de voucher / referencia'
  }
  return 'Referencia'
}

type ReceivableSummary = {
  adjusted_total: number
  paid_total: number
  balance: number
  receivable_status: string
  days_overdue: number
}

const STATUS_FLOW: Record<string, { next: string; label: string; icon: React.ReactNode } | null> = {
  Borrador: { next: 'Enviada', label: 'Marcar como enviada', icon: <Send className="h-4 w-4" /> },
  Enviada: { next: 'Aprobada', label: 'Registrar aprobación', icon: <CheckCircle2 className="h-4 w-4" /> },
  Aprobada: { next: 'Pagada', label: 'Registrar pago', icon: <DollarSign className="h-4 w-4" /> },
  'Parcialmente Pagada': { next: 'Pagada', label: 'Registrar pago', icon: <DollarSign className="h-4 w-4" /> },
  Pagada: null,
  Saldada: null,
  Vencida: { next: 'Pagada', label: 'Registrar pago', icon: <DollarSign className="h-4 w-4" /> },
  Anulada: null,
}

const STATUS_COLOR: Record<string, string> = {
  Borrador: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Enviada: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Aprobada: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Parcialmente Pagada': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  Pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Saldada: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
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
  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [linkedNotes, setLinkedNotes] = useState<LinkedNote[]>([])
  const [companySetting, setCompanySetting] = useState<CompanySettings | null>(null)
  const [receivable, setReceivable] = useState<ReceivableSummary | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payFiscalType, setPayFiscalType] = useState<InvoiceFiscalType>('Gravada')
  const [payPointOfSale, setPayPointOfSale] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>('')
  const [paySplits, setPaySplits] = useState<Record<SplitMethod, PaymentSplitInput>>(emptyPaymentSplits)
  const [payRef, setPayRef] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [paymentToReverse, setPaymentToReverse] = useState<Payment | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [reversingPayment, setReversingPayment] = useState(false)
  const [pointsOfSale, setPointsOfSale] = useState<string[]>([])
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [invRes, itemsRes, paymentsRes, settingsRes, notesRes, receivableRes, caiRes] = await Promise.all([
      supabase.from('invoices').select('*, parent_invoice:parent_invoice_id(invoice_number)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
      supabase.from('invoice_payments').select('*, invoice_payment_splits(*)').eq('invoice_id', id).order('payment_date', { ascending: false }),
      supabase.from('company_settings').select('legal_name, trade_name, rtn, address, city, lugar_emision_defecto, phone, email, invoice_footer_note').limit(1).single(),
      supabase.from('invoices').select('id, invoice_number, invoice_type, status, total, currency, issue_date, motivo').eq('parent_invoice_id', id).order('created_at'),
      supabase.from('invoice_receivables').select('adjusted_total, paid_total, balance, receivable_status, days_overdue').eq('invoice_id', id).maybeSingle(),
      supabase.from('cai_ranges').select('lugar_emision').eq('is_active', true).not('lugar_emision', 'is', null),
    ])

    if (invRes.error) { toast.error('Factura no encontrada'); router.push('/invoicing'); return }
    const receivableData = (receivableRes.data as ReceivableSummary | null) ?? null
    setInvoice({
      ...(invRes.data as Invoice),
      status: receivableData?.receivable_status || invRes.data.status,
    })
    setItems((itemsRes.data || []) as InvoiceItem[])
    setPayments((paymentsRes.data || []).map((payment) => ({
      ...payment,
      invoice_payment_splits: payment.invoice_payment_splits || [],
    })) as Payment[])
    setLinkedNotes((notesRes.data || []) as LinkedNote[])
    setReceivable(receivableData)
    const settings = settingsRes.error ? null : settingsRes.data as CompanySettings
    if (!settingsRes.error) {
      setCompanySetting(settings)
    }
    setPointsOfSale(Array.from(new Set([
      invRes.data.lugar_emision,
      ...(caiRes.data || []).map((range) => range.lugar_emision),
      settings?.lugar_emision_defecto,
      settings?.city,
    ].filter((value): value is string => Boolean(value?.trim())))))
    setLoading(false)
  }, [id, router])

  useEffect(() => {
    const timeout = window.setTimeout(() => { void fetchAll() }, 0)
    return () => window.clearTimeout(timeout)
  }, [fetchAll])

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
    if (!invoice || !payAmount || !payDate || !payFiscalType || !payPointOfSale || !payMethod) {
      toast.error('Completa monto, fecha, tipo fiscal, punto de venta y forma de pago')
      return
    }
    const amount = Number(payAmount)
    const currentPaid = payments
      .filter((payment) => payment.status === 'Aplicado')
      .reduce((sum, payment) => sum + Number(payment.amount), 0)
    const currentPending = receivable?.balance
      ?? Math.max(0, Number(invoice.total) - currentPaid)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Ingresa un monto de pago válido')
      return
    }
    if (amount > currentPending) {
      toast.error('El pago no puede superar el saldo pendiente')
      return
    }

    const selectedSplits = SPLIT_METHODS
      .filter(({ value }) => paySplits[value].enabled)
      .map(({ value }) => ({
        payment_method: value,
        amount: Number(paySplits[value].amount),
        reference: paySplits[value].reference.trim() || null,
      }))

    if (payMethod === 'Mixto') {
      if (selectedSplits.length < 2 || selectedSplits.some((split) => !Number.isFinite(split.amount) || split.amount <= 0)) {
        toast.error('El pago mixto requiere al menos dos formas con montos válidos')
        return
      }
      if (selectedSplits.some((split) => !split.reference)) {
        toast.error('Cada forma del pago mixto requiere referencia o voucher')
        return
      }
      const splitTotal = selectedSplits.reduce((sum, split) => sum + split.amount, 0)
      if (Math.abs(splitTotal - amount) > 0.005) {
        toast.error('La suma del desglose mixto debe coincidir con el monto recibido')
        return
      }
    } else if (!payRef.trim()) {
      toast.error(`${paymentReferenceLabel(payMethod)} es requerido`)
      return
    }

    setSavingPayment(true)
    const { data, error } = await supabase.rpc('register_invoice_payment_v2', {
      p_invoice_id: invoice.id,
      p_amount: amount,
      p_currency: invoice.currency,
      p_payment_date: payDate,
      p_invoice_fiscal_type: payFiscalType,
      p_point_of_sale: payPointOfSale,
      p_payment_method: payMethod,
      p_reference: payRef || null,
      p_notes: payNotes || null,
      p_payment_splits: payMethod === 'Mixto' ? selectedSplits : [],
    })
    if (error) { toast.error(error.message); setSavingPayment(false); return }

    toast.success('Pago registrado')
    setShowPaymentModal(false)
    setPayAmount(''); setPayMethod(''); setPaySplits(emptyPaymentSplits()); setPayRef(''); setPayNotes('')
    const paymentId = (data as { payment_id: string }[] | null)?.[0]?.payment_id
    if (invoice.payment_condition === 'Contado' && paymentId) {
      const { data: paymentData } = await supabase
        .from('invoice_payments')
        .select('*, invoice_payment_splits(*)')
        .eq('id', paymentId)
        .single()
      if (paymentData) {
        setReceiptPayment({
          ...paymentData,
          invoice_payment_splits: paymentData.invoice_payment_splits || [],
        } as Payment)
      }
    }
    await fetchAll()
    setSavingPayment(false)
  }

  const openPaymentModal = () => {
    if (!invoice) return

    setPayFiscalType(getInvoiceFiscalType(invoice))
    setPayPointOfSale(invoice.lugar_emision || pointsOfSale[0] || '')
    setPayAmount('')
    setPayMethod('')
    setPaySplits(emptyPaymentSplits())
    setPayRef('')
    setPayNotes('')
    setShowPaymentModal(true)
  }

  const reversePayment = async () => {
    if (!paymentToReverse || !reversalReason.trim()) {
      toast.error('Indica el motivo del reverso')
      return
    }

    setReversingPayment(true)
    const { error } = await supabase.rpc('reverse_invoice_payment', {
      p_payment_id: paymentToReverse.id,
      p_reason: reversalReason.trim(),
    })
    if (error) {
      toast.error(error.message)
      setReversingPayment(false)
      return
    }

    toast.success('Pago reversado; el movimiento permanece en el historial')
    setPaymentToReverse(null)
    setReversalReason('')
    await fetchAll()
    setReversingPayment(false)
  }

  if (loading || !invoice) return <PageSkeleton cards={2} rows={4} />

  const makeReceiptData = (p: Payment): ReciboPagoData => ({
    recibo_numero: `REC-${p.id.split('-')[0].toUpperCase()}`,
    empresa: companySetting?.legal_name || companySetting?.trade_name || 'Sari Express',
    empresa_rtn: companySetting?.rtn ?? null,
    empresa_dir: companySetting?.address ?? null,
    empresa_tel: companySetting?.phone ?? null,
    factura_numero: invoice.invoice_number,
    factura_tipo: invoice.invoice_type,
    cliente_nombre: invoice.cliente_nombre,
    cliente_rtn: invoice.cliente_rtn,
    monto: p.amount,
    currency: p.currency,
    fecha_pago: p.payment_date,
    metodo: paymentMethodLabel(p.payment_method),
    referencia: p.reference,
    notas: p.notes,
    tipo_fiscal: p.invoice_fiscal_type,
    punto_venta: p.point_of_sale,
    condicion_pago: invoice.payment_condition === 'Credito' ? 'Crédito' : invoice.payment_condition,
    dias_credito: invoice.credit_days,
    desglose: p.invoice_payment_splits.map((split) => ({
      ...split,
      payment_method: paymentMethodLabel(split.payment_method),
    })),
  })

  const isAdjustmentNote = ['Nota de Crédito', 'Nota de Débito'].includes(invoice.invoice_type)
  const flow = isAdjustmentNote && invoice.status === 'Aprobada'
    ? null
    : STATUS_FLOW[invoice.status]
  const activePayments = payments.filter((payment) => payment.status === 'Aplicado')
  const paidTotal = activePayments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const pending = receivable?.balance ?? (invoice.total - paidTotal)
  const appliedLinkedNotes = linkedNotes.filter(
    (note) => !['Borrador', 'Anulada'].includes(note.status)
  )

  const isv15 = invoice.tax_amount - invoice.isv_18_amount
  const gravado15 = isv15 > 0 ? isv15 / 0.15 : (invoice.subtotal - invoice.importe_exento - invoice.importe_exonerado)
  const companyBranding = normalizeCompanyBranding(companySetting)
  const companyDisplayName = getCompanyDisplayName(companyBranding)

  const pdfData: InvoicePdfData = {
    invoice_number: invoice.invoice_number || '',
    invoice_type: invoice.invoice_type as 'Factura' | 'Proforma' | 'Nota de Crédito' | 'Nota de Débito',
    status: invoice.status,
    issue_date: invoice.issue_date || '',
    due_date: invoice.due_date,
    payment_condition: invoice.payment_condition === 'Credito' ? 'Crédito' : invoice.payment_condition,
    credit_days: invoice.credit_days,
    currency: invoice.currency,
    exchange_rate: invoice.exchange_rate,
    notes: invoice.notes,
    cliente_nombre: invoice.cliente_nombre,
    cliente_rtn: invoice.cliente_rtn,
    cliente_direccion: invoice.cliente_direccion,
    cliente_email: invoice.cliente_email,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      amount: it.amount,
      isv_rate: Number(it.isv_rate || 0) as 0 | 15 | 18,
    })),
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
    company_legal_name: companyDisplayName,
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
              onClick={flow.next === 'Pagada' ? openPaymentModal : advanceStatus}
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
          {invoice.invoice_type === 'Factura'
            && !['Borrador', 'Anulada'].includes(invoice.status) && (
            <>
              <button
                type="button"
                onClick={() => router.push(`/invoicing/new?parent=${invoice.id}&doc_type=nc`)}
                disabled={pending <= 0}
                title={pending <= 0 ? 'La factura no tiene saldo pendiente' : 'Crear nota de crédito'}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30"
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
              {['Aprobada', 'Parcialmente Pagada', 'Vencida'].includes(invoice.status)
                && ['Factura', 'Proforma'].includes(invoice.invoice_type) && (
                <button
                  type="button"
                  onClick={openPaymentModal}
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
                      <th className="pb-2 pr-4">Punto de venta</th>
                      <th className="pb-2 pr-4">Referencia</th>
                      <th className="pb-2 text-right">Monto</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={`border-b border-slate-100 dark:border-slate-800 ${p.status === 'Reversado' ? 'opacity-60' : ''}`}>
                        <td className="py-2.5 pr-4">{formatDate(p.payment_date)}</td>
                        <td className="pr-4 text-slate-600 dark:text-slate-400">
                          <div>{paymentMethodLabel(p.payment_method)}</div>
                          {p.invoice_fiscal_type && (
                            <div className="mt-1 text-xs text-slate-400">{p.invoice_fiscal_type}</div>
                          )}
                          {p.invoice_payment_splits.length > 1 && (
                            <div className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {p.invoice_payment_splits.map((split) => (
                                <div key={split.id}>
                                  {paymentMethodLabel(split.payment_method)}: {p.currency}{' '}
                                  {Number(split.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="pr-4 text-slate-600 dark:text-slate-400">{p.point_of_sale || '—'}</td>
                        <td className="pr-4 text-slate-600 dark:text-slate-400">
                          <div>{p.reference || '—'}</div>
                          {p.status === 'Reversado' && (
                            <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                              Reversado: {p.reversal_reason}
                            </div>
                          )}
                        </td>
                        <td className={`text-right font-semibold ${p.status === 'Reversado' ? 'text-slate-500 line-through' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {p.currency} {Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <div className="flex items-center">
                            {p.status === 'Aplicado' && (
                              <>
                                <PDFDownloadLink
                                  document={<ReciboPagoPdf data={makeReceiptData(p)} />}
                                  fileName={`recibo-${invoice.invoice_number || 'pago'}-${p.payment_date}.pdf`}
                                >
                                  {({ loading: pdfLoading }) => (
                                    <button
                                      type="button"
                                      title="Generar recibo de este pago"
                                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                                      disabled={pdfLoading}
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                      {pdfLoading ? 'Generando...' : 'Generar recibo'}
                                    </button>
                                  )}
                                </PDFDownloadLink>
                                <button
                                  type="button"
                                  onClick={() => setPaymentToReverse(p)}
                                  title="Reversar pago"
                                  className="rounded p-1 text-slate-400 hover:text-amber-600"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
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
            <InfoRow
              label="Condición de pago"
              value={invoice.payment_condition === 'Credito'
                ? `Crédito · ${invoice.credit_days || 0} días`
                : invoice.payment_condition}
            />
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
                      <span className="ml-2 text-xs text-slate-400">{note.status}</span>
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
                  {appliedLinkedNotes.map((note) => (
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
                        appliedLinkedNotes.reduce((s, n) => s + (n.invoice_type === 'Nota de Débito' ? n.total : -n.total), 0)
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-[#0b1220]">
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
                  max={Math.max(0, pending)}
                  step="0.01"
                  className={fieldClass}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Tipo fiscal de factura <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={payFiscalType}
                    onChange={(e) => setPayFiscalType(e.target.value as InvoiceFiscalType)}
                    className={fieldClass}
                  >
                    {invoice.invoice_type === 'Proforma' ? (
                      <option value="No aplica">No aplica</option>
                    ) : (
                      <>
                        <option value="Gravada">Gravada</option>
                        <option value="Mixta">Mixta</option>
                        <option value="Exenta">Exenta</option>
                        <option value="Exonerada">Exonerada</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Punto de venta <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={payPointOfSale}
                    onChange={(e) => setPayPointOfSale(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Seleccionar ciudad...</option>
                    {pointsOfSale.map((point) => (
                      <option key={point} value={point}>{point}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Fecha de pago <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Forma de pago <span className="text-red-500">*</span>
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => {
                    const method = e.target.value as PaymentMethod | ''
                    setPayMethod(method)
                    setPayRef('')
                    if (method !== 'Mixto') setPaySplits(emptyPaymentSplits())
                  }}
                  className={fieldClass}
                >
                  <option value="">Seleccionar...</option>
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method.value} value={method.value}>{method.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Condición de la factura: {invoice.payment_condition === 'Credito'
                    ? `Crédito · ${invoice.credit_days || 0} días`
                    : 'Contado'}
                </p>
              </div>
              {payMethod === 'Mixto' && (
                <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Desglose mixto</h3>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Total: {invoice.currency}{' '}
                      {SPLIT_METHODS.reduce((sum, method) => (
                        sum + (paySplits[method.value].enabled ? Number(paySplits[method.value].amount || 0) : 0)
                      ), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {SPLIT_METHODS.map((method) => {
                      const split = paySplits[method.value]
                      return (
                        <div key={method.value} className="grid items-center gap-2 sm:grid-cols-[120px_1fr_1.4fr]">
                          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={split.enabled}
                              onChange={(e) => setPaySplits((current) => ({
                                ...current,
                                [method.value]: {
                                  ...current[method.value],
                                  enabled: e.target.checked,
                                  amount: e.target.checked ? current[method.value].amount : '',
                                  reference: e.target.checked ? current[method.value].reference : '',
                                },
                              }))}
                            />
                            {method.label}
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={split.amount}
                            disabled={!split.enabled}
                            onChange={(e) => setPaySplits((current) => ({
                              ...current,
                              [method.value]: { ...current[method.value], amount: e.target.value },
                            }))}
                            placeholder="Monto"
                            className={`${fieldClass} disabled:opacity-50`}
                          />
                          <input
                            value={split.reference}
                            disabled={!split.enabled}
                            onChange={(e) => setPaySplits((current) => ({
                              ...current,
                              [method.value]: { ...current[method.value], reference: e.target.value },
                            }))}
                            placeholder={paymentReferenceLabel(method.value)}
                            className={`${fieldClass} disabled:opacity-50`}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {payMethod && payMethod !== 'Mixto' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    {paymentReferenceLabel(payMethod)} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              )}
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

      {receiptPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl dark:bg-[#0b1220]">
            <div className="border-b border-slate-200 p-5 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Pago de contado registrado</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                El recibo quedará vinculado a la factura {invoice.invoice_number || 'sin número'} y a este pago.
              </p>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
                <span className="text-sm text-slate-500 dark:text-slate-400">Monto recibido</span>
                <strong className="text-lg text-emerald-700 dark:text-emerald-400">
                  {receiptPayment.currency} {Number(receiptPayment.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setReceiptPayment(null)}
                className={secondaryButtonClass}
              >
                Cerrar
              </button>
              <PDFDownloadLink
                document={<ReciboPagoPdf data={makeReceiptData(receiptPayment)} />}
                fileName={`recibo-${invoice.invoice_number || 'pago'}-${receiptPayment.payment_date}.pdf`}
              >
                {({ loading: pdfLoading }) => (
                  <button
                    type="button"
                    disabled={pdfLoading}
                    className={primaryButtonClass}
                  >
                    <Printer className="h-4 w-4" />
                    {pdfLoading ? 'Generando...' : 'Generar recibo'}
                  </button>
                )}
              </PDFDownloadLink>
            </div>
          </div>
        </div>
      )}

      {paymentToReverse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-[#0b1220]">
            <div className="border-b border-slate-200 p-5 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Reversar pago</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                El movimiento no se eliminará y quedará visible en el historial.
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <span className="text-slate-500">Monto:</span>{' '}
                <strong>{paymentToReverse.currency} {Number(paymentToReverse.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Motivo del reverso <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.target.value)}
                  rows={3}
                  placeholder="Ej. transferencia aplicada a la factura incorrecta"
                  className={`${fieldClass} resize-none`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                type="button"
                onClick={() => { setPaymentToReverse(null); setReversalReason('') }}
                disabled={reversingPayment}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={reversePayment}
                disabled={reversingPayment || !reversalReason.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {reversingPayment ? 'Reversando...' : 'Confirmar reverso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
