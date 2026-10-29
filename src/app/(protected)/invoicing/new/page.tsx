'use client'

import { InvoiceFiscalOptions, blankFiscalOptions, fiscalOptionsPayload } from '@/src/components/invoicing/InvoiceFiscalOptions'
import { InvoiceLineSettings, InvoiceLineSettingsProvider } from '@/src/components/invoicing/InvoiceLineSettings'
import { calculateInvoiceFiscal, convertMoney, invoiceLineAmounts, type TaxTreatment } from '@/src/lib/invoice-fiscal'

import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { NumberInput } from '@/src/components/ui/NumberInput'
import { financeLinkClass } from '@/src/components/invoicing/FinanceWorkspace'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Trash2, ChevronLeft, ShieldCheck, AlertTriangle, Link as LinkIcon, LockKeyhole } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../../lib/supabase/client'
import { UnsavedChangesGuard, requestFormNavigation, markFormSaved } from '@/src/components/ui/UnsavedChangesGuard'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import {
  primaryButtonClass,
  secondaryButtonClass,
  cardClass,
  fieldClass,
  fieldLabelClass,
} from '@/src/lib/ui-classes'
import { billingReturnHref } from '@/src/lib/billing-readiness'
import { loadCurrentCompanySettings } from '@/src/lib/company-settings'
import { loadBillingPointsOfSale } from '@/src/lib/billing-points-of-sale'
import { useUser } from '@/src/hooks/useUser'
import { draftEditorFromInvoice, draftEditorSignature, draftInvoicePayload, draftItemPayload, draftLabel, type DraftEditorState, type InvoiceDraft } from '@/src/lib/invoice-drafts'
import { fiscalAccountVariant, type ServiceSourceKind } from '@/src/lib/service-accounting'
import { InvoiceCorrectionReview } from '@/src/components/invoicing/InvoiceCorrectionReview'
import { useInvoiceMaster } from '@/src/hooks/useInvoiceMaster'

type InvoiceType = 'Proforma' | 'Factura' | 'Nota de Crédito' | 'Nota de Débito'

type InvoiceItem = {
  service_catalog_kind?:ServiceSourceKind
  service_catalog_code?:string
  source_rate_code?:string|null
  source_item_type?:string|null
  source_product?:string|null
  discount_amount?: string
  income_account_id?: string
  tax_treatment?: TaxTreatment
  id: string
  source_pricing_item_id?: string
  description: string
  quantity: string
  unit_price: string
  amount: number
  isv_rate: 0 | 15 | 18
}

type Cliente = {
  billing_office?: { name: string; is_active: boolean } | null
  id: string
  nombre: string
  rtn: string | null
  direccion: string | null
  email: string | null
  condicion_pago?: string | null
  dias_credito?: number | null
}

type Quotation = {
  service_product?:string|null
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
  rate_code?:string|null
  item_type?:string|null
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
  point_of_sale: string
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
  point_of_sale: string | null
}

function quotationHasActiveInvoice(quotation: Quotation) {
  return Boolean(quotation.invoices?.some((invoice) => (
    invoice.invoice_type === 'Factura' && invoice.status !== 'Anulada'
  )))
}

async function fetchQuotationPricingItems(quotationId: string) {
  return supabase
    .from('pricing_items')
    .select('id, description, quantity, sale_amount, currency, taxable, tax_rate, rate_code, item_type')
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
    discount_amount: '0',
    amount: 0,
    isv_rate: 15,
  }
}

