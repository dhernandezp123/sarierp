'use client'

import { CustomsQuotationSection } from '@/src/components/quotations/CustomsQuotationSection'
import { buildCustomsPricingItems, hydrateCustomsCharges, newCustomsCharges, validateCustomsQuotation } from '@/src/lib/customs-quotation'
import { getCargoStructure, getProductTransportRule, isCustomsOnly, usesOwnPricing } from '@/src/lib/quotation-products'

import {
  type CargoDimensionLine, type CargoLineIssue, calculateLineCbm,
  calculateLineFt3, getAirChargeableWeights, getLineUnitWeightLbs,
  getLineTotalWeightLbs, getLineTotalWeightKg, normalizeLegacyBlankInchLine,
} from '@/src/lib/quotation-cargo'
import type { ContainerLine } from '@/src/lib/quotation-form'
import { getCargoSignature, getEditCargoTotals, getProductRuleMismatch, planQuotationEditCargo } from '@/src/lib/quotation-edit'
import { CargoLinesEditor } from '@/src/components/quotations/CargoLinesEditor'
import { ContainerLinesEditor } from '@/src/components/quotations/ContainerLinesEditor'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'

import { supabase } from '../../../../../lib/supabase/client'
import { useUser } from '../../../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { SectionNav } from '@/src/components/ui/SectionNav'
import { createNotification } from '@/src/lib/notifications'
import { UnsavedChangesGuard, markFormSaved } from '@/src/components/ui/UnsavedChangesGuard'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { canTransition } from '@/src/lib/quotation-status'
import { quotationRevision } from '@/src/lib/quotation-transition'
import {
  fetchActiveServiceProducts,
  serviceProducts,
} from '@/src/lib/quotation-products'
import { useMiamiQuotation } from '@/src/hooks/useMiamiQuotation'
import { MiamiQuotationSection } from '@/src/components/quotations/MiamiQuotationSection'
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  fieldLabelClass,
} from '@/src/lib/ui-classes'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const editorSections = [
  { href: '#quote-general' as const, label: 'General' },
  { href: '#quote-route' as const, label: 'Ruta' },
  { href: '#quote-cargo' as const, label: 'Carga' },
  { href: '#quote-insurance' as const, label: 'Seguro' },
  { href: '#quote-notes' as const, label: 'Observaciones' },
  { href: '#quote-actions' as const, label: 'Guardar' },
]

type PricingItem = {
  id?: string
  description: string | null
  item_type: string | null
  quantity: number | string | null
  cost_amount: number | string | null
  sale_amount: number | string | null
  total_amount?: number | string | null
  taxable?: boolean | null
}

function AccessDenied() {
  return (
    <div className={cardClass}>
      <h1 className="text-2xl font-bold">Acceso restringido</h1>
      <p className="mt-2 text-gray-500">
        {'No tienes permiso para ver este m\u00f3dulo.'}
      </p>
    </div>
  )
}

