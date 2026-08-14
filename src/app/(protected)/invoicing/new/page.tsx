'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, ChevronLeft, ShieldCheck, AlertTriangle, Link as LinkIcon, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../../lib/supabase/client'
import { UnsavedChangesGuard } from '@/src/components/ui/UnsavedChangesGuard'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { IS_DEMO_ENVIRONMENT } from '@/src/lib/demo-environment'
import {
  primaryButtonClass,
  secondaryButtonClass,
  cardClass,
  fieldClass,
} from '@/src/lib/ui-classes'

type InvoiceType = 'Proforma' | 'Factura' | 'Nota de Crédito' | 'Nota de Débito'

type InvoiceItem = {
  id: string
  source_pricing_item_id?: string
  description: string
  quantity: string
  unit_price: string
  amount: number
  isv_rate: 0 | 15 | 18
}

type Cliente = {
  id: string
  nombre: string
  rtn: string | null
  direccion: string | null
  email: string | null
  condicion_pago?: string | null
  dias_credito?: number | null
}

type Quotation = {
  id: string
  quotation_number: string | null
  cliente_id: string | null
  status: string | null
  financial_validation_status: string | null
  clientes: { nombre: string | null }[] | { nombre: string | null } | null
  total_sale: number | null
  invoices?: Array<{
    id: string
    status: string
    invoice_type: string
  }> | null
}

type PricingItem = {
  id: string
  description: string
  quantity: number | null
  sale_amount: number | null
  currency: string | null
  taxable: boolean | null
  tax_rate: number | null
}

type CaiRange = {
  id: string
  cai: string
  rango_desde: string
  rango_hasta: string
  fecha_limite_emision: string
  lugar_emision: string | null
  document_type: Exclude<InvoiceType, 'Proforma'>
}

type ParentInvoice = {
  id: string
  invoice_number: string | null
  invoice_type: InvoiceType
  cliente_id: string | null
  cliente_nombre: string | null
  cliente_rtn: string | null
  cliente_direccion: string | null
  cliente_email: string | null
  total: number
  currency: string
  balance: number
}

const QUOTATION_DOCUMENT_TYPE: InvoiceType = IS_DEMO_ENVIRONMENT
  ? 'Proforma'
  : 'Factura'

function quotationHasActiveInvoice(quotation: Quotation) {
  return Boolean(quotation.invoices?.some((invoice) => (
    invoice.invoice_type === QUOTATION_DOCUMENT_TYPE && invoice.status !== 'Anulada'
  )))
}

async function fetchQuotationPricingItems(quotationId: string) {
  return supabase
    .from('pricing_items')
    .select('id, description, quantity, sale_amount, currency, taxable, tax_rate')
    .eq('quotation_id', quotationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
}

function newItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: '1',
    unit_price: '0',
    amount: 0,
    isv_rate: 15,
  }
}