function reqClass(submitted: boolean, value: string) {
  return submitted && !value ? 'border-red-400 dark:border-red-500' : ''
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
  const { user, profile } = useUser()
  const { isMaster } = useInvoiceMaster()
  const router = useRouter()
  const navigation = useRef(router)
  useEffect(() => { navigation.current = router }, [router])
  const searchParams = useSearchParams()
  const context = `${user?.id}:${profile?.tenant_id}:${searchParams.get('draft')}:${searchParams.get('correct')}:${searchParams.get('parent')}:${searchParams.get('quotation')}:${searchParams.get('doc_type')}`
  const owner = useRef(context), saveLock = useRef('')
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<InvoiceDraft | null>(null)
  const draftIdentity = useRef(crypto.randomUUID()), draftAttempt = useRef({ signature: '', key: '' })
  const [draftLoading, setDraftLoading] = useState(false), [draftError, setDraftError] = useState('')
  const [loadedContext, setLoadedContext] = useState('')
  const [issueConfirmation, setIssueConfirmation] = useState(false)
  const [officeAccess, setOfficeAccess] = useState<{name:string;allowed:boolean}[]>([])
  const requestedDraft = searchParams.get('draft'), correctionSource = searchParams.get('correct')

  const [invoiceType, setInvoiceType] = useState<InvoiceType>(() => searchParams.get('doc_type') === 'proforma' ? 'Proforma' : 'Factura')
  const [clienteId, setClienteId] = useState('')
  const [quotationId, setQuotationId] = useState('')
  const [issueDate, setIssueDate] = useState(toDateInputValue())
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
  const [loadedActiveCai, setActiveCai] = useState<CaiRange | null>(null)

  const [parentPointOfSale, setParentPointOfSale] = useState('')
  const [fiscalOptions, setFiscalOptions] = useState(blankFiscalOptions)
  const [sourceCurrency, setSourceCurrency] = useState('')
  const esExonerado = fiscalOptions.mode === 'Exonerada'
  const ordenCompraExenta = fiscalOptions.order

  // Parent invoice (for NC/ND)
  const [parentInvoice, setParentInvoice] = useState<ParentInvoice | null>(null)
  const parentId = searchParams.get('parent')
  const docType = searchParams.get('doc_type') // 'nc' | 'nd'
  const requestedQuotationId = searchParams.get('quotation')
  const requestedReturnTo = searchParams.get('returnTo')
  const returnHref = requestedReturnTo
    ? billingReturnHref(requestedReturnTo)
    : '/invoicing'

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

  const pointOfSale = parentInvoice ? parentPointOfSale : (selectedCliente?.billing_office?.is_active ? selectedCliente.billing_office.name : '')
  const canIssueFromOffice = officeAccess.some(office=>office.name===pointOfSale&&office.allowed)
  const activeCai = loadedActiveCai?.point_of_sale === pointOfSale && loadedActiveCai.document_type === invoiceType ? loadedActiveCai : null

  const restoreDraft = useCallback((state: DraftEditorState) => {
    setInvoiceType('Factura'); setClienteId(state.clienteId || ''); setQuotationId(state.quotationId || '')
    setIssueDate(state.issueDate || toDateInputValue()); setDueDate(state.dueDate || '')
    setCurrency(state.currency || 'HNL'); setExchangeRate(state.exchangeRate || '')
    setNotes(state.notes || ''); setMotivo(state.motivo || ''); setItems(state.items?.length ? state.items : [newItem()])
    setFiscalOptions(state.fiscalOptions || blankFiscalOptions()); setSourceCurrency(state.sourceCurrency || '')
  }, [])

  const applyQuotation = useCallback(async (quotation: Quotation) => {
    if (quotation.status !== 'Ganada') {
      toast.error('La cotización debe estar Ganada antes de facturar')
      return false
    }
    const operationState = await supabase.rpc('quotation_operations_complete', {
      p_quotation_id: quotation.id,
    })
    if (operationState.error || operationState.data !== true) {
      toast.error('Todas las operaciones activas deben estar finalizadas antes de facturar')
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
    setSourceCurrency(currencies[0])
    setFiscalOptions(previous => ({ ...previous, conversionEnabled: false }))
    setItems(pricingItems.map((item) => {
      const quantity = Number(item.quantity || 0)
      const unitPrice = Number(item.sale_amount || 0)
      return {
        id: crypto.randomUUID(),
        source_pricing_item_id: item.id,
        source_rate_code: item.rate_code,
        source_item_type: item.item_type,
        source_product: quotation.service_product,
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
    let active = true
    const init = async () => {
      draftIdentity.current = crypto.randomUUID(); draftAttempt.current = { signature: '', key: '' }
      setSaving(false); setDraft(null); setItems([newItem()]); setClienteId(''); setQuotationId(''); setNotes(''); setMotivo('')
      setFiscalOptions(blankFiscalOptions()); setSourceCurrency(''); setIssueDate(toDateInputValue()); setDueDate('')
      setInvoiceType(docType === 'proforma' ? 'Proforma' : 'Factura'); setParentInvoice(null)
      setDraftLoading(Boolean(requestedDraft || correctionSource)); setDraftError('')
      const [clientesRes, settingsRes, pointsRes, accessRes] = await Promise.all([
        supabase.from('clientes').select('id, nombre, rtn, direccion, email:email_1, condicion_pago, dias_credito, billing_office:billing_offices!clientes_billing_office_fk(name,is_active)').order('nombre'),
        loadCurrentCompanySettings(supabase),
        loadBillingPointsOfSale(supabase),
        supabase.rpc('get_my_billing_office_access'),
      ])

      if (!active) return
      setOfficeAccess(!accessRes.error&&Array.isArray(accessRes.data)?accessRes.data:[])
      if(accessRes.error)toast.error('No se pudieron verificar tus oficinas autorizadas. Recarga antes de emitir.')

      setClientes((clientesRes.data || []).map(client => ({ ...client,
        billing_office: Array.isArray(client.billing_office) ? client.billing_office[0] || null : client.billing_office,
      })) as Cliente[])
      if (pointsRes.error) toast.error('No se pudieron cargar los puntos de venta')
      if (!requestedQuotationId && !parentId && !requestedDraft && !correctionSource) setCurrency(settingsRes.data?.default_currency === 'HNL' ? 'HNL' : 'USD')
      if (settingsRes.data?.exchange_rate_usd_hnl) {
        setExchangeRate(String(settingsRes.data.exchange_rate_usd_hnl))
      }

      if (requestedDraft) {
        const result = await supabase.from('invoice_drafts').select('*').eq('id', requestedDraft).single()
        if (!active) return
        if (result.error || !result.data) { setDraftError('No se pudo abrir el borrador. Vuelve al listado y reintenta.'); setDraftLoading(false); return }
        const saved = result.data as InvoiceDraft
        if (saved.status === 'Emitida' && saved.invoice_id) { markFormSaved(); navigation.current.replace(`/invoicing/${saved.invoice_id}`); return }
        draftIdentity.current = saved.id; setDraft(saved); restoreDraft(saved.editor_state); setDraftLoading(false); setLoadedContext(context); return
      }
      if (correctionSource) {
        const [source, lines] = await Promise.all([
          supabase.from('invoices').select('*').eq('id', correctionSource).single(),
          supabase.from('invoice_items').select('*').eq('invoice_id', correctionSource).order('sort_order').order('id'),
        ])
        if (!active) return
        if (source.error || lines.error || !source.data || source.data.invoice_type !== 'Factura' || !source.data.cai) { setDraftError('No se pudo cargar la factura original para corregir.'); setDraftLoading(false); return }
        restoreDraft(draftEditorFromInvoice(source.data, lines.data || [], blankFiscalOptions(), toDateInputValue()))
        setDraftLoading(false); setLoadedContext(context); return
      }

      if (requestedQuotationId && !parentId) {
        const { data: requestedQuotation, error: quotationError } = await supabase
          .from('quotations')
          .select('id, quotation_number, cliente_id, status, financial_validation_status, clientes(nombre), total_sale, service_product, invoices(id, status, invoice_type)')
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
            toDateInputValue(),
            requestedClient || null,
            'Factura'
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
            .select('id, invoice_number, invoice_type, cliente_id, cliente_nombre, cliente_rtn, cliente_direccion, cliente_email, total, currency, point_of_sale, cai, rango_desde')
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
          let parentPoint = parent.point_of_sale
          if (!parentPoint && parent.cai) {
            const { data: range } = await supabase.from('cai_ranges').select('point_of_sale')
              .eq('cai', parent.cai).eq('rango_desde', parent.rango_desde).limit(1).maybeSingle()
            parentPoint = range?.point_of_sale
          }
          setParentPointOfSale(parentPoint || '')
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
            .select('description, quantity, unit_price, amount, discount_amount, sort_order, isv_rate, tax_treatment, income_account_id, service_catalog_kind, service_catalog_code')
            .eq('invoice_id', parentId)
            .order('sort_order')

          if (parentItems && parentItems.length > 0) {
            setItems(parentItems.map((it) => ({
              id: crypto.randomUUID(),
              description: it.description,
              quantity: String(it.quantity),
              unit_price: String(it.unit_price),
              discount_amount: String(it.discount_amount||0),
              income_account_id: it.income_account_id || '',
              service_catalog_kind: it.service_catalog_kind as ServiceSourceKind | undefined,
              service_catalog_code: it.service_catalog_code || undefined,
              tax_treatment: it.tax_treatment as TaxTreatment | undefined,
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
      if (active) setLoadedContext(context)
    }

    void init().catch(() => { if (active) { setDraftError('No se pudo cargar el formulario. Recarga para reintentar.'); setDraftLoading(false) } })
    return () => { active = false }
  }, [parentId, docType, requestedQuotationId, requestedDraft, correctionSource, restoreDraft, applyQuotation, context])

  useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(async () => {
      if (!IS_FISCAL[invoiceType] || !pointOfSale) {
        setActiveCai(null)
        return
      }

      const { data, error } = await supabase
        .from('cai_ranges')
        .select('*')
        .eq('document_type', invoiceType)
        .eq('point_of_sale', pointOfSale)
        .eq('is_active', true)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        toast.error('Error al cargar el rango CAI', { description: error.message })
      }
      setActiveCai((data as CaiRange | null) ?? null)
    }, 0)

    return () => { cancelled = true; window.clearTimeout(timeout) }
  }, [invoiceType, pointOfSale])

  useEffect(() => {
    if (!clienteId || parentId || invoiceType !== 'Factura') {
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
        if (field === 'isv_rate') updated.tax_treatment = Number(value) > 0 ? 'Gravada' : 'Exenta'
        const qty = parseFloat(String(updated.quantity)) || 0
        const price = parseFloat(String(updated.unit_price)) || 0
        updated.amount = Math.round(qty * price * 100) / 100 - Number(updated.discount_amount || 0)
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
  const conversionNeeded = Boolean(quotationId && sourceCurrency && sourceCurrency !== currency)
  const conversionValid = !conversionNeeded || (fiscalOptions.conversionEnabled && Number.isFinite(Number(fiscalOptions.conversionRate)) && Number(fiscalOptions.conversionRate) > 0 && Number(fiscalOptions.conversionRate) <= 1000000)
  let fiscalError = ''
  let discountTotal = 0
  let amounts = calculateInvoiceFiscal([], fiscalOptions.mode)
  try {
    const prepared = items.map(item => ({item,line:invoiceLineAmounts(Number(item.quantity),Number(item.unit_price),Number(item.discount_amount||0),conversionNeeded&&conversionValid?{currency,rate:Number(fiscalOptions.conversionRate),operation:fiscalOptions.conversionOperation}:undefined)}))
    discountTotal=prepared.reduce((sum,{line})=>sum+line.discount,0)
    const displayItems=prepared.map(({item,line})=>({...item,amount:line.net}))
    amounts = calculateInvoiceFiscal(displayItems, fiscalOptions.mode)
  }
  catch (error) { fiscalError = error instanceof Error ? error.message : 'Revisa los importes de las líneas.' }
  const importeExento = amounts.exempt
  const importeGravado15 = amounts.taxable15
  const importeGravado18 = amounts.taxable18
  const isv15Amount = amounts.tax15
  const isv18Amount = amounts.tax18
  const subtotal = amounts.subtotal
  const taxAmount = amounts.tax
  const total = amounts.total
  const totalLps = currency === 'USD' ? total * (parseFloat(exchangeRate) || 1) : total
  const paymentTerms = getClientPaymentTerms(selectedCliente)

  const formReady = loadedContext === context && !draftLoading && !draftError
  const editorState: DraftEditorState = { invoiceType: 'Factura', clienteId, quotationId, issueDate, dueDate, currency, exchangeRate, notes, motivo, items, fiscalOptions, sourceCurrency }
  const draftDirty = !draft || draftEditorSignature(draft.editor_state) !== draftEditorSignature(editorState)
  const sourceInvoiceId = draft?.source_invoice_id || correctionSource || null
  async function persistDraft() {
    if (draft && !draftDirty) return draft
    const invoice = draftInvoicePayload(editorState, fiscalOptionsPayload({ ...fiscalOptions, conversionEnabled: conversionNeeded && fiscalOptions.conversionEnabled }, sourceCurrency), pointOfSale)
    const args = { p_id: draft?.id || draftIdentity.current, p_revision: draft?.revision || 0, p_invoice: invoice,
      p_items: draftItemPayload(items), p_editor_state: editorState, p_quotation_id: quotationId || null, p_source_invoice_id: sourceInvoiceId }
    const signature = draftEditorSignature(args)
    if (draftAttempt.current.signature !== signature) draftAttempt.current = { signature, key: crypto.randomUUID() }
    const result = await supabase.rpc('save_invoice_draft', { ...args, p_request_key: draftAttempt.current.key })
    if (result.error || !result.data) throw new Error(result.error?.message || 'No se pudo confirmar el guardado. Reintenta sin cambiar el borrador.')
    if (owner.current !== context) return null
    const saved = result.data as InvoiceDraft
    draftIdentity.current = saved.id; setDraft(saved)
    return saved
  }
  async function handleSaveDraft() {
    if (!formReady || saving || saveLock.current === context || invoiceType !== 'Factura') return
    saveLock.current = context; setSaving(true)
    try {
      const saved = await persistDraft()
      if (saved && owner.current === context) {
        markFormSaved(); toast.success('Borrador guardado. Todavía no se ha asignado número fiscal.')
        router.replace(`/invoicing/new?draft=${saved.id}`)
      }
    } catch (error) { if (owner.current === context) toast.error((error as Error).message) }
    finally { if (saveLock.current === context) saveLock.current = ''; if (owner.current === context) setSaving(false) }
  }

  const handleSave = async () => {
    if (saveLock.current === context || saving || !formReady) return
    setSubmitted(true)
    if (fiscalError) { toast.error(fiscalError); return }
    if (!conversionValid) { toast.error('Confirma la conversión y su tasa antes de facturar en otra moneda'); return }
    if (fiscalOptions.referenceEnabled && (!Number.isFinite(Number(fiscalOptions.referenceRate)) || !(Number(fiscalOptions.referenceRate) > 0) || Number(fiscalOptions.referenceRate) > 1000000 || fiscalOptions.referenceCurrency === currency)) { toast.error('Revisa moneda y tasa de equivalencia'); return }
    if (fiscalOptions.mode === 'Gravada' && amounts.classification !== 'Gravada') { toast.error('Todas las líneas deben ser gravables para este tipo fiscal.'); return }
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
    if (!pointOfSale) { toast.error('Asigna una oficina activa en el perfil del cliente antes de facturar'); return }
    if (isFiscal && !canIssueFromOffice) { toast.error('Solicita al usuario máster autorización para emitir desde la oficina del cliente.'); return }
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
      line_discounts: Object.fromEntries(items.filter(item=>item.source_pricing_item_id).map(item=>[item.source_pricing_item_id!,Number(item.discount_amount||0)])),
      line_accounts: Object.fromEntries(items.filter(item => item.source_pricing_item_id && item.income_account_id).map(item => [item.source_pricing_item_id!, item.income_account_id])),
      point_of_sale: pointOfSale,
      invoice_type: invoiceType,
      cliente_id: clienteId,
      issue_date: issueDate,
      due_date: dueDate || null,
      currency,
      exchange_rate: parseFloat(exchangeRate) || 1,
      notes: notes || null,
      motivo: IS_NOTE[invoiceType] ? motivo : null,
      parent_invoice_id: parentId || null,
      ...fiscalOptionsPayload({ ...fiscalOptions, conversionEnabled: conversionNeeded && fiscalOptions.conversionEnabled }, sourceCurrency),
    }
    const itemPayload = items.map((item, index) => ({
        description: item.description.trim(),
        quantity: parseFloat(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        discount_amount: Number(item.discount_amount||0),
        isv_rate: item.isv_rate,
        tax_treatment: item.tax_treatment,
        income_account_id: item.income_account_id || null,
        service_catalog_kind: item.service_catalog_kind || null,
        service_catalog_code: item.service_catalog_code || null,
        sort_order: index,
      }))
    if (invoiceType === 'Factura') {
      saveLock.current = context
      try {
        if (sourceInvoiceId && (draftDirty || draft?.status !== 'Aprobada')) throw new Error('Guarda la propuesta y solicita aprobación del master antes de emitir la corrección.')
        const prepared = sourceInvoiceId ? draft : await persistDraft()
        if (!prepared || owner.current !== context) return
        const result = await supabase.rpc('issue_invoice_draft', { p_id: prepared.id, p_revision: prepared.revision })
        if (result.error) throw result.error
        const issued = (result.data as { invoice_id: string; invoice_number: string }[] | null)?.[0]
        if (!issued) throw new Error('No se pudo confirmar la emisión. El borrador se conserva para reintentar.')
        if (owner.current === context) { markFormSaved(); toast.success(`Factura ${issued.invoice_number} emitida`); router.push(`/invoicing/${issued.invoice_id}`) }
      } catch (error) { if (owner.current === context) toast.error((error as Error).message || 'No se pudo emitir; el borrador se conserva.') }
      finally { if (saveLock.current === context) saveLock.current = ''; if (owner.current === context) setSaving(false) }
      return
    }
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
    markFormSaved()
    router.push(
      requestedReturnTo
        ? `/invoicing/${invoice.invoice_id}?returnTo=${encodeURIComponent(returnHref)}`
        : `/invoicing/${invoice.invoice_id}`
    )
  }

  const isNote = IS_NOTE[invoiceType]
  const clienteLocked = !!parentInvoice

  const docLabel = invoiceType === 'Nota de Crédito' ? 'Nota de Crédito'
    : invoiceType === 'Nota de Débito' ? 'Nota de Débito'
    : invoiceType === 'Proforma' ? 'Proforma'
    : 'Factura'

  if (!formReady) return <div className="space-y-4 p-4">{draftError ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{draftError}</p> : <p role="status">Cargando formulario y borrador…</p>}<Link className={secondaryButtonClass} href="/invoicing/drafts">Volver a borradores</Link></div>

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard />
      {/* Header */}
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => requestFormNavigation(() => router.push(parentId ? `/invoicing/${parentId}` : returnHref))}
          className={secondaryButtonClass}
        >
          <ChevronLeft className="h-4 w-4" />
          Volver
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3282D] dark:text-rose-300">
            Finanzas · Facturación
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
            {draft ? `${draftLabel(draft.id)} · ${draft.status}` : sourceInvoiceId ? 'Preparar corrección de factura' : parentInvoice ? `Nueva ${docLabel}` : 'Nuevo documento'}
          </h1>
        </div>
      </div>
      {draftLoading && <p role="status">Cargando borrador y configuración…</p>}
      {draftError && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{draftError}</p>}
      {invoiceType === 'Factura' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-sm text-slate-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-slate-300"><div><p className="font-semibold">Prepara y confirma antes de emitir</p><p className="mt-1 text-xs">Puedes guardar información incompleta como borrador. El CAI, el correlativo y el saldo se asignan al emitir.</p></div><Link href="/invoicing/drafts" className="font-semibold text-[#B3282D] underline dark:text-rose-300">Ver borradores y correcciones</Link>{quotationId && selectedQuotation && <button type="button" disabled={saving || loadingQuotation} className={secondaryButtonClass} onClick={() => void applyQuotation(selectedQuotation)}>Volver a cargar líneas de cotización</button>}</div>}
      {draft?.source_invoice_id && <InvoiceCorrectionReview draft={draft} dirty={draftDirty} onChanged={setDraft} />}

      {/* Alert: no CAI activo para documentos fiscales */}
      {isFiscal&&pointOfSale&&!canIssueFromOffice&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">No tienes autorización de emisión para {pointOfSale}. El usuario máster puede habilitar esta oficina en Configuración contable. Puedes guardar el documento como borrador mientras se confirma el permiso.</p>}
      {isFiscal && !activeCai && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No hay un rango CAI activo para {invoiceType} en {pointOfSale || 'la oficina seleccionada'}. No se puede emitir este documento. <a href="/settings/cai" className="underline font-semibold">Registrar rango CAI →</a></span>
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
              Cliente: {parentInvoice.cliente_nombre} · Total: {formatMoney(parentInvoice.total, parentInvoice.currency)}
            </p>
            <p className="text-blue-600 dark:text-blue-400">
              Saldo pendiente: {formatMoney(parentInvoice.balance, parentInvoice.currency)}
            </p>
          </div>
        </div>
      )}

      {/* Main form */}
      <fieldset disabled={!formReady || saving} className="grid min-w-0 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
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
                  disabled={!!parentInvoice || Boolean(quotationId) || Boolean(draft) || Boolean(sourceInvoiceId)}
                  className={`${fieldClass} ${reqClass(submitted, invoiceType)} disabled:opacity-60`}
                >
                  <option value="Factura">Factura</option>
                  <option value="Proforma">Proforma</option>
                  <option value="Nota de Crédito">Nota de Crédito</option>
                  <option value="Nota de Débito">Nota de Débito</option>
                </select>
              </div>

              {/* Punto de venta de la emisión fiscal */}
              <div>
                <label htmlFor="invoice-point-of-sale" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Punto de venta <span className="text-red-500">*</span></label>
                <input id="invoice-point-of-sale" value={pointOfSale || 'Sin oficina asignada'} readOnly className={fieldClass} />
                <p className="mt-1 text-xs text-slate-500">La oficina corresponde al perfil del cliente; las notas conservan la oficina de su factura original.</p>
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

              {/* Cotización validada (solo Factura) */}
              {!parentId && invoiceType === 'Factura' && clienteId && (
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
                      <option value="">Factura manual</option>
                      {quotations.map((q) => {
                        const alreadyInvoiced = quotationHasActiveInvoice(q)
                        const validated = q.financial_validation_status === 'Validado'
                        return (
                          <option key={q.id} value={q.id} disabled={!validated || alreadyInvoiced}>
                            {q.quotation_number || q.id}
                            {q.total_sale ? ` · Total cotizado ${Number(q.total_sale).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
                            {!validated ? ' · Costos pendientes' : ''}
                            {alreadyInvoiced ? ' · Ya facturada' : ''}
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
                  onChange={(e) => { setCurrency(e.target.value); setFiscalOptions(prev => ({ ...prev, referenceCurrency: e.target.value === prev.referenceCurrency ? (e.target.value === 'USD' ? 'HNL' : 'USD') : prev.referenceCurrency })) }}
                  disabled={!!parentInvoice}
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
                  <NumberInput type="number"
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
                  <span>{formatDate(activeCai.fecha_limite_emision, '—')}</span>
                </div>
              </div>
            </section>
          )}

          <InvoiceFiscalOptions value={fiscalOptions} onChange={setFiscalOptions} currency={currency} sourceCurrency={quotationId ? sourceCurrency : undefined} disabled={saving} />

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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
              <div className="hidden grid-cols-[minmax(0,1fr)_72px_110px_150px_110px_36px] gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 lg:grid">
                <span>Descripción</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Precio unit. {conversionNeeded ? sourceCurrency : currency}</span>
                <span className="text-center">ISV</span>
                <span className="text-right">Importe {conversionNeeded ? sourceCurrency : currency}</span>
                <span />
              </div>

              <InvoiceLineSettingsProvider>
              {items.map((it) => (
                <div
                  key={it.id}
                  className="grid min-w-0 grid-cols-2 items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 lg:grid-cols-[minmax(0,1fr)_72px_110px_150px_110px_36px] lg:items-center lg:gap-2 lg:border-0 lg:p-0"
                >
                  <label className="flex min-w-0 flex-col gap-1.5 col-span-2 min-w-0 text-xs lg:col-span-1"><span className={fieldLabelClass}>Descripción</span>
                  <input
                    type="text"
                    placeholder="Descripción del servicio..."
                    value={it.description}
                    onChange={(e) => updateItem(it.id, 'description', e.target.value)}
                    readOnly={Boolean(it.source_pricing_item_id)}
                    className={`${fieldClass} text-sm read-only:bg-slate-50 read-only:text-slate-600 dark:read-only:bg-slate-800 ${submitted && !it.description ? 'border-red-400' : ''}`}
                  />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 min-w-0 text-xs"><span className={fieldLabelClass}>Cantidad</span>
                  <NumberInput type="number"
                    value={it.quantity}
                    onChange={(e) => updateItem(it.id, 'quantity', e.target.value)}
                    min="0"
                    step="1"
                    readOnly={Boolean(it.source_pricing_item_id)}
                    className={`${fieldClass} text-right text-sm read-only:bg-slate-50 read-only:text-slate-600 dark:read-only:bg-slate-800`}
                  />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1.5 min-w-0 text-xs"><span className={fieldLabelClass}>Precio unitario {currency}</span>
                  <NumberInput type="number"
                    value={it.unit_price}
                    onChange={(e) => updateItem(it.id, 'unit_price', e.target.value)}
                    min="0"
                    step="0.01"
                    readOnly={Boolean(it.source_pricing_item_id)}
                    className={`${fieldClass} text-right text-sm read-only:bg-slate-50 read-only:text-slate-600 dark:read-only:bg-slate-800`}
                  />
                  </label>
                  <div className="space-y-1">
                    <label className="flex gap-1 text-xs"><input type="checkbox" aria-label="Línea gravable" checked={it.isv_rate > 0 && fiscalOptions.mode !== 'Exonerada' && fiscalOptions.mode !== 'Exenta'} disabled={Boolean(it.source_pricing_item_id) || ['Exenta','Exonerada'].includes(fiscalOptions.mode)} onChange={e => { updateItem(it.id, 'isv_rate', e.target.checked ? 15 : 0); updateItem(it.id, 'tax_treatment', e.target.checked ? 'Gravada' : 'Exenta') }} />Gravable</label>
                    <select aria-label="Tasa ISV de línea" value={it.isv_rate} onChange={e => updateItem(it.id, 'isv_rate', Number(e.target.value))} disabled={Boolean(it.source_pricing_item_id) || ['Exenta','Exonerada'].includes(fiscalOptions.mode)} className={fieldClass}>
                      <option value={15}>15%</option><option value={18}>18%</option><option value={0}>Sin ISV</option>
                    </select>
                    {it.isv_rate === 0 && <select aria-label="Motivo sin ISV" className={fieldClass} disabled={Boolean(it.source_pricing_item_id) || ['Exenta','Exonerada'].includes(fiscalOptions.mode)} value={it.tax_treatment || 'Exenta'} onChange={e=>updateItem(it.id,'tax_treatment',e.target.value)}><option value="Exenta">Exenta</option><option value="Exonerada">Exonerada</option></select>}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    <span className="mb-1 block text-[10px] font-normal text-slate-500 lg:hidden">Importe neto</span>
                    {it.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  {it.source_pricing_item_id ? (
                    <span
                      title="Línea vinculada a la cotización"
                      className="col-span-2 flex h-9 w-9 items-center justify-center justify-self-end text-emerald-600 dark:text-emerald-400 lg:col-span-1"
                    >
                      <LockKeyhole className="h-4 w-4" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => requestItemRemoval(it)}
                      disabled={items.length === 1}
                      className="col-span-2 flex h-9 w-9 items-center justify-center justify-self-end rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 dark:hover:bg-rose-950/30 lg:col-span-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <label className="col-span-full flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">Descuento de esta línea {conversionNeeded?sourceCurrency:currency}
                    <NumberInput type="number" aria-label="Descuento de línea" min="0" step="0.01" value={it.discount_amount??'0'} onChange={e=>updateItem(it.id,'discount_amount',e.target.value)} className={fieldClass+' max-w-40 text-right'}/>
                    <span>Se aplica antes del ISV.</span>
                  </label>
                  <InvoiceLineSettings accountId={it.income_account_id || ''} onAccount={account => updateItem(it.id,'income_account_id',account)} disabled={saving} readonlyService={Boolean(it.source_pricing_item_id)} reference={it.service_catalog_kind&&it.service_catalog_code?{kind:it.service_catalog_kind,code:it.service_catalog_code}:undefined} source={{rateCode:it.source_rate_code,itemType:it.source_item_type,product:it.source_product}} variant={fiscalAccountVariant(['Exenta','Exonerada'].includes(fiscalOptions.mode)?fiscalOptions.mode:it.tax_treatment,it.isv_rate)} onClearService={()=>setItems(previous=>previous.map(item=>item.id===it.id?{...item,service_catalog_kind:undefined,service_catalog_code:undefined}:item))} onService={service => {
                    const variant = service.tax_variant || (service.taxable ? 'I' : 'E')
                    setItems(previous=>previous.map(item=>item.id===it.id?{...item,description:service.label,isv_rate:variant==='I'?15:0,tax_treatment:variant==='I'?'Gravada':variant==='E'?'Exenta':'Exonerada',income_account_id:'',service_catalog_kind:service.kind,service_catalog_code:service.code}:item))
                  }}/>
                </div>
              ))}
              </InvoiceLineSettingsProvider>
            </div>
          </section>
        </div>

        {/* Right col */}
        <div className="space-y-4">
          <section className={cardClass}>
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Resumen {currency}</h2>
            {fiscalError && <p role="alert" className="text-sm text-red-600">{fiscalError}</p>}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Descuentos y rebajas</span><span>{currency} {discountTotal.toFixed(2)}</span></div>
              {isFiscal ? (
                <>
                  {importeExento > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Importe exento</span>
                      <span>{formatMoney(importeExento, currency)}</span>
                    </div>
                  )}
                  {importeGravado15 > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Gravado 15%</span>
                      <span>{formatMoney(importeGravado15, currency)}</span>
                    </div>
                  )}
                  {importeGravado18 > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Gravado 18%</span>
                      <span>{formatMoney(importeGravado18, currency)}</span>
                    </div>
                  )}
                  {isv15Amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">ISV 15%</span>
                      <span>{formatMoney(isv15Amount, currency)}</span>
                    </div>
                  )}
                  {isv18Amount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">ISV 18%</span>
                      <span>{formatMoney(isv18Amount, currency)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                    <span>{formatMoney(subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">ISV</span>
                    <span>{formatMoney(taxAmount, currency)}</span>
                  </div>
                </>
              )}
              {amounts.exonerated > 0 && <div className="flex justify-between"><span>Importe exonerado</span><span>{formatMoney(amounts.exonerated, currency)}</span></div>}
              {fiscalOptions.referenceEnabled && Number.isFinite(Number(fiscalOptions.referenceRate)) && Number(fiscalOptions.referenceRate)>0 && Number(fiscalOptions.referenceRate)<=1000000 && <p className="text-xs text-slate-500">Equivalencia informativa: {fiscalOptions.referenceCurrency} {convertMoney(total,{currency:fiscalOptions.referenceCurrency,rate:Number(fiscalOptions.referenceRate),operation:fiscalOptions.referenceOperation}).toFixed(2)}</p>}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-900 dark:text-white">Total</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {formatMoney(total, currency)}
                  </span>
                </div>
                {currency === 'USD' && (
                  <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>≈ HNL</span>
                    <span>{formatMoney(totalLps, 'HNL')}</span>
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
              <Link href={`/clientes/${selectedCliente.id}/edit`} className={`${financeLinkClass} mt-2 inline-block text-xs underline`}>Revisar nombre, RTN y domicilio en el perfil del cliente</Link>
            </section>
          )}

          <button
            type="button"
            onClick={() => invoiceType === 'Factura' ? setIssueConfirmation(true) : void handleSave()}
            disabled={saving || loadingQuotation || (isFiscal&&!canIssueFromOffice) || Boolean(sourceInvoiceId && (!isMaster || draftDirty || draft?.status !== 'Aprobada'))}
            className={`w-full ${primaryButtonClass}`}
          >
            {saving ? 'Guardando…' : invoiceType === 'Factura' ? sourceInvoiceId ? 'Emitir corrección aprobada' : 'Emitir factura' : `Generar ${docLabel}`}
          </button>
          {invoiceType === 'Factura' && <button type="button" onClick={() => void handleSaveDraft()} disabled={saving || loadingQuotation} className={`w-full ${secondaryButtonClass}`}>Guardar borrador</button>}
          <button
            type="button"
            onClick={() => requestFormNavigation(() => router.push(parentId ? `/invoicing/${parentId}` : returnHref))}
            className={`w-full ${secondaryButtonClass}`}
          >
            Cancelar
          </button>
        </div>
      </fieldset>
      <ConfirmDialog open={issueConfirmation} onOpenChange={setIssueConfirmation} title={sourceInvoiceId ? 'Emitir factura sustituta' : 'Emitir factura'} description="Se validará toda la información y se asignará un número fiscal. El documento emitido conservará su historial y generará su saldo por cobrar." confirmLabel="Confirmar emisión" onConfirm={() => { setIssueConfirmation(false); void handleSave() }} />
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
          ? `¿Deseas descartar ${itemPendingRemoval.description || 'esta línea'} por ${formatMoney(itemPendingRemoval.amount, currency)}?`
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