export default function EditQuotationPage() {
  const { profile, loading: userLoading } = useUser()
  const params = useParams()
  const router = useRouter()
  const role = profile?.rol || ''
  const isAdmin = role === 'Admin'
  const isSales = role === 'Ventas'
  const isOperations = role === 'Operaciones'
  const canEditQuotes =
    isAdmin || isSales || isOperations

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const saveInFlight = useRef(false)
  const [quotationNumber, setQuotationNumber] = useState<string | null>(null)
  const [sendPricingDialogOpen, setSendPricingDialogOpen] = useState(false)
  const [statusRevision, setStatusRevision] = useState<number | string | null>(null)
  const [repricingReason, setRepricingReason] = useState('')
  const [savingAfterEdit, setSavingAfterEdit] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [originalClienteId, setOriginalClienteId] = useState('')
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])
  const [packageTypes, setPackageTypes] = useState<any[]>([])
  const [containerTypes, setContainerTypes] = useState<any[]>([])
  const [containerLines, setContainerLines] = useState<ContainerLine[]>([])
  const [cargoLines, setCargoLines] = useState<CargoDimensionLine[]>([])
  const [cargoLineIssues, setCargoLineIssues] = useState<Record<string, CargoLineIssue[]>>({})
  // Carga tal como se abrió (o se guardó por última vez) para saber si se modificó.
  const loadedCargo = useRef({ quoteType: '', containers: [] as ContainerLine[], cargo: [] as CargoDimensionLine[] })
  const [modeChangePending, setModeChangePending] = useState<{
    kind: 'quote_type' | 'service_product' | 'product_rule'
    value: string
    transport?: string
    discarded: 'containers' | 'cargo'
  } | null>(null)
  const [pricingItems, setPricingItems] = useState<PricingItem[]>([])
  const [customsCharges, setCustomsCharges] = useState(newCustomsCharges)

  const [formData, setFormData] = useState({
    cliente_id: '',
    status: '',
    service_product: '',
    quote_type: '',
    valid_until: '',

    contact_name: '',
    contact_email: '',
    contact_phone: '',

    incoterm: '',
    tipo_transporte: '',

    origen: '',
    destino: '',
    puerto_origen: '',
    puerto_destino: '',
    pickup_address: '',
    delivery_address: '',

    preferred_carrier: '',
    transit_time: '',
    target_rate: '',

    container_type: '',
    package_type: '',
    package_details: '',
    peso_kg: '',
    gross_weight: '',
    volumen_cbm: '',
    cantidad_bultos: '',
    commodity: '',

    requires_insurance: false,
    commercial_value: '',

    pricing_notes: '',
    client_notes: '',
    observaciones: '',
  })
  const [serviceProductOptions, setServiceProductOptions] =
    useState(serviceProducts)

  const fetchPricingUsers = async () => {
    const { data: pricingUsers, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('rol', 'Pricing')
      .eq('is_active', true)

    if (error) throw error
    return pricingUsers || []
  }

  const fetchCatalogs = async () => {
    const [
      countriesResult,
      portsResult,
      packageTypesResult,
      containerTypesResult,
      activeServiceProducts,
    ] = await Promise.all([
      supabase
        .from('countries')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('ports')
        .select('*, countries(name)')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('package_types')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('container_types')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true }),
      fetchActiveServiceProducts(supabase),
    ])

    const catalogError = [
      countriesResult.error,
      portsResult.error,
      packageTypesResult.error,
      containerTypesResult.error,
    ].find(Boolean)

    if (catalogError) {
      toast.error(catalogError.message)
    }

    setCountries(countriesResult.data || [])
    setPorts(portsResult.data || [])
    setPackageTypes(packageTypesResult.data || [])
    setContainerTypes(containerTypesResult.data || [])
    setServiceProductOptions(activeServiceProducts)
  }

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('id, codigo_cliente, nombre, email_1, telefono, origen_frecuente')
      .is('deleted_at', null)
      .order('nombre', { ascending: true })

    if (error) {
      setLoadError(error.message)
      return
    }

    setClientes(data || [])
  }

  const fetchQuotation = async (id: string) => {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) {
      toast.error(error.message)
      return
    }

    setStatusRevision(data.status_revision)
    loadedCargo.current.quoteType = data.quote_type || ''
    setFormData({
      cliente_id: data.cliente_id || '',
      status: data.status || '',
      service_product: data.service_product || '',
      quote_type: data.quote_type || '',
      valid_until: data.valid_until || '',

      contact_name: data.contact_name || '',
      contact_email: data.contact_email || '',
      contact_phone: data.contact_phone || '',

      incoterm: data.incoterm || '',
      tipo_transporte: data.tipo_transporte || '',

      origen: data.origen || '',
      destino: data.destino || '',
      puerto_origen: data.puerto_origen || '',
      puerto_destino: data.puerto_destino || '',
      pickup_address: data.pickup_address || '',
      delivery_address: data.delivery_address || '',

      preferred_carrier: data.preferred_carrier || '',
      transit_time: data.transit_time || '',
      target_rate: data.target_rate && Number(data.target_rate) !== 0 ? data.target_rate.toString() : '',

      container_type: data.container_type || '',
      package_type: data.package_type || '',
      package_details: data.package_details || '',
      peso_kg: data.peso_kg && Number(data.peso_kg) !== 0 ? data.peso_kg.toString() : '',
      gross_weight: data.gross_weight && Number(data.gross_weight) !== 0 ? data.gross_weight.toString() : '',
      volumen_cbm: data.volumen_cbm && Number(data.volumen_cbm) !== 0 ? data.volumen_cbm.toString() : '',
      cantidad_bultos: data.cantidad_bultos && Number(data.cantidad_bultos) !== 0 ? data.cantidad_bultos.toString() : '',
      commodity: data.commodity || '',

      requires_insurance: data.requires_insurance || false,
      commercial_value: data.commercial_value?.toString() || '',

      pricing_notes:
        data.pricing_notes || data.notes || data.observaciones || '',
      client_notes: data.client_notes || '',
      observaciones: data.observaciones || '',
    })

    setQuotationNumber(data.quotation_number || null)
    setOriginalClienteId(data.cliente_id || '')
  }

  const fetchPricingItems = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('pricing_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setPricingItems((data || []) as PricingItem[])
    setCustomsCharges(hydrateCustomsCharges(data || []))
  }

  const fetchContainerLines = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_containers')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    const lines: ContainerLine[] = (data || []).map((line) => ({
      container_type_id: line.container_type_id || '',
      container_type_name: line.container_type_name || '',
      quantity: Number(line.quantity || 1),
      notes: line.notes || null,
    }))
    loadedCargo.current.containers = lines
    setContainerLines(lines)
  }

  const fetchCargoLines = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_cargo_lines')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    const lines = (data || []).map((line): CargoDimensionLine => {
      const hasDimensions =
        Number(line.length || 0) > 0 &&
        Number(line.width || 0) > 0 &&
        Number(line.height || 0) > 0
      const hasSavedCbm = Number(line.cbm || 0) > 0
      const volumeMode = !hasDimensions && hasSavedCbm ? 'manual' : 'dimensions'

      return {
        id: line.id || crypto.randomUUID(),
        quantity: String(line.quantity || 1),
        packageType: line.package_type || 'Caja',
        length: line.length ? String(line.length) : '',
        width: line.width ? String(line.width) : '',
        height: line.height ? String(line.height) : '',
        dimensionUnit: line.dimension_unit || 'in',
        weight: line.weight_lbs ? String(line.weight_lbs) : '',
        weightUnit: 'lbs',
        volumeMode,
        manualCbm: volumeMode === 'manual' ? String(line.cbm || '') : '',
      }
    }).map(normalizeLegacyBlankInchLine)
    loadedCargo.current.cargo = lines
    setCargoLines(lines)
  }

  useEffect(() => {
    if (userLoading) return

    if (!canEditQuotes) {
      setLoading(false)
      return
    }

    const quotationId = params.id as string | undefined
    if (!quotationId) {
      setLoadError('No se recibi\u00f3 una cotizaci\u00f3n v\u00e1lida.')
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setLoadError('')

    void Promise.allSettled([
      fetchCatalogs(),
      fetchClientes(),
      fetchQuotation(quotationId),
      fetchContainerLines(quotationId),
      fetchCargoLines(quotationId),
      fetchPricingItems(quotationId),
    ])
      .then((results) => {
        const rejected = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected'
        )
        if (active && rejected) {
          setLoadError(
            rejected.reason instanceof Error
              ? rejected.reason.message
              : 'No se pudieron cargar todos los datos de la cotizaci\u00f3n.'
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [params.id, userLoading, canEditQuotes, loadAttempt])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target

    setFormData({
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    })
  }

  const handleClienteChange = (clienteId: string) => {
    if (clienteId === formData.cliente_id) return

    const selectedCliente = clientes.find((cliente) => cliente.id === clienteId)

    setFormData((current) => ({
      ...current,
      cliente_id: clienteId,
      contact_name: selectedCliente?.contacto || '',
      contact_email: selectedCliente?.email_1 || '',
      contact_phone: selectedCliente?.telefono || '',
      origen: selectedCliente?.origen_frecuente || current.origen,
    }))
  }

  const applyServiceProductChange = (serviceProduct: string) => {
    setFormData((prev) => ({
      ...prev,
      service_product: serviceProduct,
      ...(serviceProduct === 'miami_lcl'
        ? {
            tipo_transporte: 'Marítima',
            quote_type: 'LCL',
          }
        : {}),
      ...(serviceProduct === 'miami_air' || serviceProduct === 'other_origin_air'
        ? {
            tipo_transporte: 'Aéreo',
            quote_type: 'Consolidado',
          }
        : {}),
    }))
  }

  const handleServiceProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceProduct = e.target.value
    const changesToLooseCargo = ['miami_lcl', 'miami_air', 'other_origin_air'].includes(serviceProduct)
    if (changesToLooseCargo && containerLines.length > 0) {
      setModeChangePending({
        kind: 'service_product',
        value: serviceProduct,
        discarded: 'containers',
      })
      return
    }
    applyServiceProductChange(serviceProduct)
  }

  const requestQuoteTypeChange = (value: string) => {
    const nextUsesContainers = value === 'FCL' || value === 'FTL'
    if (!nextUsesContainers && containerLines.length > 0) {
      setModeChangePending({ kind: 'quote_type', value, discarded: 'containers' })
      return
    }
    if (nextUsesContainers && cargoLines.length > 0) {
      setModeChangePending({ kind: 'quote_type', value, discarded: 'cargo' })
      return
    }
    setFormData((prev) => ({ ...prev, quote_type: value }))
  }

  const confirmModeChange = () => {
    if (!modeChangePending) return
    if (modeChangePending.kind === 'service_product') {
      applyServiceProductChange(modeChangePending.value)
    } else if (modeChangePending.kind === 'product_rule') {
      setFormData((prev) => ({
        ...prev,
        tipo_transporte: modeChangePending.transport || prev.tipo_transporte,
        quote_type: modeChangePending.value,
      }))
    } else {
      setFormData((prev) => ({ ...prev, quote_type: modeChangePending.value }))
    }
    setModeChangePending(null)
  }

  // Corrige una cotización antigua cuyo transporte/modalidad no corresponde al producto.
  // Si la estructura de carga cambia, pasa por la misma confirmación que la modalidad.
  const applyProductRule = () => {
    const mismatch = getProductRuleMismatch(formData.service_product, formData.tipo_transporte, formData.quote_type)
    if (!mismatch) return
    const { tipo_transporte, quote_type } = mismatch.target
    const nextUsesContainers = quote_type === 'FCL' || quote_type === 'FTL'
    const discarded = quote_type && !nextUsesContainers && containerLines.length > 0
      ? 'containers'
      : nextUsesContainers && cargoLines.length > 0
        ? 'cargo'
        : null
    if (discarded) {
      setModeChangePending({ kind: 'product_rule', value: quote_type, transport: tipo_transporte, discarded })
      return
    }
    setFormData((prev) => ({ ...prev, tipo_transporte, quote_type }))
    if (!quote_type) toast.info(`Selecciona la modalidad: ${mismatch.rule.modalities.join(' o ')}`)
  }

  const handleSendToPricing = async () => { await handleSave(true) }

  const handleSave = async (sendToPricing = false) => {
    if (!params.id || saveInFlight.current) return
    if (sendToPricing && (formData.status === 'Ganada' || !canTransition(formData.status, 'Pendiente de Fijar Precios'))) {
      toast.error('No se puede enviar desde este estado. Para una cotización ganada usa Reabrir para Repricing.')
      return
    }
    if (sendToPricing && (!formData.tipo_transporte || !formData.quote_type)) {
      toast.error('Selecciona el transporte y tipo de cotización')
      return
    }
    if (sendToPricing && formData.status !== 'Borrador' && !repricingReason.trim()) {
      setSendPricingDialogOpen(true)
      toast.error('Ingresa el motivo para volver a solicitar pricing.')
      return
    }

    if (!formData.cliente_id) {
      toast.error('Debes seleccionar un cliente')
      return
    }

    if (!formData.commodity.trim() && (!isCustomsOnly(formData.service_product) || formData.status !== 'Borrador' || sendToPricing)) {
      toast.error('Debes ingresar Commodity/Descripción de la carga')
      return
    }
    if (isCustomsOnly(formData.service_product)) {
      const error = validateCustomsQuotation(customsCharges, formData, formData.status === 'Borrador' && !sendToPricing)
      if (error) { toast.error(error); return }
    }

    const isMiamiCargo = usesOwnPricing(formData.service_product) && !isCustomsOnly(formData.service_product)
    const cargoStructure = isMiamiCargo ? 'loose' : getCargoStructure(formData.quote_type)
    const cargoPlan = planQuotationEditCargo({
      status: formData.status,
      sendToPricing,
      isMiamiFlow: isMiamiCargo,
      quoteType: formData.quote_type,
      cargoIntact:
        getCargoSignature(formData.quote_type, containerLines, cargoLines) ===
        getCargoSignature(loadedCargo.current.quoteType, loadedCargo.current.containers, loadedCargo.current.cargo),
      containerLines,
      cargoLines,
      productMismatch: Boolean(productMismatch),
    })
    setCargoLineIssues(cargoPlan.issuesByLine)
    if (!cargoPlan.ok) {
      toast.error(cargoPlan.message)
      const target = document.querySelector<HTMLElement>(`[data-field="${cargoPlan.field}"], [name="${cargoPlan.field}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (target?.matches('select, input, textarea')) target.focus({ preventScroll: true })
      return
    }
    const replacesCargo = cargoPlan.replace
    const savedCargoLines = cargoPlan.cargoLinesToSave
    const cargoTotals = getEditCargoTotals({
      structure: cargoStructure,
      replace: replacesCargo,
      savedCargoLines,
      formTotals: formData,
    })

    const quotationId = params.id as string
    const saveIsMiamiFlow = usesOwnPricing(formData.service_product)

    if (miami.isMiamiFlow && !miami.canUseMiamiCalculator) {
      toast.error('No hay tarifas Miami disponibles para este cliente. Revisa las tarifas antes de guardar.')
      return
    }

    if (formData.service_product === 'miami_lcl' && miami.lclEstimated <= 0) {
      toast.error('Ingresa FT3 o libras para calcular la tarifa Miami LCL')
      return
    }

    if (formData.service_product === 'miami_air' && miami.airEstimated <= 0) {
      toast.error('Ingresa KG para calcular la tarifa Miami Aereo')
      return
    }

    const miamiPricingItems = isCustomsOnly(formData.service_product)
      ? buildCustomsPricingItems(quotationId, customsCharges, miami.taxRatePercent, miami.supplierName, profile?.id)
      : saveIsMiamiFlow
      ? miami.buildMiamiPricingItems(quotationId)
      : []
    const miamiTotalCost = miamiPricingItems.reduce(
      (sum, item) =>
        sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
      0
    )
    const miamiTotalSale = miamiPricingItems.reduce(
      (sum, item) =>
        sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
      0
    )
    const miamiProfit = miamiTotalSale - miamiTotalCost
    const miamiGpPercentage =
      miamiTotalSale > 0 ? (miamiProfit / miamiTotalSale) * 100 : 0

    saveInFlight.current = true
    setSaving(true)
    let persisted = false

    try {
      const quotationPayload = {
        cliente_id: formData.cliente_id,
        service_product: formData.service_product || null,
        quote_type: formData.quote_type,
        valid_until: formData.valid_until || null,

        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,

        incoterm: formData.incoterm,
        tipo_transporte: formData.tipo_transporte,

        origen: formData.origen,
        destino: formData.destino,
        puerto_origen: formData.puerto_origen,
        puerto_destino: formData.puerto_destino,
        pickup_address: formData.pickup_address,
        delivery_address: formData.delivery_address,

        preferred_carrier: formData.preferred_carrier,
        transit_time: formData.transit_time || null,
        target_rate: Number(formData.target_rate || 0),

        container_type: formData.container_type,
        package_type: formData.package_type,
        package_details: formData.package_details,
        ...cargoTotals,
        gross_weight: Number(formData.gross_weight || 0),
        commodity: formData.commodity,

        requires_insurance: formData.requires_insurance,
        commercial_value: Number(formData.commercial_value || 0),

        pricing_notes: formData.pricing_notes || null,
        observaciones: formData.observaciones || null,
        ...(saveIsMiamiFlow
          ? { client_notes: formData.client_notes || null }
          : {}),
        ...(saveIsMiamiFlow
          ? {
              total_cost: miamiTotalCost,
              total_sale: miamiTotalSale,
              profit_amount: miamiProfit,
              gp_percentage: miamiGpPercentage,
            }
          : {}),
      }

      const containerRows = replacesCargo && cargoStructure === 'containers'
        ? containerLines.map((line) => ({
            container_type_id: line.container_type_id,
            container_type_name: line.container_type_name,
            quantity: Number(line.quantity || 1),
            notes: line.notes || null,
          }))
        : []
      const cargoRows = replacesCargo && cargoStructure === 'loose'
        ? savedCargoLines.map((line) => ({
            package_type: line.packageType,
            quantity: Number(line.quantity || 0),
            length: Number(line.length || 0),
            width: Number(line.width || 0),
            height: Number(line.height || 0),
            dimension_unit: line.dimensionUnit,
            weight_lbs: getLineUnitWeightLbs(line),
            ft3: calculateLineFt3(line),
            cbm: calculateLineCbm(line),
          }))
        : []

      const { error } = await supabase.rpc('save_quotation_edit', {
        p_quotation_id: quotationId,
        p_expected_status: formData.status,
        p_expected_revision: quotationRevision({ id: quotationId, status: formData.status, status_revision: statusRevision }),
        p_repricing_reason: repricingReason.trim() || null,
        p_quotation_data: quotationPayload,
        p_replace_containers: replacesCargo,
        p_container_lines: containerRows,
        p_replace_cargo: replacesCargo,
        p_cargo_lines: cargoRows,
        p_replace_pricing: saveIsMiamiFlow,
        p_pricing_items: saveIsMiamiFlow ? miamiPricingItems : [],
        p_send_to_pricing: sendToPricing,
      })
      if (error) throw error
      persisted = true
      loadedCargo.current = { quoteType: formData.quote_type, containers: containerLines, cargo: cargoLines }
      if (cargoPlan.warning) toast.warning(cargoPlan.warning)
      if (saveIsMiamiFlow) setPricingItems(miamiPricingItems as PricingItem[])
      if (sendToPricing && !isCustomsOnly(formData.service_product)) {
        setFormData(previous => ({ ...previous, status: 'Pendiente de Fijar Precios' }))
        setSendPricingDialogOpen(false)
        try {
          const users = await fetchPricingUsers()
          const results = await Promise.all(users.map(pricingUser => createNotification({
            userId: pricingUser.id, title: 'Cotización enviada a Pricing',
            message: 'Se guardaron los cambios y se recibió una solicitud de cotización.', type: 'info',
          })))
          if (results.some(result => result.error)) throw new Error('Avisos incompletos')
        } catch { toast.warning('La cotización se guardó y envió, pero no se pudo notificar a todo el equipo de Pricing.') }
      }
      if (originalClienteId && originalClienteId !== formData.cliente_id) {
        await createActivityLog({
          module: 'quotations',
          action: 'change_client',
          entityType: 'quotation',
          entityId: quotationId,
          description: `Cliente de la cotización ${quotationNumber || quotationId} actualizado`,
          metadata: {
            previous_cliente_id: originalClienteId,
            new_cliente_id: formData.cliente_id,
          },
        })
        setOriginalClienteId(formData.cliente_id)
      }

      // Notify Operaciones if there is an active Shipping Instruction for this quotation
      const { data: siLinked } = await supabase
        .from('shipping_instructions')
        .select('id, routing_number, shipment_status')
        .eq('quotation_id', quotationId)
        .not('shipment_status', 'in', '("Finalizado","Cancelada")')
        .limit(1)
        .maybeSingle()

      if (siLinked) {
        const { data: opUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('rol', 'Operaciones')
          .eq('is_active', true)
          .eq('status', 'Aprobado')

        if (opUsers && opUsers.length > 0) {
          const siLabel = siLinked.routing_number || siLinked.id
          try {
            const notificationResults = await Promise.all(
              opUsers.map((u) =>
                createNotification({
                  userId: u.id,
                  title: 'Cotización modificada con SI activa',
                  message: `La cotización ${quotationNumber || quotationId} (SI: ${siLabel}) fue modificada.`,
                  type: 'warning',
                })
              )
            )
            if (notificationResults.some((result) => result.error)) {
              throw new Error('No se pudieron crear todas las notificaciones')
            }
          } catch {
            toast.warning('Los cambios se guardaron, pero no se pudo notificar a Operaciones')
          }
        }
      }

      toast.success(sendToPricing && isCustomsOnly(formData.service_product) ? 'Cotización de aduanas aprobada' : sendToPricing ? 'Cambios guardados y cotización enviada a Pricing' : 'Cambios guardados correctamente')

      if (!sendToPricing && !saveIsMiamiFlow && formData.status === 'Borrador') {
        setSendPricingDialogOpen(true)
        return
      }
      markFormSaved()
      router.push(`/quotations/${params.id}`)
    } catch (error) {
      if (persisted) {
        toast.warning('Los cambios se guardaron, pero no se completaron los avisos posteriores.')
        router.push('/quotations/' + params.id)
      } else {
        toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message || 'No se pudieron guardar los cambios. Intenta nuevamente.')
      }
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  const totalCargoFt3 = cargoLines.reduce(
    (sum, line) => sum + calculateLineFt3(line),
    0
  )

  const totalCargoCbm = cargoLines.reduce(
    (sum, line) => sum + calculateLineCbm(line),
    0
  )

  const totalCargoWeight = cargoLines.reduce(
    (sum, line) => sum + getLineTotalWeightLbs(line),
    0
  )

  const totalCargoKg = cargoLines.reduce(
    (sum, line) => sum + getLineTotalWeightKg(line),
    0
  )

  const miami = useMiamiQuotation({
    clienteId: formData.cliente_id,
    serviceProduct: formData.service_product,
    incoterm: formData.incoterm,
    totalCargoFt3,
    totalCargoCbm,
    totalCargoWeight,
    createdBy: profile?.id,
    initialPricingItems: pricingItems,
  })

  if (userLoading || loading) {
    return <PageSkeleton cards={1} rows={10} />
  }

  if (!canEditQuotes) {
    return <AccessDenied />
  }

  if (loadError) {
    return (
      <div className={cardClass} role="alert">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {'No se pudo cargar la cotizaci\u00f3n'}
        </h1>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {loadError}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className={primaryButtonClass}
          >
            Reintentar
          </button>
          <Link href="/quotations" className={secondaryButtonClass}>
            Volver a cotizaciones
          </Link>
        </div>
      </div>
    )
  }

  const originCountry = countries.find(
    (country) => country.name === formData.origen
  )

  const destinationCountry = countries.find(
    (country) => country.name === formData.destino
  )

  const originPorts = originCountry
    ? ports.filter((port) => port.country_id === originCountry.id)
    : ports

  const destinationPorts = destinationCountry
    ? ports.filter((port) => port.country_id === destinationCountry.id)
    : ports

  const quoteTypeOptions: Record<string, string[]> = {
    'Aéreo': ['Courier', 'Consolidado'],
    'Marítima': ['LCL', 'FCL'],
    Terrestre: ['LTL', 'FTL'],
  }

  const packageTypeOptions =
    packageTypes.length > 0
      ? packageTypes.map((packageType) => packageType.name)
      : [
          'Cajas',
          'Pallets',
          'Envases',
          'Tubos',
          'Cajas metálicas',
          'Cilindros',
          'Rollos',
          'Sacos',
          'Granel',
          'Otro',
        ]

  const formLabelClass =
    'text-xs font-medium text-slate-500 dark:text-slate-400'
  const sectionTitleClass = 'text-xl font-bold text-slate-900'

  const fieldGroupClass = 'flex flex-col gap-1.5'
  const compactFieldClass = `${fieldClass} md:max-w-[180px]`
  const moneyFieldClass = `${fieldClass} md:max-w-[220px]`
  const dateFieldClass = `${fieldClass} md:max-w-[220px]`
  const shortTextFieldClass = `${fieldClass} md:max-w-[260px]`
  const mediumFieldClass = `${fieldClass} md:max-w-xl`

  const requiresContainerLines =
    formData.quote_type === 'FCL' || formData.quote_type === 'FTL'

  const isMiamiFlow = miami.isMiamiFlow
  const isCustomsFlow = isCustomsOnly(formData.service_product)

  const requiresLooseCargo =
    formData.quote_type === 'LCL' ||
    formData.quote_type === 'LTL' ||
    formData.quote_type === 'Consolidado' ||
    formData.quote_type === 'Courier' ||
    isMiamiFlow

  const removalNote = 'La eliminación será definitiva al guardar la cotización.'
  const airWeights = formData.tipo_transporte === 'Aéreo'
    ? getAirChargeableWeights(totalCargoKg, totalCargoCbm)
    : null
  const productMismatch = isCustomsFlow
    ? null
    : getProductRuleMismatch(formData.service_product, formData.tipo_transporte, formData.quote_type)
  const productLabel =
    serviceProductOptions.find((product) => product.value === formData.service_product)?.label ||
    formData.service_product
  // Con regla de producto solo se ofrecen sus opciones, más el valor guardado si no coincide.
  const withCurrent = (options: string[], current: string) =>
    current && !options.includes(current) ? [...options, current] : options
  const productRule = getProductTransportRule(formData.service_product)
  const transportOptions = withCurrent(
    productRule ? [productRule.transport] : ['Aéreo', 'Marítima', 'Terrestre'],
    formData.tipo_transporte
  )
  const modalityOptions = withCurrent(
    productRule && productRule.transport === formData.tipo_transporte
      ? productRule.modalities
      : quoteTypeOptions[formData.tipo_transporte] || [],
    formData.quote_type
  )

  return (
    <>
      <UnsavedChangesGuard />
      <div className="max-w-6xl space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Cotizaciones', href: '/quotations' },
            { label: quotationNumber || 'Cotización', href: `/quotations/${params.id}` },
            { label: 'Editar' },
          ]}
        />

        <div>
          <h1 className="text-4xl font-bold">Editar Cotización</h1>
          <p className="text-gray-500 mt-2">
            Modifica datos de la cotización sin recrear el flujo completo.
          </p>
        </div>

        <SectionNav
          items={isCustomsFlow
            ? editorSections.filter(item => ['#quote-general', '#quote-actions'].includes(item.href))
            : isMiamiFlow ? editorSections.filter(item => item.href !== '#quote-route') : editorSections}
          label="Secciones del editor de cotización"
        />

        <div className={cardClass}>
          <div className="space-y-8">
          {!canEditQuotes && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Modo lectura: tu rol no tiene permisos para editar cotizaciones.
            </p>
          )}

          <fieldset disabled={!canEditQuotes} className="contents">
          <section id="quote-general" className="scroll-mt-28">
            <h2 className="text-xl font-bold mb-4">Información General</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className={`${fieldGroupClass} md:col-span-2`}>
                <label className={formLabelClass}>
                  Cliente <span className="text-red-500">*</span>
                </label>
                <ClienteCombobox
                  clientes={clientes}
                  value={formData.cliente_id}
                  onChange={handleClienteChange}
                  placeholder="Seleccionar otro cliente"
                  className={fieldClass}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Al cambiarlo se actualizarán los datos de contacto desde su perfil.
                </p>
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>{isCustomsFlow ? 'Servicio' : 'Transporte'}</label>
              <select
                name="tipo_transporte"
                disabled={isCustomsFlow}
                value={formData.tipo_transporte || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    tipo_transporte: e.target.value,
                    quote_type: '',
                  })
                }
                className={fieldClass}
              >
                <option value="">Transporte</option>
                {isCustomsFlow && <option value="Aduanas">Servicio de Aduanas</option>}
                {!isCustomsFlow && transportOptions.map((transport) => (
                  <option key={transport} value={transport}>
                    {transport}
                  </option>
                ))}
              </select>
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Tipo de cotización</label>
              <select
                name="quote_type"
                value={formData.quote_type || ''}
                onChange={(e) => requestQuoteTypeChange(e.target.value)}
                disabled={isCustomsFlow || !formData.tipo_transporte}
                className={fieldClass}
              >
                <option value="">Tipo de cotización</option>
                {isCustomsFlow && <option value="Aduanas">Aduanas</option>}

                {modalityOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              </div>

              {isMiamiFlow && (
                <div className={fieldGroupClass}>
                  <label className={formLabelClass}>Producto / servicio Miami</label>
                <select
                  name="service_product"
                  value={formData.service_product || ''}
                  onChange={handleServiceProductChange}
                  className={fieldClass}
                >
                  {serviceProductOptions
                    .filter((product) =>
                      ['miami_lcl', 'miami_air'].includes(product.value)
                    )
                    .map((product) => (
                      <option key={product.value} value={product.value}>
                        {product.label}
                      </option>
                    ))}
                </select>
                </div>
              )}

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Válida hasta</label>
              <input
                type="date"
                name="valid_until"
                value={formData.valid_until || ''}
                onChange={handleChange}
                className={dateFieldClass}
              />
              </div>

              {!isCustomsFlow && <div className={fieldGroupClass}>
                <label className={formLabelClass}>Incoterm</label>
              <select
                name="incoterm"
                value={formData.incoterm || ''}
                onChange={handleChange}
                className={compactFieldClass}
              >
                <option value="">Incoterm</option>
                <option value="EXW">EXW</option>
                <option value="FCA">FCA</option>
                <option value="FOB">FOB</option>
                <option value="CFR">CFR</option>
                <option value="CIF">CIF</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
              </div>}

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Nombre de contacto</label>
              <input
                name="contact_name"
                placeholder="Nombre de contacto"
                value={formData.contact_name || ''}
                onChange={handleChange}
                className={fieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Email de contacto</label>
              <input
                name="contact_email"
                placeholder="Email de contacto"
                value={formData.contact_email || ''}
                onChange={handleChange}
                className={fieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Teléfono de contacto</label>
              <input
                name="contact_phone"
                placeholder="Teléfono de contacto"
                value={formData.contact_phone || ''}
                onChange={handleChange}
                className={fieldClass}
              />
              </div>

            </div>
            {productMismatch && (
              <div
                role="alert"
                className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
              >
                <p>
                  El producto <strong>{productLabel}</strong> corresponde a{' '}
                  {productMismatch.rule.transport} {productMismatch.rule.modalities.join(' / ')}, pero esta
                  cotización tiene {formData.tipo_transporte || 'transporte sin definir'}{' '}
                  {formData.quote_type || 'sin modalidad'}. Se guardará tal cual hasta que la ajustes.
                </p>
                <button
                  type="button"
                  onClick={applyProductRule}
                  className={`${secondaryButtonClass} shrink-0`}
                >
                  Ajustar al producto
                </button>
              </div>
            )}
          </section>

          {isCustomsFlow && <CustomsQuotationSection data={formData} onChange={(field, value) => setFormData(previous => ({ ...previous, [field]: value }))} charges={customsCharges} setCharges={setCustomsCharges} taxRate={miami.taxRatePercent} />}
          {!isCustomsFlow && <>
          {!isMiamiFlow && <section id="quote-route" className="scroll-mt-28 pt-3">
            <h2 className="text-xl font-bold mb-4">Ruta</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Origen</label>
                <input list="countries" name="origen" placeholder="Origen" value={formData.origen || ''} onChange={handleChange} className={fieldClass} />
              </div>
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Destino</label>
                <input list="countries" name="destino" placeholder="Destino" value={formData.destino || ''} onChange={handleChange} className={fieldClass} />
              </div>
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Puerto origen</label>
                <input list="originPorts" name="puerto_origen" placeholder="Puerto origen" value={formData.puerto_origen || ''} onChange={handleChange} className={fieldClass} />
              </div>
              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Puerto destino</label>
                <input list="destinationPorts" name="puerto_destino" placeholder="Puerto destino" value={formData.puerto_destino || ''} onChange={handleChange} className={fieldClass} />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Dirección de entrega</label>
              <textarea
                name="delivery_address"
                placeholder="Dirección de entrega"
                value={formData.delivery_address || ''}
                onChange={handleChange}
                className={`${fieldClass} min-h-12`}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Naviera de preferencia</label>
              <input
                name="preferred_carrier"
                placeholder="Naviera de preferencia"
                value={formData.preferred_carrier || ''}
                onChange={handleChange}
                className={shortTextFieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Tiempo de tránsito</label>
              <input
                name="transit_time"
                placeholder="Tiempo de tránsito"
                value={formData.transit_time || ''}
                onChange={handleChange}
                className={compactFieldClass}
              />
              </div>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Target rate</label>
              <input
                name="target_rate"
                placeholder="Target rate"
                value={formData.target_rate || ''}
                onChange={handleChange}
                className={moneyFieldClass}
              />
              </div>

              {formData.incoterm === 'EXW' && (
                <div className={`${fieldGroupClass} md:col-span-2`}>
                  <label className={formLabelClass}>Dirección de recolección EXW</label>
                <textarea
                  name="pickup_address"
                  placeholder="Dirección de recolección EXW"
                  value={formData.pickup_address || ''}
                  onChange={handleChange}
                  className={`${fieldClass} min-h-12`}
                />
                </div>
              )}
            </div>
          </section>}

          <section id="quote-cargo" className="scroll-mt-28 pt-3">
            <h2 className="text-xl font-bold mb-4">Carga</h2>

            <div className="space-y-4">
              {!isMiamiFlow && <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className={fieldGroupClass}>
                    <label className={formLabelClass}>Commodity / descripción de la carga</label>
                    <input
                      name="commodity"
                      placeholder="Commodity/Descripción de la carga *"
                      value={formData.commodity || ''}
                      onChange={handleChange}
                      className={fieldClass}
                    />
                  </div>

                  <div className={fieldGroupClass}>
                    <label className={formLabelClass}>Tipo de empaque</label>
                    <select
                      name="package_type"
                      value={formData.package_type || ''}
                      onChange={handleChange}
                      className={fieldClass}
                    >
                      <option value="">Seleccionar</option>
                      {packageTypeOptions.map((packageType) => (
                        <option key={packageType} value={packageType}>
                          {packageType}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={fieldGroupClass}>
                  <label className={formLabelClass}>Detalles del empaque / observaciones de carga</label>
                  <textarea
                    name="package_details"
                    placeholder="Detalles del empaque / dimensiones / observaciones de carga"
                    value={formData.package_details || ''}
                    onChange={handleChange}
                    className={`${fieldClass} min-h-[132px]`}
                  />
                </div>
              </div>}

              {requiresContainerLines && (
                <ContainerLinesEditor
                  containerTypes={containerTypes}
                  lines={containerLines}
                  setLines={setContainerLines}
                  removalNote={removalNote}
                />
              )}

              {requiresLooseCargo && !isMiamiFlow && (
                <CargoLinesEditor
                  lines={cargoLines}
                  setLines={setCargoLines}
                  issuesByLine={cargoLineIssues}
                  airWeights={airWeights}
                  removalNote={removalNote}
                />
              )}

              <MiamiQuotationSection
                formData={formData}
                handleChange={handleChange}
                fieldClass={fieldClass}
                cardClass={cardClass}
                cargoLines={cargoLines}
                setCargoLines={setCargoLines}
                formatNumber={formatNumber}
                miami={miami}
              />
            </div>
          </section>

          <section id="quote-insurance" className="scroll-mt-28 py-6">
            <h2 className="text-xl font-bold mb-4">Seguro de Carga</h2>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  name="requires_insurance"
                  checked={formData.requires_insurance}
                  onChange={handleChange}
                />
                <span className="text-sm font-medium text-slate-700">
                  Cliente solicita seguro de carga
                </span>
              </label>

              {formData.requires_insurance && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">
                    Valor FOB / valor comercial (USD)
                  </label>
                  <input
                    name="commercial_value"
                    placeholder="0.00"
                    value={formData.commercial_value || ''}
                    onChange={handleChange}
                    className={moneyFieldClass}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Pricing usa este valor FOB para calcular el seguro de carga.
                  </p>
                </div>
              )}
            </div>
          </section>

          <div
            id="quote-notes"
            className={`scroll-mt-28 grid gap-4 ${isMiamiFlow ? 'lg:grid-cols-2' : ''}`}
          >
            <section className={cardClass}>
              <h2 className={`${sectionTitleClass} mb-4`}>
                Observaciones internas para Pricing
              </h2>

              <div className={fieldGroupClass}>
                <label className={formLabelClass}>Notas internas para Pricing</label>
                <textarea
                  name="pricing_notes"
                  value={formData.pricing_notes || ''}
                  onChange={handleChange}
                  className={`${fieldClass} min-h-36`}
                />
              </div>
            </section>

            {isMiamiFlow && (
              <section className={cardClass}>
                <h2 className={`${sectionTitleClass} mb-4`}>
                  Observaciones para Cliente (PDF)
                </h2>

                <div className={fieldGroupClass}>
                  <label className={formLabelClass}>Notas comerciales para el PDF</label>
                  <textarea
                    name="client_notes"
                    value={formData.client_notes || ''}
                    onChange={handleChange}
                    className={`${fieldClass} min-h-36`}
                    placeholder="Ej: Tarifa sujeta a disponibilidad, no incluye aduanas..."
                  />
                </div>
              </section>
            )}
          </div>

          </>}
          <datalist id="countries">
            {countries.map((country) => (
              <option key={country.id} value={country.name} />
            ))}
          </datalist>

          <datalist id="originPorts">
            {originPorts.map((port) => (
              <option key={port.id} value={port.name} />
            ))}
          </datalist>

          <datalist id="destinationPorts">
            {destinationPorts.map((port) => (
              <option key={port.id} value={port.name} />
            ))}
          </datalist>
          </fieldset>

          <div
            id="quote-actions"
            className="scroll-mt-28 flex flex-wrap justify-end gap-4"
          >
            <Link
              href={`/quotations/${params.id}`}
              className={secondaryButtonClass}
            >
              Cancelar
            </Link>

            {canEditQuotes && formData.status === 'Borrador' && (
              <button
                onClick={handleSendToPricing}
                disabled={saving}
                className={primaryButtonClass}
              >
                {isCustomsFlow ? 'Aprobar cotización de aduanas' : 'Enviar a Pricing'}
              </button>
            )}

            {canEditQuotes && (
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className={primaryButtonClass}
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
      <Dialog
        open={sendPricingDialogOpen}
        onOpenChange={setSendPricingDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar cotización a Pricing</DialogTitle>
            <DialogDescription>
              Los cambios fueron guardados correctamente. ¿Deseas enviar esta cotización al equipo de Pricing?
            </DialogDescription>
          </DialogHeader>

          {formData.status !== 'Borrador' && (
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className={fieldLabelClass}>Motivo de la nueva solicitud de pricing</span>
              <textarea value={repricingReason} onChange={(event) => setRepricingReason(event.target.value)} rows={3} className={fieldClass} />
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSendPricingDialogOpen(false)}
              className={secondaryButtonClass}
            >
              No, continuar editando
            </button>

            <button
              type="button"
              disabled={savingAfterEdit}
              onClick={async () => {
                setSavingAfterEdit(true)

                await handleSendToPricing()

                setSavingAfterEdit(false)
              }}
              className={primaryButtonClass}
            >
              {savingAfterEdit ? 'Enviando...' : 'Sí, enviar a Pricing'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={modeChangePending !== null}
        onOpenChange={(open) => { if (!open) setModeChangePending(null) }}
        title="Cambiar modalidad de carga"
        description={modeChangePending
          ? `Este cambio eliminará ${modeChangePending.discarded === 'containers' ? `${containerLines.length} ${containerLines.length === 1 ? 'línea de contenedor' : 'líneas de contenedores'}` : `${cargoLines.length} ${cargoLines.length === 1 ? 'línea de carga' : 'líneas de carga'}`} al guardar la cotización. ¿Deseas continuar?`
          : undefined}
        confirmLabel="Cambiar modalidad"
        danger
        onConfirm={confirmModeChange}
      />
    </>
  )
}