function reqClass(submitted: boolean, value: string) {
  return submitted && !value ? 'border-red-400 dark:border-red-500' : ''
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function getClientPaymentTerms(client: Cliente | null) {
  const normalizedCondition = (client?.condicion_pago || 'Contado')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const creditDays = Number(client?.dias_credito || 0)
  const isCredit = normalizedCondition.startsWith('credito') || creditDays > 0

  return {
    condition: isCredit ? 'Credito' as const : 'Contado' as const,
    creditDays: isCredit ? creditDays : 0,
  }
}

function calculateDueDate(issueDate: string, client: Cliente | null, type: InvoiceType) {
  if (!issueDate || !client || IS_NOTE[type]) return ''
  const { condition, creditDays } = getClientPaymentTerms(client)
  if (condition === 'Credito' && creditDays <= 0) return ''

  const date = new Date(`${issueDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + creditDays)
  return date.toISOString().slice(0, 10)
}

const IS_FISCAL: Record<InvoiceType, boolean> = {
  Factura: true,
  'Nota de Crédito': true,
  'Nota de Débito': true,
  Proforma: false,
}

const IS_NOTE: Record<InvoiceType, boolean> = {
  'Nota de Crédito': true,
  'Nota de Débito': true,
  Factura: false,
  Proforma: false,
}

export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const [invoiceType, setInvoiceType] = useState<InvoiceType>(QUOTATION_DOCUMENT_TYPE)
  const [clienteId, setClienteId] = useState('')
  const [quotationId, setQuotationId] = useState('')
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [exchangeRate, setExchangeRate] = useState('25.30')
  const [notes, setNotes] = useState('')
  const [motivo, setMotivo] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([newItem()])
  const [itemPendingRemoval, setItemPendingRemoval] = useState<InvoiceItem | null>(null)
  const [quotationChangePending, setQuotationChangePending] = useState<string | null>(null)
  const [loadingQuotation, setLoadingQuotation] = useState(false)

  // SAR fields
  const [activeCai, setActiveCai] = useState<CaiRange | null>(null)
  const [esExonerado, setEsExonerado] = useState(false)
  const [ordenCompraExenta, setOrdenCompraExenta] = useState('')
  const [noConstanciaExonerado, setNoConstanciaExonerado] = useState('')
  const [noRegistroSag, setNoRegistroSag] = useState('')

  // Parent invoice (for NC/ND)
  const [parentInvoice, setParentInvoice] = useState<ParentInvoice | null>(null)
  const parentId = searchParams.get('parent')
  const docType = searchParams.get('doc_type') // 'nc' | 'nd'
  const requestedQuotationId = searchParams.get('quotation')

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const selectedQuotation = quotations.find((quotation) => quotation.id === quotationId) || null
  const selectedCliente: Cliente | null = parentInvoice?.cliente_id
    ? {
        id: parentInvoice.cliente_id,
        nombre: parentInvoice.cliente_nombre || '',
        rtn: parentInvoice.cliente_rtn,
        direccion: parentInvoice.cliente_direccion,
        email: parentInvoice.cliente_email,
      }
    : clientes.find((client) => client.id === clienteId) || null

  const applyQuotation = useCallback(async (quotation: Quotation) => {
    if (quotation.status !== 'Ganada') {
      toast.error('La cotización debe estar Ganada antes de facturar')
      return false
    }
    if (quotation.financial_validation_status !== 'Validado') {
      toast.error('La cotización debe tener sus costos validados antes de facturar')
      return false
    }
    if (quotationHasActiveInvoice(quotation)) {
      toast.error('Esta cotización ya tiene una factura activa')
      return false
    }

    setLoadingQuotation(true)
    const { data, error } = await fetchQuotationPricingItems(quotation.id)
    if (error) {
      toast.error('No se pudieron cargar las líneas de la cotización', { description: error.message })
      setLoadingQuotation(false)
      return false
    }

    const pricingItems = (data || []) as PricingItem[]
    if (pricingItems.length === 0) {
      toast.error('La cotización no tiene líneas comerciales para facturar')
      setLoadingQuotation(false)
      return false
    }

    const currencies = Array.from(new Set(
      pricingItems.map((item) => item.currency || 'USD')
    ))
    if (currencies.length !== 1 || !['USD', 'HNL'].includes(currencies[0])) {
      toast.error('Todas las líneas de la cotización deben usar una sola moneda válida')
      setLoadingQuotation(false)
      return false
    }

    const invalidItem = pricingItems.some((item) => {
      const rate = item.taxable ? Number(item.tax_rate || 0) : 0
      return !item.description.trim()
        || Number(item.quantity || 0) <= 0
        || Number(item.sale_amount ?? -1) < 0
        || ![0, 15, 18].includes(rate)
    })
    if (invalidItem) {
      toast.error('La cotización contiene líneas no facturables; revisa cantidad, precio e ISV')
      setLoadingQuotation(false)
      return false
    }

    setQuotationId(quotation.id)
    setCurrency(currencies[0])
    setItems(pricingItems.map((item) => {
      const quantity = Number(item.quantity || 0)
      const unitPrice = Number(item.sale_amount || 0)
      return {
        id: crypto.randomUUID(),
        source_pricing_item_id: item.id,
        description: item.description,
        quantity: String(quantity),
        unit_price: String(unitPrice),
        amount: quantity * unitPrice,
        isv_rate: (item.taxable ? Number(item.tax_rate || 0) : 0) as 0 | 15 | 18,
      }
    }))
    setLoadingQuotation(false)
    return true
  }, [])

  useEffect(() => {
    const init = async () => {
      const [clientesRes, settingsRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre, rtn, direccion, email:email_1, condicion_pago, dias_credito').order('nombre'),
        supabase.from('company_settings').select('exchange_rate_usd_hnl').limit(1).single(),
      ])

      setClientes((clientesRes.data || []) as Cliente[])
      if (settingsRes.data?.exchange_rate_usd_hnl) {
        setExchangeRate(String(settingsRes.data.exchange_rate_usd_hnl))
      }

      if (requestedQuotationId && !parentId) {
        const { data: requestedQuotation, error: quotationError } = await supabase
          .from('quotations')
          .select('id, quotation_number, cliente_id, status, financial_validation_status, clientes(nombre), total_sale, invoices(id, status, invoice_type)')
          .eq('id', requestedQuotationId)
          .is('deleted_at', null)
          .single()

        if (quotationError || !requestedQuotation) {
          toast.error('No se encontró la cotización solicitada')
        } else {
          const quotation = requestedQuotation as Quotation
          const requestedClient = (clientesRes.data || []).find(
            (client) => client.id === quotation.cliente_id
          ) as Cliente | undefined
          setClienteId(quotation.cliente_id || '')
          setDueDate(calculateDueDate(
            new Date().toISOString().slice(0, 10),
            requestedClient || null,
            QUOTATION_DOCUMENT_TYPE
          ))
          setQuotations([quotation])
          await applyQuotation(quotation)
        }
      }

      // If creating NC/ND from a parent invoice
      if (parentId) {
        const type: InvoiceType = docType === 'nd' ? 'Nota de Débito' : 'Nota de Crédito'
        setInvoiceType(type)

        const [parentResult, receivableResult] = await Promise.all([
          supabase
            .from('invoices')
            .select('id, invoice_number, invoice_type, cliente_id, cliente_nombre, cliente_rtn, cliente_direccion, cliente_email, total, currency')
            .eq('id', parentId)
            .single(),
          supabase
            .from('invoice_receivables')
            .select('balance')
            .eq('invoice_id', parentId)
            .maybeSingle(),
        ])
        const parent = parentResult.data

        if (parent) {
          setParentInvoice({
            ...parent,
            balance: Number(receivableResult.data?.balance ?? parent.total),
          } as ParentInvoice)
          setCurrency(parent.currency)
          if (parent.cliente_id) {
            setClienteId(parent.cliente_id)
          }

          // Pre-fill items from parent
          const { data: parentItems } = await supabase
            .from('invoice_items')
            .select('description, quantity, unit_price, amount, sort_order, isv_rate')
            .eq('invoice_id', parentId)
            .order('sort_order')

          if (parentItems && parentItems.length > 0) {
            setItems(parentItems.map((it) => ({
              id: crypto.randomUUID(),
              description: it.description,
              quantity: String(it.quantity),
              unit_price: String(it.unit_price),
              amount: it.amount,
              isv_rate: Number(it.isv_rate || 0) as 0 | 15 | 18,
            })))
          }
        }
      } else {
        // Set type from query param if present (direct navigation)
        if (docType === 'nc') setInvoiceType('Nota de Crédito')
        else if (docType === 'nd') setInvoiceType('Nota de Débito')
      }
    }

    init()
  }, [parentId, docType, requestedQuotationId, applyQuotation])

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      if (!IS_FISCAL[invoiceType]) {
        setActiveCai(null)
        return
      }

      const { data, error } = await supabase
        .from('cai_ranges')
        .select('*')
        .eq('document_type', invoiceType)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        toast.error('Error al cargar el rango CAI', { description: error.message })
      }
      setActiveCai((data as CaiRange | null) ?? null)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [invoiceType])

  useEffect(() => {
    if (!clienteId || parentId || invoiceType !== QUOTATION_DOCUMENT_TYPE) {
      return
    }
    supabase
      .from('quotations')
      .select('id, quotation_number, cliente_id, status, financial_validation_status, clientes(nombre), total_sale, invoices(id, status, invoice_type)')
      .eq('cliente_id', clienteId)
      .eq('status', 'Ganada')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setQuotations((data || []) as Quotation[]))
  }, [clienteId, parentId, invoiceType])

  const requestQuotationChange = (nextQuotationId: string) => {
    if (nextQuotationId === quotationId) return
    const hasMeaningfulData = items.some((item) => (
      item.description.trim() || Number(item.unit_price || 0) > 0 || item.amount > 0
    ))
    if (hasMeaningfulData) {
      setQuotationChangePending(nextQuotationId)
      return
    }
    const quotation = quotations.find((option) => option.id === nextQuotationId)
    if (quotation) void applyQuotation(quotation)
  }

  const applyPendingQuotationChange = async () => {
    const nextQuotationId = quotationChangePending
    setQuotationChangePending(null)
    if (!nextQuotationId) {
      setQuotationId('')
      setItems([newItem()])
      return
    }
    const quotation = quotations.find((option) => option.id === nextQuotationId)
    if (quotation) await applyQuotation(quotation)
  }

  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const updated = { ...it, [field]: value }
        const qty = parseFloat(String(updated.quantity)) || 0
        const price = parseFloat(String(updated.unit_price)) || 0
        updated.amount = qty * price
        return updated
      })
    )
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const requestItemRemoval = (item: InvoiceItem) => {
    const hasMeaningfulData = Boolean(
      item.description.trim() || Number(item.unit_price || 0) > 0 || item.amount > 0
    )
    if (!hasMeaningfulData) {
      removeItem(item.id)
      return
    }
    setItemPendingRemoval(item)
  }

  // Totals
  const isFiscal = IS_FISCAL[invoiceType]
  const importeExento = items.filter((i) => i.isv_rate === 0).reduce((s, i) => s + i.amount, 0)
  const importeGravado15 = items.filter((i) => i.isv_rate === 15).reduce((s, i) => s + i.amount, 0)
  const importeGravado18 = items.filter((i) => i.isv_rate === 18).reduce((s, i) => s + i.amount, 0)
  const isv15Amount = importeGravado15 * 0.15
  const isv18Amount = importeGravado18 * 0.18
  const subtotal = importeExento + importeGravado15 + importeGravado18
  const taxAmount = isv15Amount + isv18Amount
  const total = subtotal + taxAmount
  const totalLps = currency === 'USD' ? total * (parseFloat(exchangeRate) || 1) : total
  const paymentTerms = getClientPaymentTerms(selectedCliente)

  const handleSave = async () => {
    setSubmitted(true)
    if (!clienteId || !issueDate || items.length === 0) {
      toast.error('Completa los campos requeridos')
      return
    }
    if (items.some((it) => !it.description)) {
      toast.error('Todas las líneas deben tener descripción')
      return
    }
    if (IS_NOTE[invoiceType] && !motivo) {
      toast.error('El motivo es requerido para notas de crédito / débito')
      return
    }
    if (invoiceType === 'Nota de Crédito'
      && parentInvoice
      && total > parentInvoice.balance + 0.005) {
      toast.error('La nota de crédito no puede superar el saldo pendiente de la factura')
      return
    }
    if (!IS_NOTE[invoiceType] && paymentTerms.condition === 'Credito' && paymentTerms.creditDays <= 0) {
      toast.error('El cliente está configurado a crédito pero no tiene días de crédito válidos')
      return
    }
    // SAR: RTN obligatorio en documentos fiscales (compra > L.100, que aplica a todos los servicios de forwarding)
    if (isFiscal && !selectedCliente?.rtn) {
      toast.error(
        'SAR requiere RTN del cliente en documentos fiscales. Actualiza el perfil del cliente antes de emitir.',
        { duration: 6000 }
      )
      setSaving(false)
      return
    }
    if (isFiscal && !activeCai) {
      toast.error(`No hay un rango CAI activo para ${invoiceType}.`)
      return
    }
    if (isFiscal && activeCai && activeCai.fecha_limite_emision < issueDate) {
      toast.error('El rango CAI está vencido para la fecha de emisión seleccionada.')
      return
    }
    // SAR: tipo de cambio requerido cuando factura es en USD (total en HNL es obligatorio)
    if (isFiscal && currency === 'USD' && (!exchangeRate || parseFloat(exchangeRate) <= 0)) {
      toast.error('El tipo de cambio es requerido por SAR para facturas en USD (total en HNL obligatorio)')
      setSaving(false)
      return
    }
    if (isFiscal && esExonerado && !ordenCompraExenta) {
      toast.error('Ingresa el número de Orden de Compra Exenta')
      return
    }
    if (quotationId && selectedQuotation?.financial_validation_status !== 'Validado') {
      toast.error('Los costos de la cotización deben estar validados antes de facturar')
      return
    }

    setSaving(true)

    const invoicePayload = {
      invoice_type: invoiceType,
      cliente_id: clienteId,
      issue_date: issueDate,
      due_date: dueDate || null,
      currency,
      exchange_rate: parseFloat(exchangeRate) || 1,
      notes: notes || null,
      motivo: IS_NOTE[invoiceType] ? motivo : null,
      parent_invoice_id: parentId || null,
      es_exonerado: esExonerado,
      orden_compra_exenta: esExonerado ? ordenCompraExenta || null : null,
      no_constancia_exonerado: esExonerado ? noConstanciaExonerado || null : null,
      no_registro_sag: esExonerado ? noRegistroSag || null : null,
    }
    const itemPayload = items.map((item, index) => ({
        description: item.description.trim(),
        quantity: parseFloat(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        isv_rate: item.isv_rate,
        sort_order: index,
      }))
    const { data, error } = quotationId
      ? await supabase.rpc('create_invoice_from_quotation', {
          p_invoice: invoicePayload,
          p_quotation_id: quotationId,
        })
      : await supabase.rpc('create_manual_invoice_with_items', {
          p_invoice: invoicePayload,
          p_items: itemPayload,
        })

    const invoice = (data as { invoice_id: string; invoice_number: string }[] | null)?.[0]

    if (error || !invoice) {
      toast.error(error?.message || 'Error al crear el documento')
      setSaving(false)
      return
    }

    toast.success(`${invoiceType} ${invoice.invoice_number} creada`)
    router.push(`/invoicing/${invoice.invoice_id}`)
  }

  const isNote = IS_NOTE[invoiceType]
  const clienteLocked = !!parentInvoice

  const docLabel = invoiceType === 'Nota de Crédito' ? 'Nota de Crédito'
    : invoiceType === 'Nota de Débito' ? 'Nota de Débito'
    : invoiceType === 'Proforma' ? 'Proforma'
    : 'Factura'

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard />
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push(parentId ? `/invoicing/${parentId}` : '/invoicing')}
          className={secondaryButtonClass}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Facturación
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            {parentInvoice ? `Nueva ${docLabel}` : 'Nuevo documento'}
          </h1>
        </div>
      </div>

      {/* Alert: no CAI activo para documentos fiscales */}
      {isFiscal && !activeCai && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No hay un rango CAI activo para {invoiceType}. No se puede emitir este documento. <a href="/settings/cai" className="underline font-semibold">Registrar rango CAI →</a></span>
        </div>
      )}

      {/* Panel factura original (NC/ND) */}
      {parentInvoice && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/50 dark:bg-blue-950/20">
          <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm">
            <p className="font-semibold text-blue-800 dark:text-blue-200">
              Emitida contra: {parentInvoice.invoice_type} {parentInvoice.invoice_number}
            </p>
            <p className="text-blue-600 dark:text-blue-400">
              Cliente: {parentInvoice.cliente_nombre} · Total: {parentInvoice.currency} {parentInvoice.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-blue-600 dark:text-blue-400">
              Saldo pendiente: {parentInvoice.currency} {parentInvoice.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Main form */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Datos generales</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Tipo (bloqueado si viene de NC/ND parent) */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Tipo de documento <span className="text-red-500">*</span>
                </label>
                <select
                  value={invoiceType}
                  onChange={(e) => {
                    const nextType = e.target.value as InvoiceType
                    setInvoiceType(nextType)
                    setDueDate(calculateDueDate(issueDate, selectedCliente, nextType))
                  }}
                  disabled={!!parentInvoice || Boolean(quotationId)}
                  className={`${fieldClass} ${reqClass(submitted, invoiceType)} disabled:opacity-60`}
                >
                  {IS_DEMO_ENVIRONMENT ? (
                    <option value="Proforma">Proforma Demo</option>
                  ) : (
                    <>
                      <option value="Factura">Factura</option>
                      <option value="Proforma">Proforma</option>
                      <option value="Nota de Crédito">Nota de Crédito</option>
                      <option value="Nota de Débito">Nota de Débito</option>
                    </>
                  )}
                </select>
              </div>

              {/* Cliente (bloqueado si viene de parent) */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Cliente <span className="text-red-500">*</span>
                </label>
                {clienteLocked ? (
                  <div className={`${fieldClass} bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300`}>
                    {selectedCliente?.nombre || '—'}
                  </div>
                ) : (
                  <select
                    value={clienteId}
                    onChange={(e) => {
                      const nextClientId = e.target.value
                      const nextClient = clientes.find((client) => client.id === nextClientId) || null
                      setClienteId(nextClientId)
                      setQuotations([])
                      setDueDate(calculateDueDate(issueDate, nextClient, invoiceType))
                    }}
                    disabled={Boolean(quotationId)}
                    className={`${fieldClass} ${reqClass(submitted, clienteId)} disabled:bg-slate-50 disabled:opacity-70 dark:disabled:bg-slate-800`}
                  >
                    <option value="">Seleccionar cliente...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Cotización validada */}
              {!parentId && invoiceType === QUOTATION_DOCUMENT_TYPE && clienteId && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Cotización validada (opcional)
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={quotationId}
                      onChange={(e) => requestQuotationChange(e.target.value)}
                      disabled={Boolean(quotationId) || loadingQuotation}
                      className={`${fieldClass} disabled:bg-slate-50 disabled:opacity-70 dark:disabled:bg-slate-800`}
                    >
                      <option value="">
                        {IS_DEMO_ENVIRONMENT ? 'Proforma manual' : 'Factura manual'}
                      </option>
                      {quotations.map((q) => {
                        const alreadyInvoiced = quotationHasActiveInvoice(q)
                        const validated = q.financial_validation_status === 'Validado'
                        return (
                          <option key={q.id} value={q.id} disabled={!validated || alreadyInvoiced}>
                            {q.quotation_number || q.id}
                            {q.total_sale ? ` · Total cotizado ${Number(q.total_sale).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
                            {!validated ? ' · Costos pendientes' : ''}
                            {alreadyInvoiced
                              ? IS_DEMO_ENVIRONMENT
                                ? ' · Ya vinculada'
                                : ' · Ya facturada'
                              : ''}
                          </option>
                        )
                      })}
                    </select>
                    {quotationId && (
                      <button
                        type="button"
                        onClick={() => setQuotationChangePending('')}
                        className={secondaryButtonClass}
                      >
                        Desvincular
                      </button>
                    )}
                  </div>
                  {quotations.length === 0 && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Este cliente no tiene cotizaciones ganadas disponibles.
                    </p>
                  )}
                </div>
              )}

              {/* Fecha emisión */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Fecha de emisión <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    const nextIssueDate = e.target.value
                    setIssueDate(nextIssueDate)
                    setDueDate(calculateDueDate(nextIssueDate, selectedCliente, invoiceType))
                  }}
                  className={`${fieldClass} ${reqClass(submitted, issueDate)}`}
                />
              </div>

              {/* Fecha vencimiento (no aplica para NC/ND) */}
              {!isNote && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Fecha de vencimiento ({paymentTerms.condition === 'Credito' ? `Crédito · ${paymentTerms.creditDays} días` : 'Contado'})
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    readOnly
                    className={`${fieldClass} bg-slate-50 dark:bg-slate-800`}
                  />
                </div>
              )}

              {/* Moneda */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Moneda
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  disabled={clienteLocked || Boolean(quotationId)}
                  className={`${fieldClass} disabled:opacity-60`}
                >
                  <option value="USD">USD</option>
                  <option value="HNL">HNL</option>
                </select>
              </div>

              {/* Tipo de cambio — requerido por SAR para facturas en USD */}
              {currency === 'USD' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Tipo de cambio (HNL/USD)
                    {isFiscal && <span className="ml-1 text-red-500">*</span>}
                    {isFiscal && <span className="ml-1 text-xs font-normal text-slate-400">— SAR exige total en HNL</span>}
                  </label>
                  <input
                    type="number"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    min="1"
                    step="0.0001"
                    className={`${fieldClass} ${submitted && isFiscal && (!exchangeRate || parseFloat(exchangeRate) <= 0) ? 'border-red-400' : ''}`}
                  />
                </div>
              )}
            </div>

            {/* Motivo (requerido para NC/ND) */}
            {isNote && (
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder={`Describe el motivo de la ${docLabel.toLowerCase()}...`}
                  className={`${fieldClass} resize-none ${reqClass(submitted, motivo)}`}
                />
              </div>
            )}

            {/* Notas */}
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Notas (aparecen en el documento)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Condiciones de pago, instrucciones especiales..."
                className={`${fieldClass} resize-none`}
              />
            </div>
          </section>

          {/* CAI info (solo documentos fiscales con CAI activo) */}
          {isFiscal && activeCai && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800/50 dark:bg-emerald-950/20">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Rango CAI activo
                </p>
              </div>
              <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-100">{activeCai.cai}</p>
              <div className="mt-2 grid grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <span className="block font-semibold">Desde</span>
                  <span className="font-mono">{activeCai.rango_desde}</span>
                </div>
                <div>
                  <span className="block font-semibold">Hasta</span>
                  <span className="font-mono">{activeCai.rango_hasta}</span>
                </div>
                <div>
                  <span className="block font-semibold">Fecha límite</span>
                  <span>{fmtDate(activeCai.fecha_limite_emision)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Exoneración (solo documentos fiscales) */}
          {isFiscal && (
            <section className={cardClass}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Exoneración</h2>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={esExonerado}
                    onChange={(e) => setEsExonerado(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-600"
                  />
                  Cliente exonerado
                </label>
              </div>

              {esExonerado && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      N° Orden de Compra Exenta <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={ordenCompraExenta}
                      onChange={(e) => setOrdenCompraExenta(e.target.value)}
                      placeholder="OCE-..."
                      className={`${fieldClass} ${reqClass(submitted, ordenCompraExenta)}`}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      N° Constancia exoneración
                    </label>
                    <input
                      value={noConstanciaExonerado}
                      onChange={(e) => setNoConstanciaExonerado(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      N° Registro SAG
                    </label>
                    <input
                      value={noRegistroSag}
                      onChange={(e) => setNoRegistroSag(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                </div>
              )}
            </section>
          )}

          {selectedQuotation && (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/50 dark:bg-emerald-950/20">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="text-sm">
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                  Cotización {selectedQuotation.quotation_number || selectedQuotation.id} validada
                </p>
                <p className="text-emerald-700 dark:text-emerald-300">
                  Las líneas, moneda, cantidades, precios e ISV se tomarán de la cotización y se verificarán nuevamente al generar la factura.
                </p>
              </div>
            </div>
          )}

          {/* Line items */}
          <section className={cardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Líneas del documento</h2>
              {quotationId ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Origen protegido
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setItems((prev) => [...prev, newItem()])}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar línea
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className={`grid gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 ${isFiscal ? 'grid-cols-[1fr_72px_110px_90px_110px_36px]' : 'grid-cols-[1fr_72px_110px_110px_36px]'}`}>
                <span>Descripción</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Precio unit.</span>
                {isFiscal && <span className="text-center">ISV</span>}
                <span className="text-right">Importe</span>
                <span />
              </div>

              {items.map((it) => (
                <div
                  key={it.id}
                  className={`grid items-center gap-2 ${isFiscal ? 'grid-cols-[1fr_72px_110px_90px_110px_36px]' : 'grid-cols-[1fr_72px_110px_110px_36px]'}`}
                >
                  <input
                    type="text"
                    placeholder="Descripción del servicio..."
                    value={it.description}
                    onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                    readOnly={Boolean(it.source_pricing_item_id)}
                    className={`${fieldClass} text-sm read-only:bg-slate-50 read-only:text-slate-600 dark:read-only:bg-slate-800 ${submitted && !it.description ? 'border-red-400' : ''}`}
                  />
                  <input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => updateItem(it.id, 'quantity', e.target.value)}
                    min="0"
                    step="1"
                    readOnly={Boolean(it.source_pricing_item_id)}
                    className={`${fieldClass} text-right text-sm read-only:bg-slate-50 read-only:text-slate-600 dark:read-only:bg-slate-800`}
                  />
                  <input
                    type="number"
                    value={it.unit_price}
                    onChange={(e) => updateItem(it.id, 'unit_price', e.target.value)}
                    min="0"
                    step="0.01"
                    readOnly={Boolean(it.source_pricing_item_id)}
                    className={`${fieldClass} text-right text-sm read-only:bg-slate-50 read-only:text-slate-600 dark:read-only:bg-slate-800`}
                  />
                  {isFiscal && (
                    <select
                      value={it.isv_rate}
                      onChange={(e) => updateItem(it.id, 'isv_rate', Number(e.target.value) as 0 | 15 | 18)}
                      disabled={Boolean(it.source_pricing_item_id)}
                      className={`${fieldClass} text-center text-sm disabled:bg-slate-50 disabled:text-slate-600 dark:disabled:bg-slate-800`}
                    >
                      <option value={15}>15%</option>
                      <option value={18}>18%</option>
                      <option value={0}>Exento</option>
                    </select>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    {it.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  {it.source_pricing_item_id ? (
                    <span
                      title="Línea vinculada a la cotización"
                      className="flex h-9 w-9 items-center justify-center text-emerald-600 dark:text-emerald-400"
                    >
                      <LockKeyhole className="h-4 w-4" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => requestItemRemoval(it)}
                      disabled={items.length === 1}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 dark:hover:bg-rose-950/30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right col */}
        <div className="space-y-4">
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Resumen</h2>
            <div className="space-y-2 text-sm">
              {isFiscal ? (
                <>
                  {importeExento > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Importe exento</span>
                      <span>{currency} {importeExento.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {importeGravado15 > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Gravado 15%</span>
                      <span>{currency} {importeGravado15.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {importeGravado18 > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Gravado 18%</span>
                      <span>{currency} {importeGravado18.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {isv15Amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">ISV 15%</span>
                      <span>{currency} {isv15Amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {isv18Amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">ISV 18%</span>
                      <span>{currency} {isv18Amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span>{currency} {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">ISV (15%)</span>
                    <span>{currency} {taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {currency} {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {currency === 'USD' && (
                  <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>≈ HNL</span>
                    <span>{totalLps.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          {selectedCliente && (
            <section className={`rounded-2xl border p-4 ${
              isFiscal && !selectedCliente.rtn
                ? 'border-rose-200 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/20'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/50'
            }`}>
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Datos del cliente</p>
              <p className="font-semibold text-slate-900 dark:text-white">{selectedCliente.nombre}</p>
              {selectedCliente.rtn
                ? <p className="text-xs text-slate-500">RTN: {selectedCliente.rtn}</p>
                : isFiscal && (
                  <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    ⚠ Sin RTN — requerido por SAR para documentos fiscales.{' '}
                    <a href={`/clientes/${selectedCliente.id}`} className="underline">Actualizar cliente →</a>
                  </p>
                )
              }
              {selectedCliente.direccion && <p className="mt-1 text-xs text-slate-500">{selectedCliente.direccion}</p>}
              {selectedCliente.email && <p className="text-xs text-slate-500">{selectedCliente.email}</p>}
            </section>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loadingQuotation}
            className={`w-full ${primaryButtonClass}`}
          >
            {saving ? 'Generando...' : `Generar ${docLabel}`}
          </button>
          <button
            type="button"
            onClick={() => router.push(parentId ? `/invoicing/${parentId}` : '/invoicing')}
            className={`w-full ${secondaryButtonClass}`}
          >
            Cancelar
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={quotationChangePending !== null}
        onOpenChange={(open) => { if (!open) setQuotationChangePending(null) }}
        title={quotationChangePending ? 'Cargar líneas de cotización' : 'Desvincular cotización'}
        description={quotationChangePending
          ? 'Se reemplazarán las líneas actuales por las líneas comerciales validadas de la cotización.'
          : 'Se descartarán las líneas importadas y la factura volverá al modo manual.'}
        confirmLabel={quotationChangePending ? 'Cargar cotización' : 'Desvincular'}
        danger={!quotationChangePending}
        onConfirm={applyPendingQuotationChange}
      />
      <ConfirmDialog
        open={itemPendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setItemPendingRemoval(null) }}
        title="Quitar línea de factura"
        description={itemPendingRemoval
          ? `¿Deseas descartar ${itemPendingRemoval.description || 'esta línea'} por USD ${itemPendingRemoval.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}?`
          : undefined}
        confirmLabel="Quitar línea"
        danger
        onConfirm={() => {
          if (itemPendingRemoval) removeItem(itemPendingRemoval.id)
          setItemPendingRemoval(null)
        }}
      />
    </div>
  )
}
