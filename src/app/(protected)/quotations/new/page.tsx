'use client'

import {
  type CargoDimensionLine,
  type CargoValidationMode,
  calculateLineCbm,
  calculateLineFt3,
  createEmptyCargoLine,
  getAirChargeableWeights,
  getLineTotalWeightKg,
  getLineTotalWeightLbs,
  getLineUnitWeightLbs,
  hasLineVolume,
  summarizeUncarriedCargo,
  validateCargoLines,
} from '@/src/lib/quotation-cargo'
import {
  type ContainerLine,
  collectQuotationSubmitIssues,
  createInitialQuotationForm,
  filterPortsForTransport,
} from '@/src/lib/quotation-form'

import { formatDate, toDateInputValue } from '@/src/lib/format'
import { createQuotation } from '@/src/lib/quotation-create'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { pdf } from '@react-pdf/renderer'
import { PackageSearch } from 'lucide-react'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { loadCurrentCompanySettings, type TenantCompanySettings } from '@/src/lib/company-settings'
import { withMiamiInsurance } from '@/src/lib/miami-insurance'
import { INSURANCE_SURCHARGE_PERCENT } from '@/src/lib/insurance-calculator'
import { isInsurancePricingItem } from '@/src/lib/insurance-coverage'
import QuotationPDF from '../../../../components/pdf/quotation-pdf'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { UnsavedChangesGuard, markFormSaved } from '@/src/components/ui/UnsavedChangesGuard'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { MiamiQuotationSection } from '@/src/components/quotations/MiamiQuotationSection'
import { CustomsQuotationSection } from '@/src/components/quotations/CustomsQuotationSection'
import { DuplicateCargoNotice, type DuplicateCargoNoticeData } from '@/src/components/quotations/DuplicateCargoNotice'
import { QuotationActionBar } from '@/src/components/quotations/QuotationActionBar'
import { QuotationCargoSection } from '@/src/components/quotations/QuotationCargoSection'
import { QuotationClientProductSection } from '@/src/components/quotations/QuotationClientProductSection'
import { QuotationConditionsSection } from '@/src/components/quotations/QuotationConditionsSection'
import { QuotationContactSection } from '@/src/components/quotations/QuotationContactSection'
import { QuotationInsuranceSection } from '@/src/components/quotations/QuotationInsuranceSection'
import { QuotationNotesSection } from '@/src/components/quotations/QuotationNotesSection'
import { QuotationRouteSection } from '@/src/components/quotations/QuotationRouteSection'
import { buildCustomsPricingItems, hydrateCustomsCharges, newCustomsCharges, validateCustomsQuotation } from '@/src/lib/customs-quotation'
import {
  fetchActiveServiceProducts,
  getCargoStructure,
  getProductTransportRule,
  isCustomsOnly,
  resolveProductQuoteType,
  serviceProducts,
  usesOwnPricing,
} from '@/src/lib/quotation-products'
import { useMiamiQuotation } from '@/src/hooks/useMiamiQuotation'
import { usesClientRatesFromCatalog } from '@/src/lib/pricing-catalogs'
import {
  type CompanyBranding,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'
import { fieldClass, cardClass } from '@/src/lib/ui-classes'

const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

export default function NewQuotationPage() {
  const router = useRouter()
  const { profile } = useUser()
  const defaultValidUntil = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const todayString = toDateInputValue()

  const [loading, setLoading] = useState(false)
  const [clientes, setClientes] = useState<any[]>([])
  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding>(normalizeCompanyBranding(null))
  const [companySettings, setCompanySettings] = useState<TenantCompanySettings | null>(null)
  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])
  const [containerTypes, setContainerTypes] = useState<any[]>([])
  const [cargoLines, setCargoLines] = useState<CargoDimensionLine[]>([
    createEmptyCargoLine(),
  ])
  const [containerLines, setContainerLines] = useState<ContainerLine[]>([])
  const [customsCharges, setCustomsCharges] = useState(newCustomsCharges)
  const [containerResetPending, setContainerResetPending] = useState<{
    kind: 'service_product' | 'tipo_transporte' | 'quote_type'
    value: string
  } | null>(null)
  const [duplicateSource, setDuplicateSource] = useState<{
    id: string
    quotation_number: string | null
  } | null>(null)
  const [reactivationMode, setReactivationMode] = useState(false)
  // Carga de la cotización origen que no encaja en la estructura del producto actual.
  const [duplicateCargoNotice, setDuplicateCargoNotice] =
    useState<DuplicateCargoNoticeData | null>(null)
  const [cargoValidationMode, setCargoValidationMode] =
    useState<CargoValidationMode | null>(null)
  const [reactivationReason, setReactivationReason] = useState('')
  const initialFormData = createInitialQuotationForm(defaultValidUntil)

  const [formData, setFormData] = useState(initialFormData)
  const [submitted, setSubmitted] = useState(false)
  const [serviceProductOptions, setServiceProductOptions] =
    useState(serviceProducts)

  // Returns red border class if field is required, form was submitted, and value is empty
  const reqClass = (value: string) =>
    submitted && !value
      ? 'border-red-400 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-700'
      : ''

  useEffect(() => {
    fetchClientes()
    fetchCatalogs()
    fetchCompanyBranding()
  }, [])

  const fetchCompanyBranding = async () => {
    const { data, error } = await loadCurrentCompanySettings(supabase)
    setCompanySettings(error ? null : data)
    setCompanyBranding(normalizeCompanyBranding(data))
  }

  useEffect(() => {
    const duplicateFromId = new URLSearchParams(window.location.search).get(
      'duplicateFrom'
    )

    const shouldReactivate =
      new URLSearchParams(window.location.search).get('reactivate') === '1'

    setReactivationMode(shouldReactivate)

    if (duplicateFromId) {
      loadDuplicateSource(duplicateFromId, shouldReactivate)
    }
  }, [])

  const fetchPricingUsers = async () => {
    const { data: pricingUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('rol', 'Pricing')
      .eq('is_active', true)

    return pricingUsers || []
  }

  const fetchClientes = async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select(`
        *,
        vendedor:profiles!clientes_vendedor_asignado_fkey (
          id,
          nombre,
          apellido
        )
      `)
      .is('deleted_at', null)
      .order('nombre', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setClientes(data || [])
  }

  const fetchCatalogs = async () => {
    const { data: countriesData, error: countriesError } = await supabase
      .from('countries')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    if (countriesError) {
      toast.error(countriesError.message)
      return
    }

    const { data: portsData, error: portsError } = await supabase
      .from('ports')
      .select('*, countries(name)')
      .eq('active', true)
      .order('name', { ascending: true })

    if (portsError) {
      toast.error(portsError.message)
      return
    }

    const { data: containerTypesData, error: containerTypesError } =
      await supabase
        .from('container_types')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })

    if (containerTypesError) {
      toast.error(containerTypesError.message)
      return
    }

    const activeServiceProducts = await fetchActiveServiceProducts(supabase)

    setCountries(countriesData || [])
    setPorts(portsData || [])
    setContainerTypes(containerTypesData || [])
    setServiceProductOptions(activeServiceProducts)
  }

  const toFormString = (value: unknown) =>
    value === null || value === undefined ? '' : String(value)

  const getReusableValidUntil = (value?: string | null) => {
    if (!value) return defaultValidUntil

    const dateValue = value.split('T')[0]
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const validUntilDate = new Date(dateValue)
    validUntilDate.setHours(0, 0, 0, 0)

    return validUntilDate < today ? defaultValidUntil : dateValue
  }

  const toPackageType = (
    value?: string | null
  ): CargoDimensionLine['packageType'] => {
    if (value === 'Pallet' || value === 'Pieza') return value
    return 'Caja'
  }

  const loadDuplicateSource = async (
    quotationId: string,
    shouldReactivate = false
  ) => {
    setLoading(true)

    try {
      const [
        { data: sourceQuote, error: quoteError },
        { data: sourceContainers, error: containerError },
        { data: sourceCargoLines, error: cargoError },
      ] = await Promise.all([
        supabase
          .from('quotations')
          .select('*')
          .eq('id', quotationId)
          .is('deleted_at', null)
          .single(),
        supabase
          .from('quotation_containers')
          .select('*')
          .eq('quotation_id', quotationId)
          .order('created_at', { ascending: true }),
        supabase
          .from('quotation_cargo_lines')
          .select('*')
          .eq('quotation_id', quotationId)
          .order('created_at', { ascending: true }),
      ])

      if (quoteError || !sourceQuote) {
        toast.error('No se pudo cargar la cotización a duplicar')
        return
      }

      if (shouldReactivate && sourceQuote.status !== 'Perdida') {
        toast.error('Solo se pueden reactivar cotizaciones perdidas.')
        router.push(`/quotations/${quotationId}`)
        return
      }

      if (containerError) {
        toast.error(containerError.message)
      }

      if (cargoError) {
        toast.error(cargoError.message)
      }

      setDuplicateSource({
        id: sourceQuote.id,
        quotation_number: sourceQuote.quotation_number,
      })
      let sourceInsuranceTaxable = false
      if (isCustomsOnly(sourceQuote.service_product) || usesClientRatesFromCatalog(serviceProductOptions, sourceQuote.service_product)) {
        const { data: sourceItems, error: itemsError } = await supabase.from('pricing_items').select('*').eq('quotation_id', quotationId).is('deleted_at', null).order('created_at')
        if (itemsError) {
          toast.error(itemsError.message)
          return
        }
        if (isCustomsOnly(sourceQuote.service_product)) {
          setCustomsCharges(hydrateCustomsCharges(sourceItems || []))
        } else {
          sourceInsuranceTaxable = (sourceItems || []).find(isInsurancePricingItem)?.taxable === true
        }
      }
      // Duplicados antiguos pueden traer transporte/modalidad incoherentes con su producto.
      const sourceTransportRule = getProductTransportRule(sourceQuote.service_product)
      const sourceTransport = sourceTransportRule?.transport ?? (sourceQuote.tipo_transporte || '')
      const copyQuoteType = sourceTransportRule
        ? resolveProductQuoteType(sourceTransportRule, sourceQuote.quote_type || '')
        : sourceQuote.quote_type || ''
      setFormData({
        cliente_id: toFormString(sourceQuote.cliente_id),
        trade_direction: sourceQuote.trade_direction || 'import',
        service_product: sourceQuote.service_product || '',
        quote_type: copyQuoteType,
        valid_until: getReusableValidUntil(sourceQuote.valid_until),
        contact_name: sourceQuote.contact_name || '',
        contact_email: sourceQuote.contact_email || '',
        contact_phone: sourceQuote.contact_phone || '',
        contact_state: sourceQuote.contact_state || '',
        contact_country: sourceQuote.contact_country || '',
        preferred_carrier: sourceQuote.preferred_carrier || '',
        transit_time: toFormString(sourceQuote.transit_time),
        target_rate: toFormString(sourceQuote.target_rate),
        commercial_value: toFormString(
          sourceQuote.commercial_value || sourceQuote.fob_value
        ),
        incoterm: sourceQuote.incoterm || '',
        tipo_transporte: sourceTransport,
        origen: sourceQuote.origen || '',
        destino: sourceQuote.destino || '',
        puerto_origen: sourceQuote.puerto_origen || '',
        puerto_destino: sourceQuote.puerto_destino || '',
        pickup_address: sourceQuote.pickup_address || '',
        delivery_address: sourceQuote.delivery_address || '',
        container_type: sourceQuote.container_type || '',
        container_qty: toFormString(sourceQuote.container_qty),
        package_type: sourceQuote.package_type || '',
        package_details: sourceQuote.package_details || '',
        peso_kg: toFormString(sourceQuote.peso_kg),
        gross_weight: toFormString(sourceQuote.gross_weight),
        volumen_cbm: toFormString(sourceQuote.volumen_cbm),
        cantidad_bultos: toFormString(sourceQuote.cantidad_bultos),
        commodity: sourceQuote.commodity || '',
        requires_insurance: Boolean(sourceQuote.requires_insurance),
        insurance_taxable: sourceInsuranceTaxable,
        fob_value: toFormString(sourceQuote.fob_value),
        freight_value: toFormString(sourceQuote.freight_value),
        insurance_markup_percentage: toFormString(
          sourceQuote.insurance_markup_percentage || 10
        ),
        insurance_rate: toFormString(sourceQuote.insurance_rate || 1),
        insurance_cost: toFormString(sourceQuote.insurance_cost || 0),
        observaciones: sourceQuote.observaciones || '',
        pricing_notes: sourceQuote.pricing_notes || '',
        client_notes: sourceQuote.client_notes || '',
      })

      const sourceQuoteTypeValue = sourceQuote.quote_type || ''
      const targetStructure = getCargoStructure(copyQuoteType)
      const cargoSummary = summarizeUncarriedCargo({
        containers: sourceContainers || [],
        cargoLines: sourceCargoLines || [],
        quote: sourceQuote,
      }, targetStructure)
      const cargoStructureChanged = cargoSummary.length > 0

      setDuplicateCargoNotice(
        cargoStructureChanged
          ? {
              sourceQuoteType: sourceQuoteTypeValue || 'sin modalidad',
              summary: cargoSummary,
            }
          : null
      )

      setContainerLines(
        (targetStructure === 'loose' ? [] : sourceContainers || []).map((line: any) => ({
          container_type_id: line.container_type_id || '',
          container_type_name:
            line.container_type_name || line.container_type || '',
          quantity: Number(line.quantity || 1),
          notes: line.notes || null,
        }))
      )

      const copiedCargoLines = (sourceCargoLines || []).map((line: any) => {
        const cbm = Number(line.cbm || 0)
        const hasDimensions =
          Number(line.length || 0) > 0 &&
          Number(line.width || 0) > 0 &&
          Number(line.height || 0) > 0

        return {
          id: crypto.randomUUID(),
          quantity: toFormString(line.quantity || 1),
          packageType: toPackageType(line.package_type),
          length: toFormString(line.length),
          width: toFormString(line.width),
          height: toFormString(line.height),
          dimensionUnit: line.dimension_unit || 'm',
          weight: toFormString(line.weight_lbs),
          weightUnit: 'lbs',
          volumeMode: hasDimensions ? 'dimensions' : 'manual',
          manualCbm: hasDimensions ? '' : toFormString(cbm),
        } satisfies CargoDimensionLine
      })

      setCargoLines(
        copiedCargoLines.length > 0 ? copiedCargoLines : [createEmptyCargoLine()]
      )

      if (cargoStructureChanged) {
        toast.warning('Parte de la carga de la cotización origen no se trasladó. Revísala antes de enviar.')
      } else {
        toast.success('Cotización cargada para duplicar')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target

    const updatedData = {
      ...formData,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }

    setFormData(updatedData)
  }

  const applyServiceProductChange = (serviceProduct: string) => {
    if (isCustomsOnly(serviceProduct)) {
      setFormData(previous => ({ ...initialFormData, cliente_id: previous.cliente_id,
        trade_direction: previous.trade_direction, contact_name: previous.contact_name,
        contact_email: previous.contact_email, contact_phone: previous.contact_phone,
        contact_country: previous.contact_country, contact_state: previous.contact_state,
        service_product: serviceProduct, quote_type: 'Aduanas', tipo_transporte: 'Aduanas',
        commodity: previous.commodity, destino: previous.destino, valid_until: previous.valid_until,
      }))
      clearContainerLines()
      setCargoLines([])
      return
    }
    const isMiamiProduct = usesClientRatesFromCatalog(serviceProductOptions, serviceProduct)
    const { tipo_transporte: nextTransport, quote_type: nextQuoteType } =
      getNextTransportSelection(serviceProduct)

    setFormData((prev) => ({
      ...prev,
      service_product: serviceProduct,
      tipo_transporte: nextTransport,
      quote_type: nextQuoteType,
      origen: isMiamiProduct ? prev.origen || 'Miami, FL' : prev.origen,
      puerto_origen: isMiamiProduct
        ? prev.puerto_origen || 'Miami'
        : prev.puerto_origen,
    }))

    if (nextQuoteType !== 'FCL' && nextQuoteType !== 'FTL') {
      clearContainerLines()
    }

    // Aduanas vacía las líneas de carga; cualquier otro producto parte con una línea.
    setCargoLines((prev) =>
      prev.length > 0
        ? prev
        : [createEmptyCargoLine()]
    )
  }

  // Transporte y modalidad que tendrá la cotización al elegir un producto.
  const getNextTransportSelection = (serviceProduct: string) => {
    if (usesClientRatesFromCatalog(serviceProductOptions, serviceProduct)) {
      return serviceProduct === 'miami_air'
        ? { tipo_transporte: 'Aéreo', quote_type: 'Consolidado' }
        : { tipo_transporte: 'Marítima', quote_type: 'LCL' }
    }

    const rule = getProductTransportRule(serviceProduct)
    if (rule) {
      return {
        tipo_transporte: rule.transport,
        quote_type: formData.tipo_transporte === rule.transport
          ? resolveProductQuoteType(rule, formData.quote_type)
          : resolveProductQuoteType(rule, ''),
      }
    }

    return formData.tipo_transporte === 'Aduanas'
      ? { tipo_transporte: '', quote_type: '' }
      : { tipo_transporte: formData.tipo_transporte, quote_type: formData.quote_type }
  }

  const handleServiceProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceProduct = e.target.value
    const nextQuoteType = isCustomsOnly(serviceProduct)
      ? 'Aduanas'
      : getNextTransportSelection(serviceProduct).quote_type
    const willClearContainers =
      containerLines.length > 0 &&
      nextQuoteType !== 'FCL' &&
      nextQuoteType !== 'FTL'
    if (willClearContainers) {
      setContainerResetPending({ kind: 'service_product', value: serviceProduct })
      return
    }
    applyServiceProductChange(serviceProduct)
  }

  const handleClienteChange = (clienteId: string) => {

    const selectedCliente = clientes.find(
      (cliente) => cliente.id === clienteId
    )

    const updatedData = {
      ...formData,
      cliente_id: clienteId,
      requires_insurance: clienteId === formData.cliente_id ? formData.requires_insurance : null,
      insurance_taxable: clienteId === formData.cliente_id && formData.insurance_taxable,
      contact_name: selectedCliente?.contacto || '',
      contact_email: selectedCliente?.email_1 || '',
      contact_phone: selectedCliente?.telefono || '',
      contact_state: selectedCliente?.departamento_estado || '',
      contact_country: selectedCliente?.pais || '',
      origen: selectedCliente?.origen_frecuente || formData.origen,
      insurance_rate:
        selectedCliente?.seguro_porcentaje?.toString() || '1.0',
    }

    setFormData(updatedData)
  }

  const clearContainerLines = () => {
    setContainerLines([])
  }

  const requestTransportChange = (value: string) => {
    if (containerLines.length > 0) {
      setContainerResetPending({ kind: 'tipo_transporte', value })
      return
    }
    setFormData((prev) => ({ ...prev, tipo_transporte: value, quote_type: '' }))
  }

  const requestQuoteTypeChange = (value: string) => {
    if (value !== 'FCL' && value !== 'FTL' && containerLines.length > 0) {
      setContainerResetPending({ kind: 'quote_type', value })
      return
    }
    setFormData((prev) => ({ ...prev, quote_type: value }))
  }

  const confirmContainerReset = () => {
    if (!containerResetPending) return
    if (containerResetPending.kind === 'service_product') {
      applyServiceProductChange(containerResetPending.value)
    } else if (containerResetPending.kind === 'tipo_transporte') {
      setFormData((prev) => ({
        ...prev,
        tipo_transporte: containerResetPending.value,
        quote_type: '',
      }))
      clearContainerLines()
    } else {
      setFormData((prev) => ({ ...prev, quote_type: containerResetPending.value }))
      clearContainerLines()
    }
    setContainerResetPending(null)
  }

  const focusFormIssue = (field: string) => {
    const target =
      document.querySelector<HTMLElement>(`[data-field="${field}"]`) ||
      document.querySelector<HTMLElement>(`[name="${field}"]`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const control = target.matches('input, select, textarea, button')
      ? target
      : target.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea, button')
    control?.focus({ preventScroll: true })
  }

  const handleSubmit = async (status: string) => {
    setSubmitted(true)
    if (!isMiamiFlow && requiresCargoLines) {
      setCargoValidationMode(status === 'Borrador' ? 'draft' : 'pricing')
    }

    const issues = collectQuotationSubmitIssues({
      status,
      formData,
      todayString,
      missingReactivationReason: reactivationMode && !reactivationReason.trim(),
      isMiamiFlow,
      isCustomsFlow,
      customsCharges,
      miamiLclEstimated: miami.lclEstimated,
      miamiAirEstimated: miami.airEstimated,
      containerCount: containerLines.length,
      cargoLines,
    })
    if (issues.length > 0) {
      toast.error(
        issues.length === 1
          ? issues[0].message
          : `Faltan ${issues.length} datos para ${status === 'Borrador' ? 'guardar el borrador' : 'continuar'}`,
        issues.length === 1
          ? undefined
          : { description: issues.map((issue) => issue.message).join(' · ') }
      )
      focusFormIssue(issues[0].field)
      return
    }

    const submitIsMiamiFlow = usesOwnPricing(formData.service_product)
    const isDraftSave = status === 'Borrador'
    const initialStatus =
      submitIsMiamiFlow && !isDraftSave ? 'Pricing Aprobado' : status

    const validUntil =
      formData.valid_until ||
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

    let navigatingToQuotation = false
    try {
      setLoading(true)

      const quotationId = crypto.randomUUID()
      const automaticPricing = isCustomsFlow
        ? { items: buildCustomsPricingItems(quotationId, customsCharges, miami.taxRatePercent, companyBranding?.trade_name || 'Sari Express', profile?.id), error: null, insurance: null }
        : buildMiamiCreationPricing(quotationId)
      if (submitIsMiamiFlow && !isDraftSave && automaticPricing.error) {
        toast.error(automaticPricing.error)
        return
      }
      const quotationPayload = {
        id: quotationId,
        cliente_id: formData.cliente_id,

        trade_direction: formData.trade_direction,
        service_product: formData.service_product || null,
        quote_type: formData.quote_type,
        valid_until: validUntil,

        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,

        preferred_carrier: formData.preferred_carrier,
        transit_time: formData.transit_time || null,
        target_rate: Number(formData.target_rate),
        commercial_value: Number(formData.commercial_value),

        incoterm: formData.incoterm,
        tipo_transporte: formData.tipo_transporte,

        origen: formData.origen,
        destino: formData.destino,
        puerto_origen: formData.puerto_origen,
        puerto_destino: formData.puerto_destino,
        pickup_address: formData.pickup_address,
        delivery_address: formData.delivery_address,

        container_type: formData.container_type,
        container_qty: Number(formData.container_qty || 0),
        package_type: formData.package_type,
        package_details: formData.package_details,
        peso_kg: isMiamiFlow || requiresCargoLines
          ? totalCargoKg > 0
            ? totalCargoKg
            : null
          : Number(formData.peso_kg),
        peso_lbs:
           isMiamiFlow || requiresCargoLines
            ? totalCargoWeight > 0
              ? totalCargoWeight
              : null
            : null,
        gross_weight: Number(formData.gross_weight),
        volumen_cbm: isMiamiFlow || requiresCargoLines
          ? totalCargoCbm > 0
            ? totalCargoCbm
            : null
          : Number(formData.volumen_cbm),
        volumen_ft3:
           isMiamiFlow || requiresCargoLines
            ? totalCargoFt3 > 0
              ? totalCargoFt3
              : null
            : null,
        cantidad_bultos:
           isMiamiFlow || requiresCargoLines
            ? cargoLines.reduce(
                (sum, line) => sum + Number(line.quantity || 0),
                0
              )
            : Number(formData.cantidad_bultos),
        commodity: formData.commodity,

        requires_insurance: requiresCargoInsurance,
        // La pantalla captura un único valor comercial/FOB; Pricing calcula el seguro con él.
        fob_value: requiresCargoInsurance ? Number(formData.commercial_value) : Number(formData.fob_value),
        freight_value: Number(formData.freight_value),
        insurance_markup_percentage: submitIsMiamiFlow && requiresCargoInsurance ? INSURANCE_SURCHARGE_PERCENT : Number(
          formData.insurance_markup_percentage
        ),
        insurance_rate: submitIsMiamiFlow && requiresCargoInsurance ? Number(insuranceCliente?.seguro_porcentaje || 0) : Number(formData.insurance_rate),
        insurance_cost: submitIsMiamiFlow
          ? automaticPricing.insurance?.cost_amount ?? 0
          : 0,

        pricing_notes: formData.pricing_notes || null,
        observaciones: formData.observaciones || null,
        client_notes: submitIsMiamiFlow ? formData.client_notes || null : null,
        duplicated_from: duplicateSource?.id || null,
        status: initialStatus,
      }

      const containerRows = requiresContainerLines
        ? containerLines.map((line) => ({
            container_type_id: line.container_type_id,
            container_type_name: line.container_type_name,
            quantity: line.quantity,
            notes: line.notes,
          }))
        : []

      const cargoRows = (isMiamiFlow || requiresCargoLines ? cargoLines : [])
        .filter((line) => {
          return (
            Number(line.quantity || 0) > 0 &&
            hasLineVolume(line)
          )
        })
        .map((line) => ({
          quantity: Number(line.quantity || 1),
          package_type: line.packageType,
          length: Number(line.length || 0),
          width: Number(line.width || 0),
          height: Number(line.height || 0),
          dimension_unit: line.dimensionUnit,
          weight_lbs: getLineUnitWeightLbs(line),
          ft3: calculateLineFt3(line),
          cbm: calculateLineCbm(line),
        }))

      const autoItems = automaticPricing.items

      const quotation = await createQuotation(supabase, {
        quotation: quotationPayload, containers: containerRows, cargo: cargoRows, pricing: autoItems,
      })

      if (initialStatus === 'Pendiente de Fijar Precios') {
        const pricingUsers = await fetchPricingUsers()

        await Promise.all(
          pricingUsers.map((pricingUser) =>
            createNotification({
              userId: pricingUser.id,
              title: 'Nueva cotización para pricing',
              message: 'Se recibió una nueva solicitud de cotización.',
              type: 'info',
            })
          )
        )

        if (quotation) {
          await createActivityLog({
            module: 'quotations',
            action: 'send_to_pricing',
            entityType: 'quotation',
            entityId: quotation.id,
            description: `Cotización ${
              quotation.quotation_number || quotation.id
            } enviada a Pricing`,
            metadata: {
              status: initialStatus,
              cliente_id: formData.cliente_id,
            },
          })
        }
      }

      if (duplicateSource && quotation && reactivationMode) {
        const reason = reactivationReason.trim()

        await Promise.all([
          createActivityLog({
            module: 'quotations',
            action: 'quotation_reactivated',
            entityType: 'quotation',
            entityId: quotation.id,
            description: `Cotización reactivada desde ${
              duplicateSource.quotation_number || duplicateSource.id
            } como una nueva oportunidad`,
            metadata: {
              sourceQuotationId: duplicateSource.id,
              sourceQuotationNumber: duplicateSource.quotation_number,
              reactivationReason: reason,
            },
          }),
          createActivityLog({
            module: 'quotations',
            action: 'quotation_reactivated_as_new',
            entityType: 'quotation',
            entityId: duplicateSource.id,
            description: `Cotización reactivada como ${
              quotation.quotation_number || quotation.id
            }`,
            metadata: {
              newQuotationId: quotation.id,
              newQuotationNumber: quotation.quotation_number,
              reactivationReason: reason,
            },
          }),
        ])
      } else if (duplicateSource && quotation) {
        await createActivityLog({
          module: 'quotations',
          action: 'quotation_duplicated',
          entityType: 'quotation',
          entityId: quotation.id,
          description: `Cotización duplicada desde ${
            duplicateSource.quotation_number || duplicateSource.id
          }`,
          metadata: {
            sourceQuotationId: duplicateSource.id,
            sourceQuotationNumber: duplicateSource.quotation_number,
          },
        })
      }

      markFormSaved()
      navigatingToQuotation = true
      const createdNumber = quotation.quotation_number ? ` ${quotation.quotation_number}` : ''
      toast.success(
        initialStatus === 'Pendiente de Fijar Precios'
          ? `Cotización${createdNumber} enviada a Pricing`
          : initialStatus === 'Borrador'
            ? `Borrador${createdNumber} guardado`
            : `Cotización${createdNumber} creada`
      )
      router.push(`/quotations/${quotation.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo crear la cotización. Revisa los datos e intenta nuevamente.')
    } finally {
      // Mantiene los botones bloqueados mientras se abre la cotización creada.
      if (!navigatingToQuotation) setLoading(false)
    }
  }

  const originCountry = countries.find(
    (country) => country.name === formData.origen
  )

  const destinationCountry = countries.find(
    (country) => country.name === formData.destino
  )

  const routePorts = filterPortsForTransport(ports, formData.tipo_transporte)

  const originPorts = originCountry
    ? routePorts.filter((port) => port.country_id === originCountry.id)
    : routePorts

  const destinationPorts = destinationCountry
    ? routePorts.filter((port) => port.country_id === destinationCountry.id)
    : routePorts

  const quoteTypeOptions: Record<string, string[]> = {
    'Aéreo': ['Courier', 'Consolidado'],
    'Marítima': ['LCL', 'FCL'],
    Terrestre: ['LTL', 'FTL'],
  }
  const hasProduct = Boolean(formData.service_product)
  const productTransportRule = getProductTransportRule(formData.service_product)
  const availableQuoteTypes =
    productTransportRule?.modalities ||
    quoteTypeOptions[formData.tipo_transporte] ||
    []

  const requiresContainerLines = getCargoStructure(formData.quote_type) === 'containers'
  const requiresCargoLines = getCargoStructure(formData.quote_type) === 'loose'
  const cargoLineIssues = cargoValidationMode
    ? validateCargoLines(cargoLines, cargoValidationMode).issuesByLine
    : {}


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
  const airWeights = formData.tipo_transporte === 'Aéreo' && requiresCargoLines
    ? getAirChargeableWeights(totalCargoKg, totalCargoCbm)
    : null

  const miami = useMiamiQuotation({
    clienteId: formData.cliente_id,
    serviceProduct: formData.service_product,
    incoterm: formData.incoterm,
    totalCargoFt3,
    totalCargoCbm,
    totalCargoWeight,
    createdBy: profile?.id,
  })

  const isMiamiFlow = miami.isMiamiFlow
  const isCustomsFlow = isCustomsOnly(formData.service_product)

  const selectedProductLabel = serviceProductOptions.find(
    (product) => product.value === formData.service_product
  )?.label
  const routeSummary = [formData.origen, formData.destino].filter(Boolean).join(' → ')
  const cargoSummary = requiresContainerLines
    ? containerLines.map((line) => `${line.quantity} × ${line.container_type_name}`).join(', ')
    : requiresCargoLines && totalCargoCbm + totalCargoKg > 0
      ? [
          `${formatNumber(totalCargoKg, 2)} kg`,
          `${formatNumber(totalCargoCbm, 3)} CBM`,
          airWeights ? `cobrable ${formatNumber(airWeights.chargeableWeightKg, 2)} kg` : '',
        ].filter(Boolean).join(' / ')
      : ''
  const quotationSummary = [
    selectedProductLabel,
    !isCustomsFlow ? formData.quote_type : '',
    !isCustomsFlow ? formData.incoterm : '',
    routeSummary,
    cargoSummary,
  ].filter((value): value is string => Boolean(value))
  const insuranceCliente = clientes.find(cliente => cliente.id === formData.cliente_id)
  const clientInsuranceDefault = isMiamiFlow && insuranceCliente?.asegura_carga === true
  const requiresCargoInsurance = formData.requires_insurance ?? clientInsuranceDefault
  const buildMiamiCreationPricing = (quotationId: string) => withMiamiInsurance({
    quotationId,
    items: miami.buildMiamiPricingItems(quotationId),
    required: isMiamiFlow && requiresCargoInsurance,
    taxable: formData.insurance_taxable,
    commercialValue: Number(formData.commercial_value),
    saleRatePercent: Number(insuranceCliente?.seguro_porcentaje || 0),
    settings: companySettings,
    createdBy: profile?.id,
  })
  const insurancePreview = buildMiamiCreationPricing('preview')

  const buildPreviewCargoLines = () => {
    return cargoLines
      .filter((line) => {
        return (
          Number(line.quantity || 0) > 0 &&
          hasLineVolume(line)
        )
      })
      .map((line) => ({
        quantity: Number(line.quantity || 1),
        package_type: line.packageType,
        length: Number(line.length || 0),
        width: Number(line.width || 0),
        height: Number(line.height || 0),
        dimension_unit: line.dimensionUnit,
        weight_lbs: getLineUnitWeightLbs(line),
        ft3: calculateLineFt3(line),
        cbm: calculateLineCbm(line),
      }))
  }

  const buildDraftQuotation = () => {
    const selectedCliente = clientes.find(
      (cliente) => cliente.id === formData.cliente_id
    )

    const validUntil =
      formData.valid_until ||
      new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

    return {
      ...formData,
      id: 'preview',
      requires_insurance: requiresCargoInsurance,
      quotation_number: 'PREVIEW',
      cliente: selectedCliente || null,
      clientes: selectedCliente || null,
      created_by_profile: profile
        ? {
            nombre: profile.nombre,
            apellido: profile.apellido,
          }
        : null,
      status: 'Pricing Aprobado',
      valid_until: validUntil,
      created_at: new Date().toISOString(),
      tipo_transporte:
        formData.tipo_transporte ||
        (formData.service_product === 'miami_air' ? 'Aéreo' : 'Marítima'),
      quote_type:
        formData.quote_type ||
        (formData.service_product === 'miami_air' ? 'Consolidado' : 'LCL'),
      origen: formData.origen || 'Miami, FL',
      destino: formData.destino || formData.contact_country || 'Honduras',
      puerto_origen: formData.puerto_origen || 'Miami',
      puerto_destino: formData.puerto_destino || 'San Pedro Sula',
      transit_time: formData.transit_time || 'N/A',
      peso_kg: totalCargoKg > 0 ? totalCargoKg : null,
      gross_weight: Number(formData.gross_weight || 0),
      volumen_cbm: totalCargoCbm > 0 ? totalCargoCbm : null,
      cantidad_bultos: cargoLines.reduce(
        (sum, line) => sum + Number(line.quantity || 0),
        0
      ),
      commercial_value: Number(formData.commercial_value || 0),
      pricing_notes: formData.pricing_notes,
      client_notes: formData.client_notes,
    }
  }

  const handlePreviewMiamiPdf = async () => {
    if (isCustomsFlow) {
      const error = validateCustomsQuotation(customsCharges, formData)
      if (error) { toast.error(error); return }
      const blob = await pdf(<QuotationPDF quotation={{ ...formData, id: 'preview', quotation_number: 'PREVIEW', created_at: new Date().toISOString(), clientes: insuranceCliente }} selectedAgent={null} pricingItems={buildCustomsPricingItems('preview', customsCharges, miami.taxRatePercent, companyBranding?.trade_name || 'Sari Express', profile?.id).map(item => ({ ...item, id: item.rate_code }))} quotationContainers={[]} cargoLines={[]} company={companyBranding} />).toBlob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
      return
    }
    if (!miami.canUseMiamiCalculator) return

    if (formData.service_product === 'miami_lcl' && miami.lclEstimated <= 0) {
      toast.error('Ingresa FT3 o libras para previsualizar el PDF')
      return
    }

    if (formData.service_product === 'miami_air' && miami.airEstimated <= 0) {
      toast.error('Ingresa KG para previsualizar el PDF')
      return
    }

    const previewPricing = buildMiamiCreationPricing('preview')
    if (previewPricing.error) { toast.error(previewPricing.error); return }
    const blob = await pdf(
      <QuotationPDF
        quotation={buildDraftQuotation()}
        selectedAgent={null}
        pricingItems={previewPricing.items.map(item => ({...item, id:crypto.randomUUID()}))}
        quotationContainers={[]}
        cargoLines={buildPreviewCargoLines()}
        company={companyBranding}
      />
    ).toBlob()

    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  return (
    <>
      <UnsavedChangesGuard />
      <div className="max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {reactivationMode
                ? 'Reactivar como nueva cotización'
                : duplicateSource
                  ? 'Duplicar Cotización'
                  : 'Nueva Cotización'}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {reactivationMode
                ? `Crea una nueva oportunidad a partir de ${
                    duplicateSource?.quotation_number || 'la cotización perdida'
                  } sin modificar su cierre histórico.`
                : duplicateSource
                ? `Edita la información copiada de ${
                    duplicateSource.quotation_number || 'la cotización origen'
                  } antes de enviarla a Pricing.`
                : 'Completa los datos para generar la cotización.'}
            </p>
          </div>
          <p className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
            Fecha de creación: {formatDate(todayString)}
          </p>
        </div>

        {duplicateSource && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-medium text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            {reactivationMode ? 'La reactivación' : 'Esta nueva cotización'} quedará vinculada a{' '}
            {duplicateSource.quotation_number || 'la cotización origen'}.
          </div>
        )}

        {duplicateCargoNotice && (
          <DuplicateCargoNotice notice={duplicateCargoNotice} quoteType={formData.quote_type} />
        )}

        {reactivationMode && (
          <section className={cardClass}>
            <label className="text-sm font-semibold text-slate-900 dark:text-white">
              Motivo de reactivación <span className="text-red-500">*</span>
            </label>
            <textarea
              data-field="reactivation_reason"
              value={reactivationReason}
              onChange={(event) => setReactivationReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej. El cliente retomó el embarque y solicita una tarifa actualizada"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </section>
        )}

        <QuotationClientProductSection
          clientes={clientes}
          formData={formData}
          handleChange={handleChange}
          onClientChange={handleClienteChange}
          onServiceProductChange={handleServiceProductChange}
          serviceProductOptions={serviceProductOptions}
          reqClass={reqClass}
        />

        <QuotationContactSection formData={formData} handleChange={handleChange} />


        {hasProduct ? (
          <>
        <QuotationConditionsSection
          formData={formData}
          handleChange={handleChange}
          isMiamiFlow={isMiamiFlow}
          isCustomsFlow={isCustomsFlow}
          productTransportRule={productTransportRule}
          availableQuoteTypes={availableQuoteTypes}
          requestTransportChange={requestTransportChange}
          requestQuoteTypeChange={requestQuoteTypeChange}
          reqClass={reqClass}
          todayString={todayString}
        />


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

        <MiamiQuotationSection
          formData={formData}
          handleChange={handleChange}
          fieldClass={fieldClass}
          cardClass={cardClass}
          cargoLines={cargoLines}
          setCargoLines={setCargoLines}
          calculateLineCbm={calculateLineCbm}
          calculateLineFt3={calculateLineFt3}
          totalCargoFt3={totalCargoFt3}
          totalCargoCbm={totalCargoCbm}
          totalCargoWeight={totalCargoWeight}
          formatNumber={formatNumber}
          miami={miami}
        />

          {isCustomsFlow && <div data-field="customs"><CustomsQuotationSection data={formData} onChange={(field, value) => setFormData(previous => ({ ...previous, [field]: value }))} charges={customsCharges} setCharges={setCustomsCharges} taxRate={miami.taxRatePercent} /></div>}



          {!isMiamiFlow && !isCustomsFlow && (
            <>
              <QuotationRouteSection formData={formData} handleChange={handleChange} setFormData={setFormData} />

              <QuotationCargoSection
                formData={formData}
                handleChange={handleChange}
                setFormData={setFormData}
                reqClass={reqClass}
                containerTypes={containerTypes}
                containerLines={containerLines}
                setContainerLines={setContainerLines}
                cargoLines={cargoLines}
                setCargoLines={setCargoLines}
                cargoLineIssues={cargoLineIssues}
                airWeights={airWeights}
              />

          </>
          )}

          {!isCustomsFlow && (
            <QuotationInsuranceSection
              formData={formData}
              handleChange={handleChange}
              isMiamiFlow={isMiamiFlow}
              requiresCargoInsurance={requiresCargoInsurance}
              clientInsuranceDefault={clientInsuranceDefault}
              insurancePreview={insurancePreview}
            />
          )}

          <QuotationNotesSection formData={formData} handleChange={handleChange} isMiamiFlow={isMiamiFlow} isCustomsFlow={isCustomsFlow} />

          </>
        ) : (
          <section className={cardClass}>
            <EmptyState
              icon={<PackageSearch className="h-6 w-6" />}
              title="Selecciona el producto o servicio"
              description="Las condiciones, la ruta y la carga se muestran según el producto elegido."
            />
          </section>
        )}

          <QuotationActionBar
            quotationSummary={quotationSummary}
            isMiamiFlow={isMiamiFlow}
            isCustomsFlow={isCustomsFlow}
            canUseMiamiCalculator={miami.canUseMiamiCalculator}
            loading={loading}
            handlePreviewMiamiPdf={handlePreviewMiamiPdf}
            handleSubmit={handleSubmit}
          />
      </div>
      <ConfirmDialog
        open={containerResetPending !== null}
        onOpenChange={(open) => { if (!open) setContainerResetPending(null) }}
        title="Cambiar modalidad de carga"
        description={`Este cambio quitará ${containerLines.length} ${containerLines.length === 1 ? 'línea de contenedor ingresada' : 'líneas de contenedores ingresadas'}. ¿Deseas continuar?`}
        confirmLabel="Cambiar y quitar contenedores"
        danger
        onConfirm={confirmContainerReset}
      />
    </>
  )
}



