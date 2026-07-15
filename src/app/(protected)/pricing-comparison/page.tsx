'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, FileText, LayoutGrid, Pencil, Plus, Save, Table2, X } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'

import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'
import QuotationPDF from '../../../components/pdf/quotation-pdf'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { calculateMiamiLcl } from '@/src/lib/miami-lcl-calculator'
import {
  fetchActiveServiceProducts,
  serviceProducts,
} from '@/src/lib/quotation-products'
import {
  buildOptionalClientRateConfig,
  defaultOptionalClientRateConfig,
  fetchActiveClientRateCatalog,
  type OptionalClientRateConfig,
} from '@/src/lib/pricing-catalogs'
import { canTransition } from '@/src/lib/quotation-status'
import {
  calculateGrossProfitPercent,
  validatePricingCompleteness,
} from '@/src/lib/pricing-validation'
import {
  COMPANY_BRANDING_SELECT,
  type CompanyBranding,
  getCompanyTradeName,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'
import {
  DEFAULT_TAX_RATE_PERCENT,
  calculateTaxAmount,
  normalizeTaxRatePercent,
} from '@/src/lib/tax'
import { CotizacionCombobox } from '@/src/components/ui/CotizacionCombobox'
import { AgenteCombobox } from '@/src/components/ui/AgenteCombobox'
import { CarrierBadge } from '@/src/components/ui/CarrierBadge'
import { CarrierCombobox } from '@/src/components/ui/CarrierCombobox'
import {
  FclAgentComparisonTable,
  type FclTableChargeOverrides,
} from '@/src/components/pricing/FclAgentComparisonTable'
import { cn } from '../../../lib/utils'
import {
  cardClass,
  fieldClass,
  labelClass,
  mutedCardClass,
  valueClass,
} from '../../../lib/ui'
import {
  primaryButtonClass,
  secondaryButtonClass,
} from '@/src/lib/ui-classes'

import { Badge } from '../../../components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'

const pricingItemTypeOptions = [
  'Flete',
  'Origen',
  'Destino',
  'Seguro',
  'Documentación',
  'Aduana',
  'Inland',
  'Profit',
  'Otro',
]
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

const AIR_VOLUMETRIC_DIVISOR_CM3 = 6000
const AIR_VOLUMETRIC_KG_PER_CBM = 1_000_000 / AIR_VOLUMETRIC_DIVISOR_CM3

type CargoLine = {
  id: string
  quotation_id?: string
  quantity: number | string | null
  package_type: string | null
  length: number | string | null
  width: number | string | null
  height: number | string | null
  dimension_unit: string | null
  weight_lbs: number | string | null
  ft3?: number | string | null
  cbm?: number | string | null
  created_at?: string | null
}

type ClientRate = {
  rate_code: string
  rate_label: string
  category: string
  unit: string | null
  currency: string | null
  amount: number
  notes: string | null
  is_active?: boolean | null
}

const fallbackOptionalClientRateConfig = defaultOptionalClientRateConfig

const BUNKER_CODE = 'bunker_emergency_surcharge'

type SurchargeRule = {
  code: string
  label: string
  rate_per_lbs: number | string | null
  rate_per_ft3: number | string | null
  fixed_amount?: number | string | null
  minimum_amount: number | string | null
  currency: string | null
}

type AgentQuote = any

type AgentQuotesViewMode = 'cards' | 'table'

type OperationalImpactChange = {
  label: string
  previousValue: string
  newValue: string
}

type OperationalImpact = {
  isRepricing: boolean
  hasShippingInstruction: boolean
  shippingInstruction: any | null
  shippingInstructionIds: string[]
  bookings: any[]
  confirmedBookings: any[]
  changes: OperationalImpactChange[]
  newValues: {
    carrier: string | null
    agentName: string | null
    agentContact: string | null
    agentEmail: string | null
    etd: string | null
    transitDays: number | null
    freeDays: number | string | null
    transshipment: string | null
  }
}

type OperationalSyncMode = 'skip' | 'sync'

type FinancialTotalsSnapshot = {
  total_cost: number
  total_sale: number
  profit_amount: number
  gp_percentage: number
}

const formatDisplayDate = (date?: string | null) => {
  if (!date) return 'N/A'

  const datePart = date.split('T')[0]
  const [year, month, day] = datePart.split('-')

  if (!year || !month || !day) return date

  return `${day}/${month}/${year}`
}

const displayOperationalValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return 'N/A'
  return String(value)
}

const firstFilledValue = (...values: Array<string | number | null | undefined>) =>
  values.find((value) => value !== null && value !== undefined && value !== '') ?? null

const toOptionalNumber = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const addDaysToDate = (dateValue?: string | null, days?: number | null) => {
  if (!dateValue || days === null || days === undefined) return null

  const [year, month, day] = dateValue.split('T')[0].split('-').map(Number)
  if (!year || !month || !day) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

const hasConfirmedBookingData = (booking: any) =>
  Boolean(
    String(booking.booking_number || '').trim() ||
      String(booking.carrier_booking || '').trim() ||
      String(booking.master_bl || '').trim()
  )

function PricingComparisonContent() {
  const { profile } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const quoteId = searchParams.get('quotation') || searchParams.get('quoteId')
  const userRole = profile?.rol
  const canManagePricing = ['Admin', 'Pricing'].includes(userRole || '')

  const [quotations, setQuotations] = useState<any[]>([])
  const [selectedQuote, setSelectedQuote] = useState<any>(null)
  const [clientNotes, setClientNotes] = useState('')
  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding>(normalizeCompanyBranding(null))
  const [defaultTaxRate, setDefaultTaxRate] = useState(DEFAULT_TAX_RATE_PERCENT)
  const defaultSupplierName = getCompanyTradeName(companyBranding)

  const [agents, setAgents] = useState<any[]>([])
  const [agentQuotes, setAgentQuotes] = useState<AgentQuote[]>([])
  const [agentQuotesViewMode, setAgentQuotesViewMode] =
    useState<AgentQuotesViewMode>('cards')
  const [fclTableChargeOverrides, setFclTableChargeOverrides] =
    useState<FclTableChargeOverrides>({})
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])
  const [containerRateLines, setContainerRateLines] = useState<any[]>([])
  const [cargoLines, setCargoLines] = useState<CargoLine[]>([])
  const [savingCargo, setSavingCargo] = useState(false)
  const [clientRates, setClientRates] = useState<ClientRate[]>([])
  const [surchargeRules, setSurchargeRules] = useState<SurchargeRule[]>([])
  const [serviceProductOptions, setServiceProductOptions] =
    useState(serviceProducts)
  const [optionalClientRateConfig, setOptionalClientRateConfig] =
    useState<OptionalClientRateConfig>(fallbackOptionalClientRateConfig)
  const [insuranceTaxable, setInsuranceTaxable] = useState(true)
  const [agentRouteRates, setAgentRouteRates] = useState<any[]>([])
  const [isOptionalClientRatesOpen, setIsOptionalClientRatesOpen] = useState(true)

  useEffect(() => {
    setIsOptionalClientRatesOpen(selectedQuote?.service_product !== 'other_origin_air')
  }, [selectedQuote?.id, selectedQuote?.service_product])

  const fclTableStorageKey = selectedQuote?.id
    ? `pricing-comparison:fcl-table:${selectedQuote.id}`
    : null

  useEffect(() => {
    if (!fclTableStorageKey) {
      setFclTableChargeOverrides({})
      return
    }

    try {
      const storedTable = window.localStorage.getItem(fclTableStorageKey)
      setFclTableChargeOverrides(
        storedTable ? (JSON.parse(storedTable) as FclTableChargeOverrides) : {}
      )
    } catch {
      setFclTableChargeOverrides({})
    }
  }, [fclTableStorageKey])

  const saveFclTableOverrides = () => {
    if (!fclTableStorageKey) {
      toast.error('Selecciona una cotizacion primero')
      return
    }

    try {
      window.localStorage.setItem(
        fclTableStorageKey,
        JSON.stringify(fclTableChargeOverrides)
      )
      toast.success('Tabla guardada')
    } catch {
      toast.error('No se pudo guardar la tabla en este navegador')
    }
  }

  const [agentForm, setAgentForm] = useState({
    agent_id: '',
    agente_nombre: '',
    ocean_freight: '',
    exw_cost: '',
    mbl_fee: '',
    profit_per_container: '',
    containers_qty: '1',
    free_days_destination: '',
    carrier: '',
    transshipment: '',
    moneda: 'USD',
    transit_time: '',
    valid_until: '',
    etd: '',
  })

  const [pricingForm, setPricingForm] = useState({
    item_type: 'Flete',
    description: '',
    cost_amount: '',
    sale_amount: '',
    quantity: '1',
    taxable: false,
    currency: 'USD',
    supplier: '',
    notes: '',
  })

  const [editingPricingItemId, setEditingPricingItemId] = useState<string | null>(null)
  const [editingAgentQuoteId, setEditingAgentQuoteId] = useState<string | null>(null)
  const [highlightedAgentQuoteId, setHighlightedAgentQuoteId] = useState<string | null>(null)
  const [selectedRateForConfirm, setSelectedRateForConfirm] = useState<any | null>(null)
  const [confirmSelectRateOpen, setConfirmSelectRateOpen] = useState(false)
  const [selectingRate, setSelectingRate] = useState(false)
  const [deleteAgentQuoteId, setDeleteAgentQuoteId] = useState<string | null>(null)
  const [pricingValidationDialogOpen, setPricingValidationDialogOpen] =
    useState(false)
  const [pricingValidationErrors, setPricingValidationErrors] =
    useState<string[]>([])
  const [profitabilityDialogOpen, setProfitabilityDialogOpen] = useState(false)
  const [profitabilityWarnings, setProfitabilityWarnings] = useState<string[]>([])
  const [profitabilityReason, setProfitabilityReason] = useState('')
  const [pendingApprovePricing, setPendingApprovePricing] =
    useState<null | (() => Promise<void>)>(null)
  const [operationalImpactDialogOpen, setOperationalImpactDialogOpen] = useState(false)
  const [operationalImpact, setOperationalImpact] = useState<OperationalImpact | null>(null)
  const [pendingOperationalApproval, setPendingOperationalApproval] = useState<{
    reason?: string
  } | null>(null)
  const [processingOperationalApproval, setProcessingOperationalApproval] = useState(false)
  const [postApprovalDialogOpen, setPostApprovalDialogOpen] = useState(false)
  const [postApprovalReason, setPostApprovalReason] = useState('')
  const [postApprovalDialogCopy, setPostApprovalDialogCopy] = useState({
    title: 'Cotizacion ya enviada al cliente',
    description:
      'Esta cotizacion ya fue aprobada o enviada al cliente. Debes registrar el motivo del cambio para mantener trazabilidad.',
  })
  const [pendingPostApprovalAction, setPendingPostApprovalAction] = useState<null | (() => Promise<void>)>(null)
  const [savingPostApproval, setSavingPostApproval] = useState(false)
  const [showAddChargeModal, setShowAddChargeModal] = useState(false)
  const [savingMiamiCharge, setSavingMiamiCharge] = useState(false)
  const [miamiChargeForm, setMiamiChargeForm] = useState({
    description: '',
    category: 'freight',
    sale_amount: '',
    taxable: false,
    supplier: defaultSupplierName,
    notes: '',
  })
  const agentQuotesSectionRef = useRef<HTMLDivElement | null>(null)
  const postApprovalReasonRef = useRef('')
  const profitabilityReasonRef = useRef('')
  const postApprovalResolveRef = useRef<((reason: string | null) => void) | null>(null)

  const [editingPricingItemForm, setEditingPricingItemForm] =
    useState<any>(null)
  const bankTransferFee = Number(
    surchargeRules.find((rule) => rule.code === 'bank_transfer_fee')
      ?.fixed_amount || 0
  )

  useEffect(() => {
    fetchQuotations()
    fetchAgents()
    fetchCompanyBranding()
    fetchDynamicCatalogs()
  }, [quoteId])

  const fetchDynamicCatalogs = async () => {
    const [activeServiceProducts, activeClientRateCatalog] = await Promise.all([
      fetchActiveServiceProducts(supabase),
      fetchActiveClientRateCatalog(supabase),
    ])

    setServiceProductOptions(activeServiceProducts)
    setOptionalClientRateConfig(
      buildOptionalClientRateConfig(activeClientRateCatalog)
    )
  }

  const fetchCompanyBranding = async () => {
    const { data } = await supabase
      .from('company_settings')
      .select(`${COMPANY_BRANDING_SELECT}, default_tax_rate`)
      .limit(1)
      .maybeSingle()

    const normalizedBranding = normalizeCompanyBranding(data)
    setCompanyBranding(normalizedBranding)
    setMiamiChargeForm((current) => ({
      ...current,
      supplier:
        current.supplier.trim() && current.supplier !== getCompanyTradeName(null)
          ? current.supplier
          : getCompanyTradeName(normalizedBranding),
    }))
    setDefaultTaxRate(normalizeTaxRatePercent((data as any)?.default_tax_rate))
  }

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          codigo_cliente,
          nombre,
          asegura_carga,
          seguro_porcentaje
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      return
    }

    setQuotations(data || [])

    if (quoteId) {
      const quote = data?.find((q) => q.id === quoteId)
      if (quote) {
        await handleSelectQuote(quote)
      }
    }
  }

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    setAgents(data || [])
  }

  const fetchAgentQuotes = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('agent_quotes')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      return
    }

    setAgentQuotes(data || [])
  }

  const fetchPricingItems = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('pricing_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
      return
    }

    setPricingItems(data || [])
  }

  const fetchQuotationContainers = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('quotation_containers')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      return
    }

    setQuotationContainers(data || [])
  }

  const loadCargoLines = async (quotationId?: string) => {
    const targetQuotationId = quotationId || selectedQuote?.id

    if (!targetQuotationId) return

    const { data, error } = await supabase
      .from('quotation_cargo_lines')
      .select('*')
      .eq('quotation_id', targetQuotationId)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(error.message)
      setCargoLines([])
      return
    }

    if (!error && data) {
      setCargoLines(data as CargoLine[])
    }
  }

  const loadMiamiRates = async (quote = selectedQuote) => {
    if (!quote?.cliente_id) {
      setClientRates([])
      setSurchargeRules([])
      return
    }

    const surchargeServiceProduct =
      quote.service_product ||
      (normalizeText(quote.quote_type) === 'fcl' ? 'other_origin_fcl' : null)

    const { data: ratesData } = await supabase
      .from('client_rates')
      .select('rate_code, rate_label, category, unit, currency, amount, notes, is_active')
      .eq('cliente_id', quote.cliente_id)
      .eq('is_active', true)

    const { data: surchargeData } = surchargeServiceProduct
      ? await supabase
          .from('surcharge_rules')
          .select('code, label, rate_per_lbs, rate_per_ft3, fixed_amount, minimum_amount, currency')
          .eq('service_product', surchargeServiceProduct)
          .eq('is_active', true)
      : { data: [] }

    setClientRates((ratesData || []) as ClientRate[])
    setSurchargeRules((surchargeData || []) as SurchargeRule[])
  }

  useEffect(() => {
    if (!selectedQuote?.id) return

    loadMiamiRates()
  }, [selectedQuote?.id, selectedQuote?.cliente_id, selectedQuote?.service_product])

  const handleSelectQuote = async (quote: any) => {
    setSelectedQuote(quote)
    setClientNotes(quote.client_notes || '')
    await fetchAgentQuotes(quote.id)
    await fetchPricingItems(quote.id)
    await fetchQuotationContainers(quote.id)
    await loadCargoLines(quote.id)
    await loadMiamiRates(quote)
  }

  const fetchAgentRouteRates = async (agentId: string) => {
    if (!agentId) { setAgentRouteRates([]); return }
    const { data } = await supabase
      .from('agent_route_rates')
      .select('*')
      .eq('agent_id', agentId)
      .order('valid_until', { ascending: false })
    setAgentRouteRates(data || [])
  }

  const applyAgentRouteRate = (rate: any) => {
    setAgentForm((prev) => ({
      ...prev,
      ocean_freight: String(rate.base_rate ?? ''),
      transit_time: String(rate.transit_time ?? ''),
      transshipment: rate.transshipment ?? prev.transshipment,
      free_days_destination: String(rate.free_days_destination ?? ''),
      valid_until: rate.valid_until ?? prev.valid_until,
      carrier: rate.carrier ?? prev.carrier,
      moneda: rate.currency ?? prev.moneda,
    }))
    toast.success(`Tarifa aplicada: ${rate.origin} → ${rate.destination}`)
  }

  const handleAgentChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setAgentForm({
      ...agentForm,
      [e.target.name]: e.target.value,
    })
  }

  const handlePricingChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setPricingForm({
      ...pricingForm,
      [e.target.name]: e.target.value,
    })
  }

  const updateCargoLine = (
    lineId: string,
    field: keyof CargoLine,
    value: string
  ) => {
    setCargoLines((prev) =>
      prev.map((line) =>
        line.id === lineId ? { ...line, [field]: value } : line
      )
    )
  }

  const calculateCargoLineCbm = (line: CargoLine) => {
    const quantity = Number(line.quantity || 0)
    const length = Number(line.length || 0)
    const width = Number(line.width || 0)
    const height = Number(line.height || 0)

    if (!quantity || !length || !width || !height) return 0

    if (line.dimension_unit === 'in') {
      return ((length * width * height) / 61023.7441) * quantity
    }

    if (line.dimension_unit === 'cm') {
      return ((length * width * height) / 1_000_000) * quantity
    }

    if (line.dimension_unit === 'mm') {
      return ((length * width * height) / 1_000_000_000) * quantity
    }

    if (line.dimension_unit === 'm') {
      return length * width * height * quantity
    }

    return 0
  }

  const calculateCargoLineFt3 = (line: CargoLine) =>
    calculateCargoLineCbm(line) * 35.3147

  const getRateAmount = (code: string) => {
    const rate = clientRates.find((item) => item.rate_code === code)
    return Number(rate?.amount || 0)
  }

  const normalizeText = (value?: string | null) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  const isAirQuote = (quote = selectedQuote) =>
    normalizeText(quote?.tipo_transporte) === 'aereo'

  const isAirConsolidatedQuote = (quote = selectedQuote) =>
    isAirQuote(quote) && normalizeText(quote?.quote_type) === 'consolidado'

  const getFreightDescription = (quote = selectedQuote) => {
    if (isAirConsolidatedQuote(quote)) return 'Air Freight Consolidado'
    if (isAirQuote(quote)) return 'Air Freight'
    const transport = normalizeText(quote?.tipo_transporte)
    if (transport === 'terrestre') return 'Flete Terrestre'
    return 'Ocean Freight'
  }

  const getAirConsolidatedWeights = () => {
    const realKg = totalCargoKg || Number(selectedQuote?.peso_kg || 0)
    const cbm = totalCargoCbm || Number(selectedQuote?.volumen_cbm || 0)
    const volumetricKg = cbm * AIR_VOLUMETRIC_KG_PER_CBM

    return {
      actualWeightKg: realKg,
      volumetricWeightKg: volumetricKg,
      chargeableWeightKg: Math.max(realKg, volumetricKg, 0),
    }
  }

  const getChargeableKg = () =>
    getAirConsolidatedWeights().chargeableWeightKg

  const getAgentAirRatePerKg = (quote: AgentQuote) => {
    const storedRate = Number(quote.rate_per_kg || 0)
    if (storedRate > 0) return storedRate

    const chargeableKg = Number(
      quote.chargeable_weight_kg || getChargeableKg()
    )

    if (chargeableKg <= 0) return 0

    return Number(quote.ocean_freight || quote.costo || 0) / chargeableKg
  }

  const getTotalContainersQty = (fallbackQty?: string | number) =>
    quotationContainers.length > 0
      ? quotationContainers.reduce(
          (sum, container) => sum + Number(container.quantity || 0),
          0
        )
      : Number(fallbackQty || agentForm.containers_qty || 1)

  const getTotalOceanFreight = () => {
    if (isAirConsolidatedQuote()) {
      return Number(agentForm.ocean_freight || 0) * getChargeableKg()
    }

    return containerRateLines.length > 0
      ? containerRateLines.reduce(
          (sum, line) =>
            sum +
            Number(line.quantity || 0) *
              Number(line.ocean_freight || 0),
          0
        )
      : Number(agentForm.ocean_freight || 0)
  }

  const handleEditAgentQuote = async (quote: any) => {
    if (!ensureAgentQuoteCanBeModified()) return

    setEditingAgentQuoteId(quote.id)
    const airRatePerKg =
      isAirConsolidatedQuote()
        ? getAgentAirRatePerKg(quote)
        : null

    setAgentForm({
      agent_id: quote.agent_id || '',
      agente_nombre: quote.agente_nombre || '',
      ocean_freight: String(
        airRatePerKg !== null
          ? airRatePerKg
          : quote.ocean_freight || quote.costo || ''
      ),
      exw_cost: String(quote.exw_cost || ''),
      mbl_fee: String(quote.mbl_fee || ''),
      profit_per_container: String(quote.profit_per_container || ''),
      containers_qty: String(quote.containers_qty || '1'),
      free_days_destination: String(quote.free_days_destination || ''),
      carrier: quote.carrier || '',
      transshipment: quote.transshipment || '',
      moneda: quote.moneda || 'USD',
      transit_time: quote.transit_time || '',
      valid_until: quote.valid_until || '',
      etd: quote.etd || '',
    })

    const { data: containerRatesData, error: containerRatesError } =
      await supabase
        .from('agent_quote_container_rates')
        .select('*')
        .eq('agent_quote_id', quote.id)
        .order('created_at', { ascending: true })

    if (containerRatesError) {
      toast.error(containerRatesError.message)
      return
    }

    setContainerRateLines(containerRatesData || [])
  }

  const saveAgentQuote = async () => {
    if (!selectedQuote) {
      toast.error('Selecciona una cotizacion primero')
      return
    }

    if (!ensureAgentQuoteCanBeModified()) return

    const oldStatus = selectedQuote.status || 'Borrador'
    const nextStatus = 'Pendiente de Fijar Precios'

    if (oldStatus !== nextStatus && !canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    const editingAgentQuote = editingAgentQuoteId
      ? agentQuotes.find((quote) => quote.id === editingAgentQuoteId)
      : null
    const isEditingSelectedAgentQuote = editingAgentQuote
      ? isSelectedQuote(editingAgentQuote)
      : false
    const previousFinalCost = editingAgentQuote
      ? getAgentQuoteFinalCost(editingAgentQuote)
      : null

    const reason = await requestChangeReason(
      isEditingSelectedAgentQuote
        ? 'selected_agent_quote_updated'
        : editingAgentQuoteId
          ? 'Actualizar tarifa de agente'
          : 'Agregar tarifa de agente',
      isEditingSelectedAgentQuote
        ? {
            force: true,
            title: 'Editar tarifa seleccionada',
            description:
              'Esta tarifa ya está seleccionada para pricing. Debes registrar el motivo de la edición para mantener trazabilidad.',
          }
        : undefined
    )

    if (reason === null) return

    const totalContainersQty = getTotalContainersQty()
    const airWeights = getAirConsolidatedWeights()
    const ratePerKg = isAirConsolidatedQuote()
      ? Number(agentForm.ocean_freight || 0)
      : null
    const baseFreight =
      ratePerKg !== null
        ? ratePerKg * airWeights.chargeableWeightKg
        : getTotalOceanFreight()

    const suggestedSale =
      baseFreight +
      Number(agentForm.exw_cost || 0) +
      Number(agentForm.mbl_fee || 0) +
      Number(agentForm.profit_per_container || 0) * totalContainersQty

    const agentQuotePayload = {
      agent_id: agentForm.agent_id || null,
      agente_nombre: agentForm.agente_nombre,
      costo: baseFreight,
      ocean_freight: baseFreight,
      exw_cost: Number(agentForm.exw_cost || 0),
      mbl_fee: Number(agentForm.mbl_fee || 0),
      profit_per_container: Number(agentForm.profit_per_container || 0),
      containers_qty: Number(agentForm.containers_qty || 1),
      free_days_destination: Number(agentForm.free_days_destination || 0),
      carrier: agentForm.carrier,
      transshipment: agentForm.transshipment,
      moneda: agentForm.moneda,
      transit_time: agentForm.transit_time,
      valid_until: agentForm.valid_until || null,
      etd: agentForm.etd || null,
      suggested_sale: suggestedSale,
      rate_per_kg: ratePerKg,
      actual_weight_kg: ratePerKg !== null ? airWeights.actualWeightKg : null,
      volumetric_weight_kg:
        ratePerKg !== null ? airWeights.volumetricWeightKg : null,
      chargeable_weight_kg:
        ratePerKg !== null ? airWeights.chargeableWeightKg : null,
    }

    const { data: savedAgentQuote, error } = editingAgentQuoteId
      ? await supabase
          .from('agent_quotes')
          .update(agentQuotePayload)
          .eq('id', editingAgentQuoteId)
          .select()
          .single()
      : await supabase
          .from('agent_quotes')
          .insert({
            quotation_id: selectedQuote.id,
            ...agentQuotePayload,
            is_selected: false,
          })
          .select()
          .single()

    if (error) {
      toast.error(error.message)
      return
    }

    if (isEditingSelectedAgentQuote) {
      const updatedQuoteFields = {
        valid_until:
          savedAgentQuote.valid_until || selectedQuote.valid_until || null,
        preferred_carrier:
          savedAgentQuote.carrier || selectedQuote.preferred_carrier || null,
        transit_time:
          savedAgentQuote.transit_time || selectedQuote.transit_time || null,
        transshipment:
          savedAgentQuote.transshipment || selectedQuote.transshipment || null,
      }

      const { error: quotationUpdateError } = await supabase
        .from('quotations')
        .update(updatedQuoteFields)
        .eq('id', selectedQuote.id)

      if (quotationUpdateError) {
        toast.error(quotationUpdateError.message)
        return
      }

      setSelectedQuote({
        ...selectedQuote,
        ...updatedQuoteFields,
      })
    }

    if (quotationContainers.length > 0 && containerRateLines.length > 0) {
      await supabase
        .from('agent_quote_container_rates')
        .delete()
        .eq('agent_quote_id', savedAgentQuote.id)

      const ratePayload = containerRateLines.map((line) => ({
        agent_quote_id: savedAgentQuote.id,
        quotation_container_id: line.quotation_container_id,
        container_type_name: line.container_type_name,
        quantity: Number(line.quantity || 0),
        ocean_freight: Number(line.ocean_freight || 0),
        total_ocean_freight:
          Number(line.quantity || 0) * Number(line.ocean_freight || 0),
      }))

      const { error: ratesError } = await supabase
        .from('agent_quote_container_rates')
        .insert(ratePayload)

      if (ratesError) {
        toast.error(ratesError.message)
        return
      }
    }

    if (oldStatus !== nextStatus) {
      const { error: statusError } = await supabase
        .from('quotations')
        .update({ status: nextStatus })
        .eq('id', selectedQuote.id)

      if (statusError) {
        toast.error(statusError.message)
        return
      }

      await supabase.from('quotation_status_history').insert([
        {
          quotation_id: selectedQuote.id,
          old_status: oldStatus,
          new_status: nextStatus,
          changed_by: profile?.id,
        },
      ])

      setSelectedQuote({
        ...selectedQuote,
        status: nextStatus,
      })
    }

    toast.success(
      editingAgentQuoteId
        ? 'Tarifa del agente actualizada'
        : 'Tarifa del agente guardada'
    )

    if (isEditingSelectedAgentQuote) {
      const newFinalCost = getAgentQuoteFinalCost(savedAgentQuote)

      await createActivityLog({
        module: 'pricing',
        action: 'selected_agent_quote_updated',
        entityType: 'agent_quote',
        entityId: savedAgentQuote.id,
        description: `Se editó la tarifa seleccionada de ${
          getAgentQuoteProviderName(savedAgentQuote)
        } para la cotización ${
          selectedQuote.quotation_number || selectedQuote.id
        }`,
        metadata: {
          reason,
          agent:
            savedAgentQuote.agente_nombre ||
            savedAgentQuote.agent_name ||
            savedAgentQuote.agent ||
            null,
          carrier: savedAgentQuote.carrier || null,
          previousCost: previousFinalCost,
          newCost: newFinalCost,
          quotationId: selectedQuote.id,
        },
      })

      if (pricingItems.length > 0) {
        toast.warning(
          'La tarifa seleccionada fue actualizada. Revisa o regenera las líneas de venta para reflejar los cambios.'
        )
      }
    }

    setAgentForm({
      agent_id: '',
      agente_nombre: '',
      ocean_freight: '',
      exw_cost: '',
      mbl_fee: '',
      profit_per_container: '',
      containers_qty: '1',
      free_days_destination: '',
      carrier: '',
      transshipment: '',
      moneda: 'USD',
      transit_time: '',
      valid_until: '',
      etd: '',
    })

    setContainerRateLines([])
    setEditingAgentQuoteId(null)

    await fetchAgentQuotes(selectedQuote.id)
    await fetchQuotations()

    setHighlightedAgentQuoteId(savedAgentQuote.id)
    agentQuotesSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })

    window.setTimeout(() => {
      setHighlightedAgentQuoteId((current) =>
        current === savedAgentQuote.id ? null : current
      )
    }, 1200)
  }

  const selectAgentQuote = async (agentQuoteId: string) => {
    if (!selectedQuote) return

    if (!ensureQuoteIsEditable()) return

    let selectedAgentQuote = agentQuotes.find((quote) => quote.id === agentQuoteId)

    if (!selectedAgentQuote) {
      const { data, error: agentQuoteError } = await supabase
        .from('agent_quotes')
        .select('*')
        .eq('id', agentQuoteId)
        .single()

      if (agentQuoteError) {
        toast.error(agentQuoteError.message)
        return
      }

      selectedAgentQuote = data
    }

    const reason = await requestChangeReason('Regenerar pricing')

    if (reason === null) return

    const currency = selectedAgentQuote.moneda || 'USD'
    const supplier = selectedAgentQuote.agente_nombre || ''
    const containersQty =
      quotationContainers.length > 0
        ? quotationContainers.reduce(
            (sum, container) => sum + Number(container.quantity || 0),
            0
          )
        : Number(selectedAgentQuote.containers_qty || 1)
    const oceanFreight = Number(
      selectedAgentQuote.ocean_freight || selectedAgentQuote.costo || 0
    )
    const exwCost = Number(selectedAgentQuote.exw_cost || 0)
    const mblFee = Number(selectedAgentQuote.mbl_fee || 0)
    const totalProfit =
      Number(selectedAgentQuote.profit_per_container || 0) * containersQty

    const { data: containerRatesData, error: containerRatesError } =
      await supabase
        .from('agent_quote_container_rates')
        .select('*')
        .eq('agent_quote_id', agentQuoteId)
        .order('created_at', { ascending: true })

    if (containerRatesError) {
      toast.error(containerRatesError.message)
      return
    }

    const agentProfitPerContainer =
      Number(selectedAgentQuote.profit_per_container || 0)

    const mblPerContainer =
      containersQty > 0 ? Number(selectedAgentQuote.mbl_fee || 0) / containersQty : 0

    const freightDescription = getFreightDescription()
    const chargeableKg =
      Number(selectedAgentQuote.chargeable_weight_kg || 0) || getChargeableKg()
    const airRatePerKg = isAirConsolidatedQuote()
      ? getAgentAirRatePerKg(selectedAgentQuote)
      : 0
    const airFreightNotes =
      isAirConsolidatedQuote() && chargeableKg > 0
        ? `Peso cobrable ${chargeableKg.toFixed(2)} KG × USD ${airRatePerKg.toFixed(
            2
          )}/KG.`
        : ''

    const totalSaleFreight = oceanFreight + mblFee + totalProfit

    const oceanFreightLines = isAirConsolidatedQuote()
      ? [
          {
            quotation_id: selectedQuote.id,
            item_type: 'Flete',
            description: freightDescription,
            cost_amount: oceanFreight + mblFee,
            sale_amount: totalSaleFreight,
            quantity: 1,
            taxable: false,
            tax_rate: 0,
            tax_amount: 0,
            total_amount: totalSaleFreight,
            currency,
            supplier,
            notes: airFreightNotes,
            created_by: profile?.id,
          },
        ]
      : containerRatesData && containerRatesData.length > 0
        ? containerRatesData.map((rate) => {
            const unitCost =
              Number(rate.ocean_freight || 0) + mblPerContainer
            const unitSale =
              Number(rate.ocean_freight || 0) +
              agentProfitPerContainer +
              mblPerContainer

            const quantity = Number(rate.quantity || 1)

            return {
              quotation_id: selectedQuote.id,
              item_type: 'Flete',
              description: `${freightDescription} ${rate.container_type_name}`,
              cost_amount: unitCost,
              sale_amount: unitSale,
              quantity,
              taxable: false,
              tax_rate: 0,
              tax_amount: 0,
              total_amount: unitSale * quantity,
              currency,
              supplier,
              notes: '',
              created_by: profile?.id,
            }
          })
        : [
            {
              quotation_id: selectedQuote.id,
              item_type: 'Flete',
              description: freightDescription,
              cost_amount: oceanFreight + mblFee,
              sale_amount: totalSaleFreight,
              quantity: 1,
              taxable: false,
              tax_rate: 0,
              tax_amount: 0,
              total_amount: totalSaleFreight,
              currency,
              supplier,
              notes: '',
              created_by: profile?.id,
            },
          ]

    const exwLines = exwCost > 0
      ? [
          {
            quotation_id: selectedQuote.id,
            item_type: 'Origen',
            description: 'EXW',
            cost_amount: exwCost,
            sale_amount: exwCost,
            quantity: 1,
            taxable: false,
            tax_rate: 0,
            tax_amount: 0,
            total_amount: exwCost,
            currency,
            supplier,
            notes: '',
            created_by: profile?.id,
          },
        ]
      : []

    const pricingLines = [
      ...oceanFreightLines,
      ...exwLines,
    ]

    // If the UI did not require an explicit reason (reason === ''), provide
    // a default non-empty reason so the RPC validation passes without
    // interrupting the user flow. This preserves auditability while avoiding
    // the post-approval dialog when selecting a tariff to continue a quote.
    const finalReason = reason === '' ? 'Selección de tarifa para continuar cotización' : reason

    const { data: selectionData, error: pricingError } = await supabase.rpc(
      'select_agent_quote_and_replace_pricing',
      {
        p_quotation_id: selectedQuote.id,
        p_agent_quote_id: agentQuoteId,
        p_pricing_lines: pricingLines,
        p_reason: finalReason,
      }
    )

    if (pricingError) {
      toast.error(pricingError.message)
      return
    }

    const selection = (selectionData as Array<{
      valid_until: string | null
      preferred_carrier: string | null
      transit_time: string | null
      transshipment: string | null
    }> | null)?.[0]

    setSelectedQuote({
      ...selectedQuote,
      valid_until: selection?.valid_until || selectedQuote.valid_until || null,
      preferred_carrier: selection?.preferred_carrier || selectedQuote.preferred_carrier || null,
      transit_time: selection?.transit_time || selectedQuote.transit_time || null,
      transshipment: selection?.transshipment || selectedQuote.transshipment || null,
    })

    toast.success('Tarifa seleccionada')

    await fetchQuotations()
    await fetchAgentQuotes(selectedQuote.id)
    await fetchPricingItems(selectedQuote.id)
  }

  const handleDeleteAgentQuote = async (agentQuoteId: string) => {
    if (!selectedQuote) return
    if (!ensureQuoteIsEditable()) return

    const agentQuote = agentQuotes.find((quote) => quote.id === agentQuoteId)

    if (agentQuote && isSelectedQuote(agentQuote)) {
      toast.error('No puedes eliminar la tarifa seleccionada')
      return
    }

    const { error } = await supabase
      .from('agent_quotes')
      .delete()
      .eq('id', agentQuoteId)

    if (error) {
      toast.error('No se pudo eliminar la tarifa')
      return
    }

    toast.success('Tarifa eliminada')
    setDeleteAgentQuoteId(null)
    await fetchAgentQuotes(selectedQuote.id)
  }

  const confirmSelectRate = async () => {
    if (!selectedRateForConfirm) return

    setSelectingRate(true)

    try {
      await selectAgentQuote(selectedRateForConfirm.id)
    } finally {
      setSelectingRate(false)
      setConfirmSelectRateOpen(false)
      setSelectedRateForConfirm(null)
    }
  }

  const savePricingItem = async () => {
    if (!selectedQuote) {
      toast.error('Selecciona una cotizacion primero')
      return
    }

    if (!ensureQuoteIsEditable()) return

    if (!pricingForm.description) {
      toast.error('La descripcion es obligatoria')
      return
    }

    const reason = await requestChangeReason('Agregar cargo adicional')

    if (reason === null) return

    const { error } = await supabase.from('pricing_items').insert([
      {
        quotation_id: selectedQuote.id,
        item_type: pricingForm.item_type,
        description: pricingForm.description,
        cost_amount: Number(pricingForm.cost_amount || 0),
        sale_amount: Number(pricingForm.sale_amount || 0),
        quantity: quantity,
        taxable: pricingForm.taxable,
        tax_rate: defaultTaxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: pricingForm.currency,
        supplier: pricingForm.supplier,
        notes: pricingForm.notes,
        created_by: profile?.id,
      },
    ])

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Linea de pricing agregada')

    setPricingForm({
      item_type: 'Flete',
      description: '',
      cost_amount: '',
      sale_amount: '',
      quantity: '1',
      taxable: false,
      currency: 'USD',
      supplier: '',
      notes: '',
    })

    await fetchPricingItems(selectedQuote.id)
  }

  const resetMiamiChargeForm = () => {
    setMiamiChargeForm({
      description: '',
      category: 'freight',
      sale_amount: '',
      taxable: false,
      supplier: defaultSupplierName,
      notes: '',
    })
  }

  const saveMiamiCharge = async () => {
    if (!selectedQuote) {
      toast.error('Selecciona una cotizacion primero')
      return
    }

    if (!ensureQuoteIsEditable()) return

    if (!miamiChargeForm.description.trim()) {
      toast.error('La descripcion es obligatoria')
      return
    }

    const saleAmount = Number(miamiChargeForm.sale_amount || 0)

    if (saleAmount <= 0) {
      toast.error('La venta debe ser mayor a cero')
      return
    }

    const reason = await requestChangeReason('Agregar cargo operativo Miami')

    if (reason === null) return

    const taxAmount = calculateTaxAmount(
      miamiChargeForm.taxable,
      saleAmount,
      defaultTaxRate
    )
    const totalAmount = saleAmount + taxAmount

    try {
      setSavingMiamiCharge(true)

      const { error } = await supabase.from('pricing_items').insert([
        {
          quotation_id: selectedQuote.id,
          item_type: miamiChargeForm.category,
          description: miamiChargeForm.description.trim(),
          cost_amount: 0,
          sale_amount: saleAmount,
          quantity: 1,
          taxable: miamiChargeForm.taxable,
          tax_rate: defaultTaxRate,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          currency: 'USD',
          supplier: miamiChargeForm.supplier.trim() || defaultSupplierName,
          notes: miamiChargeForm.notes.trim(),
          created_by: profile?.id,
        },
      ])

      if (error) {
        toast.error(error.message)
        return
      }

      toast.success('Cargo operativo agregado')
      await createActivityLog({
        module: 'quotations',
        action: 'pricing_item_added',
        entityType: 'quotation',
        entityId: selectedQuote.id,
        description: `Se agregó un cargo a la cotización ${selectedQuote.quotation_number}`,
        metadata: {
          description: miamiChargeForm.description,
          itemType: miamiChargeForm.category,
          amount: Number(miamiChargeForm.sale_amount || 0),
          taxable: miamiChargeForm.taxable,
        },
      })

      resetMiamiChargeForm()
      setShowAddChargeModal(false)

      await fetchPricingItems(selectedQuote.id)
    } finally {
      setSavingMiamiCharge(false)
    }
  }

  const saveCargoLines = async () => {
    if (!selectedQuote?.id) return

    if (!ensureQuoteIsEditable()) return

    setSavingCargo(true)

    const { error: deleteError } = await supabase
      .from('quotation_cargo_lines')
      .delete()
      .eq('quotation_id', selectedQuote.id)

    if (deleteError) {
      setSavingCargo(false)
      toast.error('No se pudo limpiar el detalle de carga anterior')
      return
    }

    const rows = cargoLines
      .filter((line) => Number(line.quantity || 0) > 0)
      .map((line) => ({
        quotation_id: selectedQuote.id,
        quantity: Number(line.quantity || 0),
        package_type: line.package_type || 'Caja',
        length: Number(line.length || 0),
        width: Number(line.width || 0),
        height: Number(line.height || 0),
        dimension_unit: line.dimension_unit || 'in',
        weight_lbs: Number(line.weight_lbs || 0),
        ft3: calculateCargoLineFt3(line),
        cbm: calculateCargoLineCbm(line),
      }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('quotation_cargo_lines')
        .insert(rows)

      if (insertError) {
        setSavingCargo(false)
        toast.error('No se pudo guardar el nuevo detalle de carga')
        return
      }
    }

    const { error: quoteError } = await supabase
      .from('quotations')
      .update({
        peso_lbs: totalCargoLbs || null,
        peso_kg: totalCargoKg || null,
        volumen_ft3: totalCargoFt3 || null,
        volumen_cbm: totalCargoCbm || null,
      })
      .eq('id', selectedQuote.id)

    setSavingCargo(false)

    if (quoteError) {
      toast.error('La carga se guardó, pero no se actualizaron los totales')
      return
    }

    setSelectedQuote({
      ...selectedQuote,
      peso_lbs: totalCargoLbs || null,
      peso_kg: totalCargoKg || null,
      volumen_ft3: totalCargoFt3 || null,
      volumen_cbm: totalCargoCbm || null,
    })

    toast.success('Detalle de carga actualizado')
    await createActivityLog({
      module: 'quotations',
      action: 'cargo_updated',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Se actualizó el detalle de carga de la cotización ${selectedQuote.quotation_number}`,
      metadata: {
        totalCargoLbs,
        totalCargoKg,
        totalCargoFt3,
        totalCargoCbm,
        lines: cargoLines.length,
      },
    })

    await loadCargoLines()
  }

  const recalculateMiamiLclPricing = async () => {
    if (!selectedQuote?.id) return

    if (!ensureQuoteIsEditable()) return

    if (selectedQuote.service_product !== 'miami_lcl') {
      toast.error('El recálculo automático está disponible para Miami LCL')
      return
    }

    const result = calculateMiamiLcl({
      ft3: totalCargoFt3,
      lbs: totalCargoLbs,
      rateFt3: getRateAmount('lcl_maritimo_sps_ft3'),
      rateLbs: getRateAmount('lcl_maritimo_sps_lbs'),
      minimumSmall: getRateAmount('small_maritimo_min_lcl_1000_lbs_45_ft3'),
      minimumLarge: getRateAmount('minimo_maritimo_2mil_lbs_90_ft3'),
    })

    const bunkerRule = surchargeRules.find((rule) => rule.code === BUNKER_CODE)

    const bunkerAmount = bunkerRule
      ? Math.max(
          totalCargoLbs * Number(bunkerRule.rate_per_lbs || 0),
          totalCargoFt3 * Number(bunkerRule.rate_per_ft3 || 0),
          Number(bunkerRule.minimum_amount || 0)
        )
      : 0

    const { error: freightError } = await supabase
      .from('pricing_items')
      .update({
        sale_amount: result.oceanFreight,
        tax_amount: 0,
        total_amount: result.oceanFreight,
        notes: `Recalculado: FT3 ${totalCargoFt3.toFixed(
          2
        )} / LBS ${totalCargoLbs.toFixed(0)}.`,
      })
      .eq('quotation_id', selectedQuote.id)
      .eq('description', 'Flete Miami LCL')

    if (freightError) {
      toast.error('No se pudo recalcular el flete Miami LCL')
      return
    }

    if (bunkerRule) {
      const { error: bunkerError } = await supabase
        .from('pricing_items')
        .update({
          sale_amount: bunkerAmount,
          tax_amount: 0,
          total_amount: bunkerAmount,
          notes: `Recalculado: MAX(lbs x ${Number(
            bunkerRule.rate_per_lbs || 0
          )}, ft3 x ${Number(
            bunkerRule.rate_per_ft3 || 0
          )}, mínimo ${Number(bunkerRule.minimum_amount || 0)}).`,
        })
        .eq('quotation_id', selectedQuote.id)
        .eq('rate_code', BUNKER_CODE)

      if (bunkerError) {
        toast.error('No se pudo recalcular el Bunker')
        return
      }
    } else {
      const { error: bunkerDeleteError } = await supabase
        .from('pricing_items')
        .delete()
        .eq('quotation_id', selectedQuote.id)
        .eq('rate_code', BUNKER_CODE)

      if (bunkerDeleteError) {
        toast.error('No se pudo quitar el Bunker desactivado')
        return
      }
    }

    toast.success('Flete y Bunker recalculados')
    await createActivityLog({
      module: 'quotations',
      action: 'miami_lcl_recalculated',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Se recalculó flete y bunker de la cotización ${selectedQuote.quotation_number}`,
      metadata: {
        totalCargoLbs,
        totalCargoFt3,
        oceanFreight: result.oceanFreight,
        bunkerAmount,
      },
    })

    await fetchPricingItems(selectedQuote.id)
  }

  const recalculateMiamiAirPricing = async () => {
    if (!selectedQuote?.id) return

    if (!ensureQuoteIsEditable()) return

    const airRate = getRateAmount('consolidado_aereo_kg')
    const airFreight = totalCargoKg * airRate

    const { error } = await supabase
      .from('pricing_items')
      .update({
        sale_amount: airFreight,
        tax_amount: 0,
        total_amount: airFreight,
        notes: `Recalculado: KG ${totalCargoKg.toFixed(
          2
        )} x tarifa USD ${airRate.toFixed(2)}.`,
      })
      .eq('quotation_id', selectedQuote.id)
      .eq('description', 'Flete Miami Aéreo Consolidado')

    if (error) {
      toast.error('No se pudo recalcular el flete Miami Aéreo')
      return
    }

    await createActivityLog({
      module: 'quotations',
      action: 'miami_air_recalculated',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Se recalculó flete Miami Aéreo de la cotización ${selectedQuote.quotation_number}`,
      metadata: {
        totalCargoKg,
        airRate,
        airFreight,
      },
    })

    toast.success('Flete Miami Aéreo recalculado')
    await fetchPricingItems(selectedQuote.id)
  }

  const recalculateMiamiPricing = async () => {
    if (!selectedQuote?.id) return

    if (selectedQuote.service_product === 'miami_lcl') {
      await recalculateMiamiLclPricing()
    }

    if (selectedQuote.service_product === 'miami_air') {
      await recalculateMiamiAirPricing()
    }
  }

  const deletePricingItem = async (itemId: string) => {
    if (!ensureQuoteIsEditable()) return

    const reason = await requestChangeReason('Eliminar línea de cotización')

    if (reason === null) return

    const { error } = await supabase
      .from('pricing_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      toast.error(error.message)
      return
    }

    if (selectedQuote) {
      await fetchPricingItems(selectedQuote.id)
    }
  }

  const formatEditableMoney = (value: unknown) =>
    Number(value || 0).toFixed(2)

  const startEditingPricingItem = (item: any) => {
    if (!ensureQuoteIsEditable()) return

    setEditingPricingItemId(item.id)

    setEditingPricingItemForm({
      item_type: item.item_type || 'Otro',
      description: item.description || '',
      quantity: item.quantity || 1,
      sale_amount: formatEditableMoney(item.sale_amount),
      cost_amount: formatEditableMoney(item.cost_amount),
      provider: item.provider || item.supplier || '',
      notes: item.notes || '',
    })
  }

  const cancelEditingPricingItem = () => {
    setEditingPricingItemId(null)
    setEditingPricingItemForm(null)
  }

  const updatePricingItem = async (item: any) => {
    if (!selectedQuote) return
    if (!editingPricingItemForm) return
    if (!ensureQuoteIsEditable()) return

    const reason = await requestChangeReason('Modificar línea de cotización')

    if (reason === null) return

    const quantity = Number(editingPricingItemForm.quantity || 1)
    const saleAmount = Number(editingPricingItemForm.sale_amount || 0)
    const subtotal = saleAmount * quantity
    const taxAmount = calculateTaxAmount(Boolean(item.taxable), subtotal, defaultTaxRate)
    const totalAmount = subtotal + taxAmount

    const { error } = await supabase
      .from('pricing_items')
      .update({
        item_type: editingPricingItemForm.item_type || 'Otro',
        description: editingPricingItemForm.description,
        quantity,
        cost_amount: Number(editingPricingItemForm.cost_amount || 0),
        sale_amount: saleAmount,
        supplier: editingPricingItemForm.provider,
        notes: editingPricingItemForm.notes,
        tax_amount: taxAmount,
        total_amount: totalAmount,
      })
      .eq('id', item.id)

    if (error) {
      toast.error(error.message)
      return
    }

    setEditingPricingItemId(null)
    setEditingPricingItemForm(null)

    await fetchPricingItems(selectedQuote.id)
  }

  const getOperationalImpact = async (
    selectedAgentQuote: AgentQuote | null
  ): Promise<OperationalImpact | null> => {
    if (!selectedQuote?.id) return null

    const quoteStatus = selectedQuote.status || 'Borrador'
    const isPendingPricing = quoteStatus === 'Pendiente de Fijar Precios'

    const { data: changeLogs, error: changeLogError } = await supabase
      .from('quotation_change_logs')
      .select('id')
      .eq('quotation_id', selectedQuote.id)
      .eq('change_type', 'quotation_reopened_for_repricing')
      .limit(1)

    if (changeLogError) {
      toast.error(changeLogError.message)
      return null
    }

    const { data: activityLogs, error: activityLogError } = await supabase
      .from('activity_logs')
      .select('id')
      .eq('entity_type', 'quotation')
      .eq('entity_id', selectedQuote.id)
      .eq('action', 'quotation_reopened_for_repricing')
      .limit(1)

    if (activityLogError) {
      toast.error(activityLogError.message)
      return null
    }

    const { data: shippingInstructions, error: siError } = await supabase
      .from('shipping_instructions')
      .select(
        'id, routing_number, carrier, agent_name, agent_contact, agent_email, etd, free_days, estimated_transit_days'
      )
      .eq('quotation_id', selectedQuote.id)

    if (siError) {
      toast.error(siError.message)
      return null
    }

    const shippingInstructionIds = (shippingInstructions || []).map((item) => item.id)
    let bookings: any[] = []

    if (shippingInstructionIds.length > 0) {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          shipping_instruction_id,
          booking_number,
          carrier_booking,
          master_bl,
          carrier,
          etd,
          eta,
          actual_eta,
          estimated_transit_days,
          free_days
        `)
        .in('shipping_instruction_id', shippingInstructionIds)

      if (bookingsError) {
        toast.error(bookingsError.message)
        return null
      }

      bookings = bookingsData || []
    }

    const wasReopenedForRepricing =
      (changeLogs || []).length > 0 || (activityLogs || []).length > 0
    const isRepricing =
      isPendingPricing &&
      (wasReopenedForRepricing || shippingInstructionIds.length > 0 || bookings.length > 0)

    if (!isRepricing) return null

    const shippingInstruction = shippingInstructions?.[0] || null
    const carrier = selectedAgentQuote?.carrier || selectedQuote.preferred_carrier || null
    const agentName = firstFilledValue(
      selectedAgentQuote?.agent_name,
      selectedAgentQuote?.agente_nombre,
      selectedAgentQuote?.agent,
      selectedQuote.agent_name,
      selectedQuote.agente_nombre,
      null
    )
    const agentContact = firstFilledValue(
      selectedAgentQuote?.agent_contact,
      selectedAgentQuote?.contact,
      selectedQuote.agent_contact,
      null
    )
    const agentEmail = firstFilledValue(
      selectedAgentQuote?.agent_email,
      selectedAgentQuote?.email,
      selectedQuote.agent_email,
      null
    )
    const etd = selectedAgentQuote?.etd || selectedQuote.etd || null
    const transitDays = toOptionalNumber(
      firstFilledValue(
        selectedAgentQuote?.transit_time,
        selectedAgentQuote?.transit,
        selectedQuote.transit_time
      )
    )
    const freeDays = firstFilledValue(
      selectedAgentQuote?.free_days_destination,
      selectedAgentQuote?.free_days,
      selectedAgentQuote?.dias_libres
    )
    const transshipment =
      selectedAgentQuote?.transshipment ||
      selectedAgentQuote?.transbordo ||
      selectedQuote.transshipment ||
      null

    const previousCarrier =
      shippingInstruction?.carrier || selectedQuote.preferred_carrier || null
    const previousAgentName =
      shippingInstruction?.agent_name || selectedQuote.agent_name || null
    const previousAgentContact =
      shippingInstruction?.agent_contact || selectedQuote.agent_contact || null
    const previousAgentEmail =
      shippingInstruction?.agent_email || selectedQuote.agent_email || null
    const previousEtd = shippingInstruction?.etd || selectedQuote.etd || null
    const previousTransit = firstFilledValue(
      shippingInstruction?.estimated_transit_days,
      selectedQuote.transit_time
    )
    const previousFreeDays = firstFilledValue(
      shippingInstruction?.free_days,
      selectedQuote.free_days_destination,
      selectedQuote.free_days,
      selectedQuote.dias_libres
    )
    const previousTransshipment = selectedQuote.transshipment || null

    return {
      isRepricing,
      hasShippingInstruction: shippingInstructionIds.length > 0,
      shippingInstruction,
      shippingInstructionIds,
      bookings,
      confirmedBookings: bookings.filter(hasConfirmedBookingData),
      changes: [
        {
          label: 'Agente',
          previousValue: displayOperationalValue(previousAgentName),
          newValue: displayOperationalValue(agentName),
        },
        {
          label: 'Contacto',
          previousValue: displayOperationalValue(previousAgentContact),
          newValue: displayOperationalValue(agentContact),
        },
        {
          label: 'Email',
          previousValue: displayOperationalValue(previousAgentEmail),
          newValue: displayOperationalValue(agentEmail),
        },
        {
          label: 'Carrier',
          previousValue: displayOperationalValue(previousCarrier),
          newValue: displayOperationalValue(carrier),
        },
        {
          label: 'ETD',
          previousValue: previousEtd ? formatDisplayDate(previousEtd) : 'N/A',
          newValue: etd ? formatDisplayDate(etd) : 'N/A',
        },
        {
          label: 'Tránsito',
          previousValue: displayOperationalValue(previousTransit),
          newValue: displayOperationalValue(transitDays),
        },
        {
          label: 'Días libres',
          previousValue: displayOperationalValue(previousFreeDays),
          newValue: displayOperationalValue(freeDays),
        },
        {
          label: 'Transbordo',
          previousValue: displayOperationalValue(previousTransshipment),
          newValue: displayOperationalValue(transshipment),
        },
      ],
      newValues: {
        carrier,
        agentName:
          agentName === null || agentName === undefined
            ? null
            : String(agentName),
        agentContact:
          agentContact === null || agentContact === undefined
            ? null
            : String(agentContact),
        agentEmail:
          agentEmail === null || agentEmail === undefined
            ? null
            : String(agentEmail),
        etd,
        transitDays,
        freeDays,
        transshipment,
      },
    }
  }

  const syncOperationalRepricing = async (impact: OperationalImpact) => {
    if (!impact.hasShippingInstruction) return

    for (const shippingInstructionId of impact.shippingInstructionIds) {
      const { error } = await supabase.rpc(
        'sync_shipping_instruction_from_selected_agent_quote',
        {
          p_shipping_instruction_id: shippingInstructionId,
          p_reason: 'Repricing desde Pricing Comparison',
        }
      )

      if (error) throw error
    }
  }

  const getPersistedFinancialTotals = (quote: any): FinancialTotalsSnapshot | null => {
    const fields = [
      quote?.total_cost,
      quote?.total_sale,
      quote?.profit_amount,
      quote?.gp_percentage,
    ]

    if (fields.some((value) => value === null || value === undefined || value === '')) {
      return null
    }

    const snapshot = {
      total_cost: Number(quote.total_cost),
      total_sale: Number(quote.total_sale),
      profit_amount: Number(quote.profit_amount),
      gp_percentage: Number(quote.gp_percentage),
    }

    if (Object.values(snapshot).some((value) => !Number.isFinite(value))) {
      return null
    }

    return snapshot
  }

  const calculateFinancialTotalsFromItems = (
    items: Array<{
      cost_amount?: number | string | null
      sale_amount?: number | string | null
      quantity?: number | string | null
    }>
  ): FinancialTotalsSnapshot => {
    const currentTotalCost = items.reduce(
      (sum, item) =>
        sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
      0
    )
    const currentTotalSale = items.reduce(
      (sum, item) =>
        sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
      0
    )

    return {
      total_cost: currentTotalCost,
      total_sale: currentTotalSale,
      profit_amount: currentTotalSale - currentTotalCost,
      gp_percentage: calculateGrossProfitPercent({
        saleTotal: currentTotalSale,
        costTotal: currentTotalCost,
      }),
    }
  }

  const fetchCurrentFinancialTotals = async (quotationId: string) => {
    const { data, error } = await supabase
      .from('pricing_items')
      .select('cost_amount, sale_amount, quantity')
      .eq('quotation_id', quotationId)

    if (error) {
      toast.error(error.message)
      return null
    }

    return calculateFinancialTotalsFromItems(data || [])
  }

  const getFinancialDelta = (
    previous: FinancialTotalsSnapshot,
    next: FinancialTotalsSnapshot
  ): FinancialTotalsSnapshot => ({
    total_cost: next.total_cost - previous.total_cost,
    total_sale: next.total_sale - previous.total_sale,
    profit_amount: next.profit_amount - previous.profit_amount,
    gp_percentage: next.gp_percentage - previous.gp_percentage,
  })

  const shouldCreateFinancialSnapshot = (
    quote: any,
    oldStatus: string,
    isRepricing: boolean
  ) => {
    const snapshotStatuses = [
      'Pricing Aprobado',
      'Enviada al Cliente',
      'Ganada',
    ]

    return (
      Boolean(getPersistedFinancialTotals(quote)) &&
      (snapshotStatuses.includes(oldStatus) || isRepricing)
    )
  }

  const buildFinancialSnapshotMetadata = (
    previous: FinancialTotalsSnapshot,
    next: FinancialTotalsSnapshot,
    reason: string | undefined,
    changeType: string
  ) => ({
    reason: reason || null,
    change_type: changeType,
    previous_totals: previous,
    new_totals: next,
    delta: getFinancialDelta(previous, next),
  })

  const executeApprovePricing = async (
    reason?: string,
    operationalSyncMode?: OperationalSyncMode
  ): Promise<boolean> => {
    if (!selectedQuote) return false

    const oldStatus = selectedQuote.status || 'Borrador'
    const activeAgentQuote = agentQuotes.find((quote) => quote.is_selected) || null
    const impact = await getOperationalImpact(activeAgentQuote)
    const shouldAskOperationalAction =
      impact &&
      (impact.hasShippingInstruction || impact.bookings.length > 0) &&
      !operationalSyncMode

    if (shouldAskOperationalAction) {
      setOperationalImpact(impact)
      setPendingOperationalApproval({ reason })
      setOperationalImpactDialogOpen(true)
      return false
    }

    const isRepricing = Boolean(impact?.isRepricing)
    const nextStatus = isRepricing ? 'Ganada' : 'Pricing Aprobado'
    const isReapproval = oldStatus === 'Pricing Aprobado'
    const previousFinancialTotals = shouldCreateFinancialSnapshot(
      selectedQuote,
      oldStatus,
      isRepricing
    )
      ? getPersistedFinancialTotals(selectedQuote)
      : null
    const currentFinancialTotals = await fetchCurrentFinancialTotals(
      selectedQuote.id
    )

    if (!currentFinancialTotals) return false

    const newFinancialTotals = previousFinancialTotals
      ? currentFinancialTotals
      : null
    const getFinancialSnapshotMetadata = (changeType: string) =>
      previousFinancialTotals && newFinancialTotals
        ? buildFinancialSnapshotMetadata(
            previousFinancialTotals,
            newFinancialTotals,
            reason,
            changeType
          )
        : {
            reason: reason || null,
            change_type: changeType,
          }

    if (!isRepricing && !isReapproval && !canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return false
    }

    const { data: updatedQuote, error } = await supabase
      .from('quotations')
      .update({
        status: nextStatus,
        total_cost: currentFinancialTotals.total_cost,
        total_sale: currentFinancialTotals.total_sale,
        profit_amount: currentFinancialTotals.profit_amount,
        gp_percentage: currentFinancialTotals.gp_percentage,
        pricing_approved: true,
        pricing_approved_by: profile?.id,
        pricing_approved_at: new Date().toISOString(),
      })
      .eq('id', selectedQuote.id)
      .select('*')
      .single()

    if (error) {
      toast.error(error.message)
      return false
    }

    if (operationalSyncMode === 'sync' && impact) {
      try {
        await syncOperationalRepricing(impact)
      } catch (syncError: any) {
        toast.error(syncError?.message || 'No se pudo sincronizar la operación')
        return false
      }
    }

    await supabase.from('quotation_status_history').insert([
      {
        quotation_id: selectedQuote.id,
        old_status: oldStatus,
        new_status: nextStatus,
        changed_by: profile?.id,
      },
    ])

    await createActivityLog({
      module: 'pricing',
      action: 'pricing_approved',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Pricing aprobó la cotización ${
        selectedQuote.quotation_number || selectedQuote.id
      }`,
      metadata: getFinancialSnapshotMetadata('pricing_approved'),
    })

    if (isRepricing && operationalSyncMode) {
      const repricingAction =
        operationalSyncMode === 'sync'
          ? 'repricing_approved_with_operational_sync'
          : 'repricing_approved_without_operational_sync'

      await createActivityLog({
        module: 'pricing',
        action: repricingAction,
        entityType: 'quotation',
        entityId: selectedQuote.id,
        description:
          operationalSyncMode === 'sync'
            ? `Repricing aprobado y sincronizado con operación para ${
                selectedQuote.quotation_number || selectedQuote.id
              }`
            : `Repricing aprobado sin actualizar operación para ${
                selectedQuote.quotation_number || selectedQuote.id
              }`,
        metadata: {
          ...getFinancialSnapshotMetadata(repricingAction),
          previous_status: oldStatus,
          new_status: nextStatus,
          has_shipping_instruction: impact?.hasShippingInstruction || false,
          bookings_count: impact?.bookings.length || 0,
          confirmed_bookings_count: impact?.confirmedBookings.length || 0,
        },
      })
    }

    if (selectedQuote.created_by) {
      await createNotification({
        userId: selectedQuote.created_by,
        title: 'Pricing aprobado',
        message: `La cotización ${
          selectedQuote.quotation_number || ''
        } fue aprobada por Pricing.`,
        type: 'success',
      })
    }

    toast.success(
      isRepricing
        ? 'Repricing aprobado. La cotización volvió a Ganada.'
        : 'Pricing aprobado correctamente'
    )

    await fetchPricingItems(selectedQuote.id)
    await fetchQuotations()

    setSelectedQuote((current: any) =>
      current ? { ...current, ...updatedQuote } : updatedQuote
    )

    return true
  }

  const saveClientNotes = async () => {
    if (!selectedQuote?.id) return

    const { data, error } = await supabase
      .from('quotations')
      .update({
        client_notes: clientNotes,
      })
      .eq('id', selectedQuote.id)
      .select('id, client_notes')
      .single()

    if (error) {
      toast.error(error.message || 'No se pudieron guardar las observaciones')
      return
    }

    if (!data) {
      toast.error('No se confirmó el guardado de observaciones')
      return
    }

    setClientNotes(data.client_notes || '')

    setSelectedQuote((prev: any) =>
      prev ? { ...prev, client_notes: data.client_notes } : prev
    )

    setQuotations((prev) =>
      prev.map((quote) =>
        quote.id === selectedQuote.id
          ? { ...quote, client_notes: data.client_notes }
          : quote
      )
    )

    toast.success('Observaciones guardadas')
  }

  const previewQuotationPdf = async () => {
    if (!selectedQuote) {
      toast.error('Selecciona una cotización primero')
      return
    }

    if (pricingItems.length === 0) {
      toast.error('Agrega líneas de pricing antes de previsualizar el PDF')
      return
    }

    try {
      const normalizedCargoLines = cargoLines.map((line) => ({
        quantity: Number(line.quantity || 0),
        package_type: line.package_type || 'Caja',
        length:
          line.length === null || line.length === undefined
            ? null
            : Number(line.length || 0),
        width:
          line.width === null || line.width === undefined
            ? null
            : Number(line.width || 0),
        height:
          line.height === null || line.height === undefined
            ? null
            : Number(line.height || 0),
        dimension_unit: line.dimension_unit || 'in',
        weight_lbs:
          line.weight_lbs === null || line.weight_lbs === undefined
            ? null
            : Number(line.weight_lbs || 0),
        ft3:
          line.ft3 === null || line.ft3 === undefined
            ? calculateCargoLineFt3(line)
            : Number(line.ft3 || 0),
        cbm:
          line.cbm === null || line.cbm === undefined
            ? calculateCargoLineCbm(line)
            : Number(line.cbm || 0),
      }))

      const blob = await pdf(
        <QuotationPDF
          quotation={{
            ...selectedQuote,
            client_notes: clientNotes || selectedQuote.client_notes,
          }}
          selectedAgent={selectedAgentQuote || null}
          pricingItems={pricingItems}
          quotationContainers={quotationContainers}
          cargoLines={normalizedCargoLines}
          company={companyBranding}
        />
      ).toBlob()

      window.open(URL.createObjectURL(blob), '_blank')
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo generar la previsualización del PDF'
      )
    }
  }

  const approvePricing = async () => {
    if (!selectedQuote) return

    if (!ensureQuoteIsEditable()) return

    const oldStatus = selectedQuote.status || 'Borrador'
    const nextStatus = 'Pricing Aprobado'
    const isReapproval = oldStatus === 'Pricing Aprobado'

    if (!isReapproval && !canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    const selectedAgentQuote = agentQuotes.find((quote) => quote.is_selected)

    if (selectedAgentQuote?.etd) {
      const [y, m, d] = selectedAgentQuote.etd.split('T')[0].split('-').map(Number)
      const etdDate = new Date(y, m - 1, d)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (etdDate < today) {
        toast.warning(
          `ETD de la tarifa (${formatDisplayDate(selectedAgentQuote.etd)}) ya venció. Verifica que la tarifa siga vigente antes de aprobar.`
        )
      }
    }

    const validationAgentQuote = selectedAgentQuote
      ? {
          ...selectedAgentQuote,
          agent_name: getAgentQuoteProviderName(selectedAgentQuote),
          final_cost: getAgentQuoteFinalCost(selectedAgentQuote),
          suggested_sale:
            selectedAgentQuote.suggested_sale ||
            selectedAgentQuote.sale_amount ||
            getAgentQuoteFinalCost(selectedAgentQuote),
        }
      : null

    const validation = validatePricingCompleteness({
      selectedQuote,
      selectedAgentQuote: validationAgentQuote,
      pricingItems,
    })

    if (!validation.isValid) {
      setPricingValidationErrors(validation.errors)
      setPricingValidationDialogOpen(true)
      return
    }

    if (validation.requiresReason) {
      setProfitabilityWarnings(validation.warnings)
      setProfitabilityReason('')
      profitabilityReasonRef.current = ''
      setPendingApprovePricing(() => async () => {
        await executeApprovePricing(profitabilityReasonRef.current)
      })
      setProfitabilityDialogOpen(true)
      return
    }

    await executeApprovePricing()
  }

  const markAsSentToClient = async () => {
    if (!selectedQuote) return
    if (!ensureQuoteIsEditable()) return

    const oldStatus = selectedQuote.status || 'Borrador'
    const nextStatus = 'Enviada al Cliente'

    if (!canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    const { error } = await supabase
      .from('quotations')
      .update({ status: nextStatus })
      .eq('id', selectedQuote.id)

    if (error) {
      toast.error(error.message)
      return
    }

    await supabase.from('quotation_status_history').insert([
      {
        quotation_id: selectedQuote.id,
        old_status: oldStatus,
        new_status: nextStatus,
        changed_by: profile?.id,
      },
    ])

    toast.success('Cotizacion marcada como Enviada al Cliente')

    await fetchQuotations()

    await createActivityLog({
      module: 'pricing',
      action: 'sent_to_client',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Cotización ${
        selectedQuote.quotation_number || selectedQuote.id
      } marcada como enviada al cliente`,
    })

    if (selectedQuote.created_by) {
      await createNotification({
        userId: selectedQuote.created_by,
        title: 'Cotización enviada al cliente',
        message: `La cotización ${
          selectedQuote.quotation_number || ''
        } fue marcada como enviada al cliente.`,
        type: 'info',
      })
    }

    setSelectedQuote({
      ...selectedQuote,
      status: nextStatus,
    })
  }

  const totalCost = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
    0
  )

  const totalSale = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
    0
  )

  const totalSaleWithTax = pricingItems.reduce(
    (sum, item) => sum + Number(item.total_amount || 0),
    0
  )

  const totalProfit = totalSale - totalCost
  const profit = totalProfit

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const quantity = Number(pricingForm.quantity || 1)

  const subtotal =
    Number(pricingForm.sale_amount || 0) * quantity

  const taxAmount =
    pricingForm.taxable
      ? calculateTaxAmount(true, subtotal, defaultTaxRate)
      : 0

  const totalAmount = subtotal + taxAmount

  const totalCargoLbs = cargoLines.reduce(
    (sum, line) =>
      sum + Number(line.weight_lbs || 0) * Number(line.quantity || 0),
    0
  )

  const totalCargoCbm = cargoLines.reduce(
    (sum, line) => sum + calculateCargoLineCbm(line),
    0
  )

  const totalCargoFt3 = cargoLines.reduce(
    (sum, line) => sum + calculateCargoLineFt3(line),
    0
  )

  const totalCargoKg = totalCargoLbs / 2.20462

  const gpPercentage = calculateGrossProfitPercent({
    saleTotal: totalSale,
    costTotal: totalCost,
  })

  const isMiamiFlow =
    selectedQuote?.service_product === 'miami_lcl' ||
    selectedQuote?.service_product === 'miami_air'

  const targetRate = Number(selectedQuote?.target_rate || 0)

  const targetRateDifference =
    targetRate > 0 ? totalSale - targetRate : 0

  const targetRateDifferencePercentage =
    targetRate > 0 ? (targetRateDifference / targetRate) * 100 : 0

const profitabilityStatus =
  gpPercentage >= 15
    ? 'Rentabilidad saludable'
    : gpPercentage >= 8
    ? 'Rentabilidad baja'
    : 'Rentabilidad crítica'

const profitabilityColor =
  gpPercentage >= 15
    ? 'bg-green-600 text-white'
    : gpPercentage >= 8
    ? 'bg-orange-500 text-white'
    : 'bg-red-600 text-white'

  const totalContainersQty =
    quotationContainers.length > 0
      ? quotationContainers.reduce(
          (sum, container) => sum + Number(container.quantity || 0),
          0
        )
      : Number(agentForm.containers_qty || 1)

  const totalOceanFreight =
    isAirConsolidatedQuote()
      ? Number(agentForm.ocean_freight || 0) * getChargeableKg()
      : containerRateLines.length > 0
      ? containerRateLines.reduce(
          (sum, line) =>
            sum +
            Number(line.quantity || 0) *
              Number(line.ocean_freight || 0),
          0
        )
      : Number(agentForm.ocean_freight || 0)

  const agentTotalCost =
    totalOceanFreight +
    Number(agentForm.exw_cost || 0) +
    Number(agentForm.mbl_fee || 0) +
    Number(agentForm.profit_per_container || 0) * totalContainersQty

  const suggestedSales = [8, 10, 15, 20, 25].map((margin) => ({
    margin,
    sale: agentTotalCost * (1 + margin / 100),
  }))

  const getAgentQuoteContainersQty = (quote: AgentQuote) =>
    quotationContainers.length > 0
      ? quotationContainers.reduce(
          (sum, container) => sum + Number(container.quantity || 0),
          0
        )
      : Number(quote.containers_qty || 1)

  const getAgentQuoteBaseCost = (quote: AgentQuote) =>
    Number(quote.ocean_freight || quote.base_cost || quote.costo || 0)

  const getAgentQuoteFinalCost = (quote: AgentQuote) => {
    const storedCost = Number(
      quote.final_cost || quote.sari_cost || quote.total_cost || 0
    )

    if (storedCost > 0) return storedCost

    const containersQty = getAgentQuoteContainersQty(quote)

    return (
      Number(quote.ocean_freight || 0) +
      Number(quote.exw_cost || 0) +
      Number(quote.mbl_fee || 0) +
      Number(quote.profit_per_container || 0) * containersQty
    )
  }

  const getAgentQuoteProviderName = (quote?: AgentQuote | null) =>
    quote?.agent?.name ||
    quote?.provider_name ||
    quote?.agente_nombre ||
    quote?.agent_name ||
    quote?.agent ||
    'N/A'

  const getValidTransitDays = (quote?: AgentQuote | null) => {
    const rawTransit = firstFilledValue(quote?.transit_time, quote?.transit)

    if (rawTransit === null || rawTransit === undefined) return null

    const normalizedTransit = normalizeText(String(rawTransit).trim())
    if (!normalizedTransit || normalizedTransit === 'n/a') return null

    const transitDays = Number(normalizedTransit)
    return Number.isFinite(transitDays) && transitDays > 0 ? transitDays : null
  }

  const validAgentQuotes = agentQuotes.filter((quote) => {
    const finalCost = getAgentQuoteFinalCost(quote)
    return finalCost > 0
  })

  const bestCostQuote = validAgentQuotes.length
    ? validAgentQuotes.reduce((best, current) => {
        const bestCost = getAgentQuoteFinalCost(best)
        const currentCost = getAgentQuoteFinalCost(current)

        return currentCost < bestCost ? current : best
      })
    : null

  const fastestQuote = agentQuotes
    .filter((quote) => getValidTransitDays(quote) !== null)
    .sort(
      (a, b) =>
        Number(getValidTransitDays(a)) -
        Number(getValidTransitDays(b))
    )[0]

  const selectedAgentQuote = agentQuotes.find((q) => q.is_selected)
  const activeQuote = selectedAgentQuote
  const agentQuotePendingDelete = deleteAgentQuoteId
    ? agentQuotes.find((quote) => quote.id === deleteAgentQuoteId)
    : null

  const isBestCostQuote = (quote: AgentQuote) =>
    bestCostQuote?.id === quote.id

  const isFastestQuote = (quote: AgentQuote) =>
    fastestQuote?.id === quote.id

  const isSelectedQuote = (quote: AgentQuote) =>
    selectedAgentQuote?.id === quote.id || quote.is_selected

  const getServiceProductLabel = (serviceProduct?: string | null) => {
    return (
      serviceProductOptions.find((item) => item.value === serviceProduct)?.label ||
      serviceProduct ||
      'N/A'
    )
  }

  const shouldShowCarrierInput = (quote?: any) => {
    if (!quote) return false

    const quoteType = normalizeText(quote.quote_type)
    if (quote.service_product === 'miami_lcl' || quote.service_product === 'miami_air') {
      return false
    }

    if (quoteType === 'fcl') return true

    return false
  }

  const showCarrierInput = shouldShowCarrierInput(selectedQuote)
  const isFclQuote = normalizeText(selectedQuote?.quote_type) === 'fcl'

  const getCarrierFilterType = () => {
    if (selectedQuote?.tipo_transporte === 'Marítima') return 'ocean'
    if (selectedQuote?.tipo_transporte === 'Aéreo') return 'air'
    if (selectedQuote?.tipo_transporte === 'Terrestre') return 'ground'
    return undefined
  }

  const getAgentQuoteCardClass = (quote: AgentQuote) => {
    if (isSelectedQuote(quote)) {
      return 'border-blue-400 bg-blue-50 ring-2 ring-blue-200'
    }

    if (isBestCostQuote(quote)) {
      return 'border-emerald-300 bg-emerald-50'
    }

    if (isFastestQuote(quote)) {
      return 'border-amber-300 bg-amber-50'
    }

    return 'border-slate-200 bg-white'
  }

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case 'Ganada':
        return 'bg-green-600 text-white'

      case 'Perdida':
        return 'bg-red-600 text-white'

      case 'Propuesta':
        return 'bg-blue-600 text-white'

      case 'Seguimiento':
        return 'bg-orange-500 text-white'

      case 'Pendiente de Fijar Precios':
        return 'bg-gray-700 text-white'

      case 'Enviada al Cliente':
        return 'bg-indigo-600 text-white'

      case 'En Negociación':
        return 'bg-yellow-500 text-black'

      case 'Tarifa Alta':
        return 'bg-rose-500 text-white'

      case 'Enviada tarde':
        return 'bg-purple-600 text-white'

      case 'No tenemos agente':
        return 'bg-zinc-800 text-white'

      default:
        return 'bg-gray-200 text-gray-700'
    }
  }

  const requiresChangeReason = [
    'Enviada al Cliente',
    'Ganada',
  ].includes(selectedQuote?.status || '')

  const isLockedQuote =
    selectedQuote?.status === 'Enviada al Cliente' ||
    selectedQuote?.status === 'Ganada' ||
    selectedQuote?.status === 'Perdida'
  const isPricingActionDisabled = !canManagePricing || isLockedQuote
  const isAgentQuoteFormActionDisabled = !canManagePricing

  const optionalClientRates = clientRates.filter((rate) => {
    return (
      Boolean(optionalClientRateConfig[rate.rate_code]) &&
      Number(rate.amount || 0) > 0 &&
      rate.is_active !== false
    )
  })

  const lockedQuoteMessage =
    'Esta cotización ya fue enviada, ganada o perdida. La edición está bloqueada para proteger el historial comercial.'

  const tariffStatusRequiredMessage =
    'Cotización debe estar en "Pendiente de Fijar Precios" para modificar/agregar tarifas'

  const unauthorizedPricingMessage =
    'No tienes permiso para gestionar pricing.'

  const ensureQuoteIsEditable = (options?: { lockedMessage?: string }) => {
    if (!canManagePricing) {
      toast.error(unauthorizedPricingMessage)
      return false
    }

    if (!isLockedQuote) return true

    toast.error(options?.lockedMessage || lockedQuoteMessage)
    return false
  }

  const ensureAgentQuoteCanBeModified = () => {
    if (!canManagePricing) {
      toast.error(unauthorizedPricingMessage)
      return false
    }

    if (selectedQuote?.status === 'Pendiente de Fijar Precios') return true

    toast.error(tariffStatusRequiredMessage)
    return false
  }

  const isInsurancePricingItem = (item: any) => {
    const normalizedType = normalizeText(item.item_type)
    const normalizedDescription = normalizeText(item.description)

    return (
      normalizedType === 'seguro' ||
      normalizedDescription.includes('seguro de carga')
    )
  }

  const clientRequiresCargoInsurance =
    selectedQuote?.clientes?.asegura_carga === true ||
    selectedQuote?.requires_insurance === true

  const showCargoInsuranceButton = Boolean(
    selectedQuote && clientRequiresCargoInsurance
  )

  const applyCargoInsurance = async () => {
    if (!selectedQuote) {
      toast.error('Selecciona una cotizacion primero')
      return
    }

    if (!clientRequiresCargoInsurance) {
      toast.error('La cotizacion no requiere seguro de carga')
      return
    }

    if (!ensureQuoteIsEditable()) return

    const fob = Number(selectedQuote.commercial_value || 0)
    if (fob <= 0) {
      toast.error('Ingresa un valor FOB mayor a cero para calcular el seguro')
      return
    }

    const saleRatePercent = Number(
      selectedQuote.clientes?.seguro_porcentaje || 0
    )
    if (saleRatePercent <= 0) {
      toast.error('El cliente no tiene porcentaje de seguro configurado')
      return
    }

    const serviceItemsWithoutInsurance = pricingItems.filter(
      (item) => !isInsurancePricingItem(item)
    )
    const serviceSaleWithoutInsurance = serviceItemsWithoutInsurance.reduce(
      (sum, item) =>
        sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
      0
    )
    const serviceCostWithoutInsurance = serviceItemsWithoutInsurance.reduce(
      (sum, item) =>
        sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
      0
    )

    if (serviceSaleWithoutInsurance <= 0) {
      toast.error('No se detectaron cargos base para calcular seguro full cover.')
      return
    }

    const insuranceMarkupMultiplier = 1.1
    const costRatePercent = 0.27
    const insuredBaseSale = fob + serviceSaleWithoutInsurance
    const insuredBaseCost = fob + serviceCostWithoutInsurance
    const insuranceSale =
      insuredBaseSale * insuranceMarkupMultiplier * (saleRatePercent / 100)
    const insuranceCost =
      insuredBaseCost * insuranceMarkupMultiplier * (costRatePercent / 100)
    const insuranceTaxAmount = calculateTaxAmount(
      insuranceTaxable,
      insuranceSale,
      defaultTaxRate
    )
    const insuranceTotalAmount = insuranceSale + insuranceTaxAmount
    const notes = [
      `Base full cover venta: FOB USD ${formatCurrency(
        fob
      )} + Servicios USD ${formatCurrency(
        serviceSaleWithoutInsurance
      )} = USD ${formatCurrency(insuredBaseSale)}`,
      `Seguro venta: USD ${formatCurrency(
        insuredBaseSale
      )} × 1.10 × ${saleRatePercent}% = USD ${formatCurrency(insuranceSale)}`,
      `Base full cover costo: FOB USD ${formatCurrency(
        fob
      )} + Servicios costo USD ${formatCurrency(
        serviceCostWithoutInsurance
      )} = USD ${formatCurrency(insuredBaseCost)}`,
      `Seguro costo: USD ${formatCurrency(
        insuredBaseCost
      )} × 1.10 × 0.27% = USD ${formatCurrency(insuranceCost)}`,
      `ISV ${defaultTaxRate}% aplicado: ${insuranceTaxable ? 'Sí' : 'No'}`,
    ].join('\n')
    const existingInsuranceItem = pricingItems.find(isInsurancePricingItem)
    const pricingItemPayload = {
      quotation_id: selectedQuote.id,
      item_type: 'Seguro',
      description: 'Seguro de Carga',
      supplier: 'JAH Insurance',
      quantity: 1,
      cost_amount: insuranceCost,
      sale_amount: insuranceSale,
      currency: 'USD',
      taxable: insuranceTaxable,
      tax_rate: insuranceTaxable ? 15 : 0,
      tax_amount: insuranceTaxAmount,
      total_amount: insuranceTotalAmount,
      notes,
    }

    const { error } = existingInsuranceItem
      ? await supabase
          .from('pricing_items')
          .update(pricingItemPayload)
          .eq('id', existingInsuranceItem.id)
      : await supabase.from('pricing_items').insert([
          {
            ...pricingItemPayload,
            created_by: profile?.id,
          },
        ])

    if (error) {
      toast.error(error.message || 'No se pudo aplicar el seguro de carga')
      return
    }

    toast.success(
      existingInsuranceItem
        ? 'Seguro de carga actualizado'
        : 'Seguro de carga agregado'
    )
    await fetchPricingItems(selectedQuote.id)
  }

  const addOptionalClientRate = async (rate: ClientRate) => {
    if (!selectedQuote) {
      toast.error('Selecciona una cotizacion primero')
      return
    }

    if (!ensureQuoteIsEditable()) return

    if (pricingItems.some((item) => item.description === rate.rate_label)) {
      toast.error('Este cargo ya fue agregado')
      return
    }

    const config =
      optionalClientRateConfig[rate.rate_code]

    if (!config) {
      toast.error('Este cargo no esta configurado como opcional')
      return
    }

    const saleAmount = Number(rate.amount || 0)
    const taxAmount = calculateTaxAmount(config.taxable, saleAmount, defaultTaxRate)
    const totalAmount = saleAmount + taxAmount

    const { error } = await supabase.from('pricing_items').insert([
      {
        quotation_id: selectedQuote.id,
        item_type: config.itemType,
        description: rate.rate_label,
        cost_amount: 0,
        sale_amount: saleAmount,
        quantity: 1,
        taxable: config.taxable,
        tax_rate: config.taxable ? defaultTaxRate : 0,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        currency: rate.currency || 'USD',
        supplier: defaultSupplierName,
        notes:
          rate.notes ||
          'Cargo opcional agregado desde tarifas del cliente',
        created_by: profile?.id,
      },
    ])

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Cargo opcional agregado')
    await fetchPricingItems(selectedQuote.id)
  }

  const requestChangeReason = async (
    changeType: string,
    options?: {
      force?: boolean
      title?: string
      description?: string
    }
  ) => {
    if (!selectedQuote) return null

    if (!requiresChangeReason && !options?.force) return ''

    return new Promise<string | null>((resolve) => {
      postApprovalResolveRef.current = resolve
      postApprovalReasonRef.current = ''
      setPostApprovalReason('')
      setPostApprovalDialogCopy({
        title: options?.title || 'Cotizacion ya enviada al cliente',
        description:
          options?.description ||
          'Esta cotizacion ya fue aprobada o enviada al cliente. Debes registrar el motivo del cambio para mantener trazabilidad.',
      })
      setPendingPostApprovalAction(() => async () => {
        const reason = postApprovalReasonRef.current.trim()

        const { error } = await supabase.from('quotation_change_logs').insert([
          {
            quotation_id: selectedQuote.id,
            change_type: changeType,
            reason,
            changed_by: profile?.id,
          },
        ])

        if (error) {
          throw error
        }

        await createActivityLog({
          module: 'pricing',
          action: 'post_approval_change',
          entityType: 'quotation',
          entityId: selectedQuote.id,
          description: `Cambio posterior a aprobacion/envio: ${changeType}`,
          metadata: {
            reason,
            changeType,
          },
        })
      })
      setPostApprovalDialogOpen(true)
    })

  }

  const approveOperationalImpact = async (mode: OperationalSyncMode) => {
    if (!pendingOperationalApproval) return

    setProcessingOperationalApproval(true)

    try {
      const success = await executeApprovePricing(pendingOperationalApproval.reason, mode)

      if (success) {
        setOperationalImpactDialogOpen(false)
        setOperationalImpact(null)
        setPendingOperationalApproval(null)
      }
    } finally {
      setProcessingOperationalApproval(false)
    }
  }

  const resetPostApprovalDialog = () => {
    setPostApprovalDialogOpen(false)
    setPostApprovalReason('')
    postApprovalReasonRef.current = ''
    setPendingPostApprovalAction(null)
  }

  const cancelPostApprovalChange = () => {
    postApprovalResolveRef.current?.(null)
    postApprovalResolveRef.current = null
    resetPostApprovalDialog()
  }

  const confirmPostApprovalChange = async () => {
    const reason = postApprovalReason.trim()

    if (!reason) {
      toast.error('Debes ingresar un motivo del cambio')
      return
    }

    if (!pendingPostApprovalAction) return

    postApprovalReasonRef.current = reason
    setSavingPostApproval(true)

    try {
      await pendingPostApprovalAction()

      toast.success('Cambio registrado correctamente')
      postApprovalResolveRef.current?.(reason)
      postApprovalResolveRef.current = null
      resetPostApprovalDialog()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo registrar el cambio'
      )
      postApprovalResolveRef.current?.(null)
      postApprovalResolveRef.current = null
    } finally {
      setSavingPostApproval(false)
    }
  }

  return (
    <>
      <div className="space-y-6" data-miami-flow={isMiamiFlow}>
        <div>
          <h1 className="text-4xl font-bold">
            Comparativo de Tarifas / Pricing
          </h1>

          <p className="text-gray-500 mt-2">
            Agrega tarifas de agentes, construye venta final y valida rentabilidad.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Seleccionar cotización</CardTitle>
            </CardHeader>

            <CardContent>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <CotizacionCombobox
                  quotations={quotations}
                  value={selectedQuote?.id || ''}
                  onChange={(id) => {
                    const quote = quotations.find((q) => q.id === id)
                    if (quote) handleSelectQuote(quote)
                  }}
                  placeholder="Buscar por cotizacion, cliente, origen o destino..."
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />

                {selectedQuote?.id && (
                  <button
                    type="button"
                    onClick={() => router.push(`/quotations/${selectedQuote.id}`)}
                    className={secondaryButtonClass}
                  >
                    Ver detalle de cotización
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

            {!selectedQuote ? (
              <Card>
                <CardContent className="p-8 text-gray-500">
                  Selecciona una cotización para trabajar pricing.
                </CardContent>
              </Card>
            ) : (
              <>
                {!canManagePricing && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    Puedes ver costos y cotizaciones, pero la gestión de pricing está limitada a Admin y Pricing.
                  </div>
                )}

                {isLockedQuote && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
                    Esta cotización ya fue enviada, ganada o perdida. La edición está bloqueada para proteger el historial comercial.
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedQuote.quotation_number} - {selectedQuote.origen} a {selectedQuote.destino}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-6">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Estado</p>
                      <Badge>{selectedQuote.status}</Badge>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Target</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        USD {selectedQuote.target_rate || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Tipo de cotización</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.quote_type || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Transporte</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.tipo_transporte || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Producto / Servicio</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {getServiceProductLabel(selectedQuote.service_product)}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Naviera preferida</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.preferred_carrier || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Incoterm
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.incoterm || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Valor FOB
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {Number(selectedQuote.commercial_value || 0) > 0
                          ? `USD ${formatCurrency(
                              Number(selectedQuote.commercial_value || 0)
                            )}`
                          : 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Origen
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.origen || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Dirección origen EXW
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.pickup_address || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Puerto origen
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.puerto_origen || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Destino
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.destino || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Puerto destino
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.puerto_destino || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Dirección de entrega
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.delivery_address ||
                          selectedQuote.direccion_entrega ||
                          'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Commodity
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.mercancia || selectedQuote.commodity || 'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Observaciones internas
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.pricing_notes ||
                          selectedQuote.notes ||
                          selectedQuote.observaciones ||
                          'N/A'}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Contenedor</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {quotationContainers.length > 0
                          ? quotationContainers
                              .map(
                                (container) =>
                                  `${container.quantity} x ${container.container_type_name}`
                              )
                              .join(', ')
                          : selectedQuote.container_type || 'N/A'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">
                        Total unidades: {totalContainersQty}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {!isMiamiFlow && (
                  <>
                    <Card>
                  <CardHeader>
                    <CardTitle>Construcción de Tarifa</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
                      <div className="space-y-4">
                        <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Datos comerciales
                          </h3>
                        </div>

                        <div>
                          <label className={labelClass}>
                            Agente
                          </label>

                          <AgenteCombobox
                            agents={agents}
                            value={agentForm.agent_id}
                            onChange={(agentId) => {
                              const selectedAgent = agents.find(
                                (agent) => agent.id === agentId
                              )

                              setAgentForm({
                                ...agentForm,
                                agent_id: agentId,
                                agente_nombre: selectedAgent?.name || '',
                                profit_per_container: String(
                                  selectedAgent?.profit_per_container || 0
                                ),
                                mbl_fee: String(selectedAgent?.mbl_fee || 0),
                                moneda: selectedAgent?.currency || 'USD',
                              })
                              fetchAgentRouteRates(agentId)
                            }}
                            placeholder="Seleccionar agente/proveedor"
                            className={cn(fieldClass, 'mt-1 w-full')}
                          />

                          {/* Sugerencia de tarifas guardadas */}
                          {agentRouteRates.length > 0 && (() => {
                            const qt = normalizeText(selectedQuote?.quote_type)
                            const matchingRates = agentRouteRates.filter((r) => {
                              const st = normalizeText(r.service_type)
                              if (qt === 'fcl') return st.startsWith('fcl')
                              if (qt === 'lcl') return st === 'lcl'
                              if (qt === 'aereo' || qt === 'consolidado') return st.includes('aereo')
                              if (qt === 'terrestre') return st.includes('terrestre')
                              if (qt === 'courier') return st === 'courier'
                              return true
                            })
                            const toShow = matchingRates.length > 0 ? matchingRates : agentRouteRates.slice(0, 5)
                            return (
                              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/70 p-2 dark:border-blue-800/40 dark:bg-blue-950/20">
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                  Tarifas guardadas del agente
                                </p>
                                <div className="space-y-1">
                                  {toShow.map((r: any) => {
                                    const expired = r.valid_until && r.valid_until < new Date().toISOString().slice(0, 10)
                                    return (
                                      <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => applyAgentRouteRate(r)}
                                        className={cn(
                                          'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-blue-100 dark:hover:bg-blue-900/40',
                                          expired ? 'opacity-50' : ''
                                        )}
                                      >
                                        <span className="font-medium text-slate-700 dark:text-slate-200">
                                          {r.origin} → {r.destination}
                                          {r.carrier ? ` · ${r.carrier}` : ''}
                                          <span className="ml-1.5 text-slate-400">({r.service_type})</span>
                                        </span>
                                        <span className="ml-3 shrink-0 font-semibold text-blue-700 dark:text-blue-300">
                                          {r.currency} {Number(r.base_rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                          {expired && <span className="ml-1 text-rose-500">⚠</span>}
                                        </span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })()}
                        </div>

                        <div>
                          <label className={labelClass}>
                            Moneda
                          </label>

                          <select
                            name="moneda"
                            value={agentForm.moneda}
                            onChange={handleAgentChange}
                            className={cn(fieldClass, 'mt-1 w-full')}
                          >
                            <option value="USD">USD</option>
                            <option value="HNL">HNL</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
                        <div className="space-y-3">
                          <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                              Costos
                            </h3>
                          </div>

                          {quotationContainers.length > 0 && (
                            <div className="space-y-3">
                              <p className={labelClass}>
                                Costos del proveedor por contenedor
                              </p>

                              {quotationContainers.map((container) => {
                                const currentLine = containerRateLines.find(
                                  (line) => line.quotation_container_id === container.id
                                )
                                const containerQuantity = Number(container.quantity || 0)
                                const unitCost = Number(currentLine?.ocean_freight || 0)
                                const totalContainerCost =
                                  containerQuantity * unitCost

                                return (
                                  <div
                                    key={container.id}
                                    className={cn(
                                      mutedCardClass,
                                      'space-y-3 p-3'
                                    )}
                                  >
                                    <div>
                                      <p className={valueClass}>
                                        {container.container_type_name}
                                      </p>
                                      <p className="text-sm text-slate-500 dark:text-slate-400">
                                        Cantidad: {container.quantity}
                                      </p>
                                    </div>

                                    <div className="grid gap-2">
                                      <label className={labelClass}>
                                        Costo por contenedor
                                      </label>

                                      <input
                                        type="number"
                                        placeholder="Costo unitario proveedor"
                                        value={currentLine?.ocean_freight || ''}
                                        onChange={(e) => {
                                          const value = e.target.value

                                          setContainerRateLines((prev) => {
                                            const exists = prev.some(
                                              (line) =>
                                                line.quotation_container_id === container.id
                                            )

                                            if (exists) {
                                              return prev.map((line) =>
                                                line.quotation_container_id === container.id
                                                  ? { ...line, ocean_freight: value }
                                                  : line
                                              )
                                            }

                                            return [
                                              ...prev,
                                              {
                                                quotation_container_id: container.id,
                                                container_type_name:
                                                  container.container_type_name,
                                                quantity: container.quantity,
                                                ocean_freight: value,
                                              },
                                            ]
                                          })
                                        }}
                                        className={cn(fieldClass, 'w-full sm:max-w-[220px]')}
                                      />

                                      <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {containerQuantity} × USD{' '}
                                        {formatCurrency(unitCost)} ={' '}
                                        <span className={valueClass}>
                                          USD {formatCurrency(totalContainerCost)}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {quotationContainers.length === 0 && (
                            <div>
                              <label className={labelClass}>
                                {isAirConsolidatedQuote()
                                  ? 'Tarifa por KG proveedor'
                                  : 'Costo proveedor'}
                              </label>

                              <input
                                name="ocean_freight"
                                placeholder={
                                  isAirConsolidatedQuote()
                                    ? 'Ej. 3.50'
                                    : getFreightDescription()
                                }
                                value={agentForm.ocean_freight}
                                onChange={handleAgentChange}
                                className={cn(fieldClass, 'mt-1 w-full')}
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="border-b border-slate-200 pb-2 dark:border-slate-800">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                              Tránsito
                            </h3>
                          </div>

                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
                          {showCarrierInput && (
                            <div>
                              <label className={labelClass}>
                                Carrier
                              </label>

                              <CarrierCombobox
                                value={agentForm.carrier}
                                onChange={(code) =>
                                  setAgentForm({ ...agentForm, carrier: code })
                                }
                                filterType={getCarrierFilterType()}
                                className="mt-1"
                                disabled={isAgentQuoteFormActionDisabled}
                              />
                            </div>
                          )}

                          <div>
                            <label className={labelClass}>
                              Tránsito
                            </label>

                            <input
                              name="transit_time"
                              placeholder="Tránsito"
                              value={agentForm.transit_time}
                              onChange={handleAgentChange}
                              className={cn(fieldClass, 'mt-1 w-full')}
                            />
                          </div>

                          <div>
                            <label className={labelClass}>
                              Transbordo
                            </label>

                            {isAirQuote() ? (
                              <input
                                className={cn(fieldClass, 'mt-1 w-full')}
                                placeholder="BCN-LGG-ATL-MIA-SAP"
                                value={agentForm.transshipment}
                                onChange={(e) =>
                                  setAgentForm({
                                    ...agentForm,
                                    transshipment: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              <select
                                className={cn(fieldClass, 'mt-1 w-full')}
                                value={agentForm.transshipment}
                                onChange={(e) =>
                                  setAgentForm({ ...agentForm, transshipment: e.target.value })
                                }
                              >
                                <option value="">Transbordo</option>
                                <option value="Directo">Directo</option>
                                <option value="Sí">Sí</option>
                                <option value="Via Panamá">Via Panamá</option>
                                <option value="Via Cartagena">Via Cartagena</option>
                                <option value="Via Kingston">Via Kingston</option>
                                <option value="Via Miami">Via Miami</option>
                              </select>
                            )}
                          </div>

                          <div>
                            <label className={labelClass}>
                              Días libres
                            </label>

                            <input
                              className={cn(fieldClass, 'mt-1 w-full')}
                              placeholder="Días libres destino"
                              value={agentForm.free_days_destination}
                              onChange={(e) =>
                                setAgentForm({
                                  ...agentForm,
                                  free_days_destination: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div>
                            <label className={labelClass}>
                              Vigencia tarifa
                            </label>
                            <input
                              type="date"
                              name="valid_until"
                              value={agentForm.valid_until}
                              onChange={handleAgentChange}
                              className={cn(fieldClass, 'mt-1 w-full')}
                            />
                          </div>

                          <div>
                            <label className={labelClass}>
                              ETD
                            </label>

                            <input
                              type="date"
                              name="etd"
                              value={agentForm.etd}
                              onChange={handleAgentChange}
                              className={cn(fieldClass, 'mt-1 w-full')}
                            />
                          </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                      {['EXW', 'FCA'].includes(selectedQuote?.incoterm || '') && (
                        <div>
                          <label className={labelClass}>
                            Costo EXW / Recolección en origen
                          </label>

                          <input
                            type="number"
                            name="exw_cost"
                            value={agentForm.exw_cost}
                            onChange={handleAgentChange}
                            className={cn(fieldClass, 'mt-1 w-full')}
                            placeholder="0.00"
                          />
                        </div>
                      )}

                      <div className="col-span-full w-full max-w-4xl">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900/60">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Costo base Sari
                              </p>
                              <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
                                {agentForm.moneda || 'USD'}{' '}
                                {agentTotalCost.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                            </div>

                            <button
                              onClick={saveAgentQuote}
                              disabled={isAgentQuoteFormActionDisabled}
                              className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {editingAgentQuoteId
                                ? 'Actualizar Tarifa'
                                : 'Guardar Tarifa'}
                            </button>
                          </div>

                          <div className="my-4 border-t border-slate-100 dark:border-slate-800" />

                          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                              Cómo se calcula
                            </p>

                            {isAirConsolidatedQuote() && (
                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Peso real
                                  </p>
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {formatCurrency(getAirConsolidatedWeights().actualWeightKg)} KG
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Peso volumétrico
                                  </p>
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {formatCurrency(totalCargoCbm)} CBM ×{' '}
                                    {AIR_VOLUMETRIC_KG_PER_CBM.toFixed(4)} ={' '}
                                    {formatCurrency(getAirConsolidatedWeights().volumetricWeightKg)} KG
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    Equivale a (largo × ancho × alto en cm) ÷{' '}
                                    {AIR_VOLUMETRIC_DIVISOR_CM3}.
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Peso cobrable
                                  </p>
                                  <p className="font-semibold text-blue-700 dark:text-blue-300">
                                    MAX(real, volumétrico) ={' '}
                                    {formatCurrency(getChargeableKg())} KG
                                  </p>
                                </div>
                              </div>
                            )}

                            <div className="mt-3 space-y-2 border-t border-blue-100 pt-3 text-sm dark:border-blue-900/40">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-600 dark:text-slate-300">
                                  {isAirConsolidatedQuote()
                                    ? `${formatCurrency(getChargeableKg())} KG × ${agentForm.moneda || 'USD'} ${formatCurrency(Number(agentForm.ocean_freight || 0))}/KG`
                                    : 'Flete proveedor'}
                                </span>
                                <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                                  {agentForm.moneda || 'USD'} {formatCurrency(totalOceanFreight)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-600 dark:text-slate-300">EXW / Recolección</span>
                                <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                                  {agentForm.moneda || 'USD'} {formatCurrency(Number(agentForm.exw_cost || 0))}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-600 dark:text-slate-300">MBL / Documentación del agente</span>
                                <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                                  {agentForm.moneda || 'USD'} {formatCurrency(Number(agentForm.mbl_fee || 0))}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-600 dark:text-slate-300">
                                  Profit agente ({formatCurrency(Number(agentForm.profit_per_container || 0))} × {totalContainersQty})
                                </span>
                                <span className="font-medium tabular-nums text-slate-900 dark:text-white">
                                  {agentForm.moneda || 'USD'}{' '}
                                  {formatCurrency(Number(agentForm.profit_per_container || 0) * totalContainersQty)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 border-t border-blue-200 pt-2 font-bold dark:border-blue-800/60">
                                <span className="text-slate-900 dark:text-white">Costo Base Sari</span>
                                <span className="tabular-nums text-blue-800 dark:text-blue-200">
                                  {agentForm.moneda || 'USD'} {formatCurrency(agentTotalCost)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div>
                            <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Venta sugerida con margen
                            </p>
                            <div className="grid gap-2 sm:grid-cols-5">
                              {suggestedSales.map((item) => (
                                <div
                                  key={item.margin}
                                  className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-emerald-200 hover:bg-emerald-50 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-emerald-900/40 dark:hover:bg-emerald-950/20"
                                >
                                  <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                                    +{item.margin}%
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                    {agentForm.moneda || 'USD'}{' '}
                                    {item.sale.toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div
                  ref={agentQuotesSectionRef}
                  className={cn(cardClass, 'p-6')}
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Tarifas de Agentes
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Compara opciones por costo, transito, carrier y rentabilidad.
                      </p>
                    </div>

                    {isFclQuote && (
                      <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-950">
                        <button
                          type="button"
                          onClick={() => setAgentQuotesViewMode('cards')}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                            agentQuotesViewMode === 'cards'
                              ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                          )}
                        >
                          <LayoutGrid className="h-4 w-4" />
                          Cards
                        </button>
                        <button
                          type="button"
                          onClick={() => setAgentQuotesViewMode('table')}
                          className={cn(
                            'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                            agentQuotesViewMode === 'table'
                              ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
                              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                          )}
                        >
                          <Table2 className="h-4 w-4" />
                          Tabla
                        </button>
                      </div>
                    )}
                  </div>

                  {agentQuotes.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No hay tarifas de agentes registradas.
                    </p>
                  ) : (
                    <>
                      {agentQuotes.length > 0 && (
                        <div className="mb-5 grid gap-3 md:grid-cols-3">
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                              Mejor costo
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {getAgentQuoteProviderName(bestCostQuote)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              USD {formatCurrency(bestCostQuote ? getAgentQuoteFinalCost(bestCostQuote) : 0)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              Más rápido
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {fastestQuote
                                ? getAgentQuoteProviderName(fastestQuote)
                                : 'Sin información'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {fastestQuote
                                ? `${getValidTransitDays(fastestQuote)} días`
                                : 'Sin información'}
                            </p>
                          </div>

                          <div className={cn(cardClass, 'bg-slate-50 p-4 dark:bg-slate-950')}>
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                              Tarifa seleccionada
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {activeQuote
                                ? getAgentQuoteProviderName(activeQuote)
                                : 'Sin seleccionar'}
                            </p>
                            {activeQuote ? (
                              <>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {showCarrierInput && activeQuote.carrier
                                    ? `${activeQuote.carrier} · `
                                    : ''}
                                  {activeQuote.transit_time ||
                                    activeQuote.transit ||
                                    'N/A'}{' '}
                                  días
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  ETD: {formatDisplayDate(activeQuote.etd)}
                                </p>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                  USD {formatCurrency(getAgentQuoteFinalCost(activeQuote))}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Pendiente
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {isFclQuote && agentQuotesViewMode === 'table' ? (
                        <FclAgentComparisonTable
                          agentQuotes={agentQuotes}
                          selectedQuote={selectedQuote}
                          chargeOverrides={fclTableChargeOverrides}
                          bestCostQuoteId={bestCostQuote?.id || null}
                          fastestQuoteId={fastestQuote?.id || null}
                          selectedAgentQuoteId={selectedAgentQuote?.id || null}
                          isPricingActionDisabled={isPricingActionDisabled}
                          showCarrierInput={showCarrierInput}
                          getAgentQuoteBaseCost={getAgentQuoteBaseCost}
                          getAgentQuoteContainersQty={getAgentQuoteContainersQty}
                          getAgentQuoteProviderName={getAgentQuoteProviderName}
                          getValidTransitDays={getValidTransitDays}
                          formatCurrency={formatCurrency}
                          formatDisplayDate={formatDisplayDate}
                          bankTransferFee={bankTransferFee}
                          onChargeOverridesChange={setFclTableChargeOverrides}
                          onSaveTable={saveFclTableOverrides}
                          onSelectQuote={(quote) => {
                            setSelectedRateForConfirm(quote)
                            setConfirmSelectRateOpen(true)
                          }}
                        />
                      ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {agentQuotes.map((quote) => {
                              const finalSariCost = getAgentQuoteFinalCost(quote)
                              const baseCost = getAgentQuoteBaseCost(quote)
                              const airRatePerKg = getAgentAirRatePerKg(quote)
                              const actualWeightKg =
                                Number(quote.actual_weight_kg || 0) ||
                                getAirConsolidatedWeights().actualWeightKg
                              const volumetricWeightKg =
                                Number(quote.volumetric_weight_kg || 0) ||
                                getAirConsolidatedWeights().volumetricWeightKg
                              const chargeableWeightKg =
                                Number(quote.chargeable_weight_kg || 0) ||
                                getAirConsolidatedWeights().chargeableWeightKg
                              const isBestCost = isBestCostQuote(quote)
                              const isFastest = isFastestQuote(quote)
                              const isNew = highlightedAgentQuoteId === quote.id
                              const isSelected = isSelectedQuote(quote)

                              return (
                                <div
                                  key={quote.id}
                                  className={`rounded-2xl border p-6 shadow-sm transition ${getAgentQuoteCardClass(
                                    quote
                                  )} ${isNew && !isSelected ? 'ring-2 ring-green-400' : ''}`}
                                >
                                  <div className="mb-4 flex items-start justify-between gap-3">
                                    <div>
                                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {quote.agente_nombre ||
                                          quote.agent_name ||
                                          quote.agent ||
                                          'Agente'}
                                      </h3>
                                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                        {showCarrierInput && quote.carrier && (
                                          <CarrierBadge code={quote.carrier} size="sm" />
                                        )}
                                        <span>
                                          {quote.transit_time || quote.transit || 'N/A'} dias
                                        </span>
                                      </p>
                                    </div>

                                    <div className="flex flex-wrap justify-end gap-2">
                                      {isNew && (
                                        <span className="rounded-full bg-green-100 px-2 py-1 text-[11px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                          Nueva
                                        </span>
                                      )}

                                      {isSelected && (
                                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                                          ✓ Seleccionada
                                        </span>
                                      )}

                                      {isBestCost && (
                                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                          Mejor costo
                                        </span>
                                      )}

                                      {isFastest && (
                                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                          Más rápido
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setDeleteAgentQuoteId(quote.id)
                                        }}
                                        disabled={isPricingActionDisabled || isSelected}
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Eliminar tarifa"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {isAirConsolidatedQuote() ? (
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div className={cn(mutedCardClass, 'p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          {quote.moneda || 'USD'}{' '}
                                          {formatCurrency(airRatePerKg)}/KG
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Tarifa proveedor
                                        </p>
                                      </div>

                                      <div className={cn(mutedCardClass, 'p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          USD {formatCurrency(baseCost)}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Flete calculado
                                        </p>
                                      </div>

                                      <div className={cn(mutedCardClass, 'p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          {formatCurrency(actualWeightKg)} KG
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Peso real
                                        </p>
                                      </div>

                                      <div className={cn(mutedCardClass, 'p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          {formatCurrency(volumetricWeightKg)} KG
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Peso volumétrico
                                        </p>
                                      </div>

                                      <div className={cn(mutedCardClass, 'col-span-2 p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          {formatCurrency(chargeableWeightKg)} KG
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Peso cobrable
                                        </p>
                                      </div>

                                      <div className="col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                                        Cálculo: USD {formatCurrency(airRatePerKg)}/KG ×{' '}
                                        {formatCurrency(chargeableWeightKg)} KG = USD{' '}
                                        {formatCurrency(baseCost)}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div className={cn(mutedCardClass, 'p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          {quote.moneda || 'USD'} {formatCurrency(baseCost)}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Costo base
                                        </p>
                                      </div>

                                      <div className={cn(mutedCardClass, 'p-3')}>
                                        <p className="text-base font-bold text-slate-900 dark:text-white">
                                          USD {formatCurrency(finalSariCost)}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Costo final
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
                                    {showCarrierInput && quote.carrier && (
                                      <div>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                          Carrier:
                                        </span>{' '}
                                        <CarrierBadge code={quote.carrier} size="sm" showName />
                                      </div>
                                    )}

                                    <div>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        Vigencia:
                                      </span>{' '}
                                      {formatDisplayDate(
                                        quote.valid_until || quote.validity_date
                                      )}
                                    </div>

                                    <div>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        ETD:
                                      </span>{' '}
                                      {formatDisplayDate(quote.etd)}
                                    </div>

                                    <div>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        EXW:
                                      </span>{' '}
                                      USD{' '}
                                      {Number(
                                        quote.exw_amount || quote.exw_cost || 0
                                      ).toFixed(2)}
                                    </div>

                                    <div>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        MBL:
                                      </span>{' '}
                                      USD{' '}
                                      {Number(
                                        quote.mbl_amount || quote.mbl_cost || quote.mbl_fee || 0
                                      ).toFixed(2)}
                                    </div>

                                    <div>
                                      <span className="font-medium text-slate-700 dark:text-slate-300">
                                        Transbordo:
                                      </span>{' '}
                                      {quote.transshipment || quote.transbordo || 'N/A'}
                                    </div>

                                    <div>
                                      <span className="font-medium text-slate-700 dark:text-slate-300">
                                        Dias libres:
                                      </span>{' '}
                                      {quote.free_days_destination ||
                                        quote.free_days ||
                                        quote.dias_libres ||
                                        'N/A'}
                                    </div>
                                    </div>
                                  </div>

                                  <div className="mt-5 flex items-center justify-between gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleEditAgentQuote(quote)}
                                      disabled={!canManagePricing}
                                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Editar
                                    </button>

                                    <button
                                      type="button"
                                      disabled={isPricingActionDisabled || isSelected}
                                      onClick={() => {
                                        setSelectedRateForConfirm(quote)
                                        setConfirmSelectRateOpen(true)
                                      }}
                                      className={
                                        isSelected
                                          ? 'rounded-xl bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700'
                                          : primaryButtonClass
                                      }
                                    >
                                      {isSelected
                                        ? 'Tarifa seleccionada'
                                        : 'Seleccionar tarifa'}
                                    </button>
                                  </div>
                                </div>
                              )
                      })}
                      </div>
                      )}
                    </>
                  )}
                    </div>
                  </>
                )}

                <Card>
                  {!isMiamiFlow && (
                    <CardHeader>
                      <CardTitle>Detalle de Venta al Cliente</CardTitle>
                    </CardHeader>
                  )}

                  <CardContent className="space-y-4">
                    {!isMiamiFlow && (
                      <>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700/60 dark:bg-slate-800/30">
                          <div className="grid gap-3 sm:grid-cols-[160px_1fr_80px]">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Tipo
                              </label>
                              <select
                                name="item_type"
                                value={pricingForm.item_type}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              >
                                {pricingItemTypeOptions.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Descripci&oacute;n
                              </label>
                              <input
                                name="description"
                                placeholder="Ej. Ocean Freight, Handling, BL Fee..."
                                value={pricingForm.description}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                QTY
                              </label>
                              <input
                                type="number"
                                placeholder="1"
                                value={pricingForm.quantity}
                                onChange={(e) =>
                                  setPricingForm({
                                    ...pricingForm,
                                    quantity: e.target.value,
                                  })
                                }
                                className={fieldClass}
                              />
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-4">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Costo unit.
                              </label>
                              <input
                                name="cost_amount"
                                placeholder="0.00"
                                value={pricingForm.cost_amount}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Venta unit.
                              </label>
                              <input
                                name="sale_amount"
                                placeholder="0.00"
                                value={pricingForm.sale_amount}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Moneda
                              </label>
                              <select
                                name="currency"
                                value={pricingForm.currency}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              >
                                <option value="USD">USD</option>
                                <option value="HNL">HNL</option>
                              </select>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Proveedor
                              </label>
                              <input
                                name="supplier"
                                placeholder="Agente / proveedor"
                                value={pricingForm.supplier}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              />
                            </div>
                          </div>

                          <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Notas
                              </label>
                              <input
                                name="notes"
                                placeholder="Observaciones opcionales..."
                                value={pricingForm.notes}
                                onChange={handlePricingChange}
                                className={fieldClass}
                              />
                            </div>

                            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                              <input
                                type="checkbox"
                                checked={pricingForm.taxable}
                                onChange={(e) =>
                                  setPricingForm({
                                    ...pricingForm,
                                    taxable: e.target.checked,
                                  })
                                }
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              ISV {defaultTaxRate}%
                            </label>

                            <button
                              onClick={savePricingItem}
                              disabled={isPricingActionDisabled}
                              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                              Agregar cargo
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 dark:border-slate-700/60 dark:bg-slate-900/60">
                          <div className="flex items-center gap-6">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Subtotal
                              </p>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                USD {subtotal.toFixed(2)}
                              </p>
                            </div>

                            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />

                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                ISV
                              </p>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                USD {taxAmount.toFixed(2)}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Total venta
                            </p>
                            <p className="text-xl font-bold text-slate-900 dark:text-white">
                              USD {totalAmount.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </>
                    )}

                    {isMiamiFlow && (
                      <section className={cn(cardClass, 'p-5')}>
                        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/20">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                            Esta cotización usa el flujo Miami. Las tarifas fueron generadas automáticamente por el sistema. Puedes editar los pricing items y aprobar desde aquí.
                          </p>
                        </div>

                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                          Gestión operativa Miami
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          Esta cotización usa tarifas propias de Sari Express. No requiere comparativo de agentes.
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-4">
                          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Producto</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {selectedQuote.service_product === 'miami_lcl'
                                ? 'Miami Consolidado LCL'
                                : 'Miami Consolidado Aéreo'}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Incoterm</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {selectedQuote.incoterm || 'N/A'}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Origen</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {selectedQuote.origen || 'N/A'}
                            </p>
                          </div>

                          <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/60">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Destino</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                              {selectedQuote.destino || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </section>
                    )}

                    {isMiamiFlow && (
                      <section className={cn(cardClass, 'p-5')}>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                              Editar carga / Recalcular Miami
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              Ajusta piezas, dimensiones y peso para recalcular volumen y libras.
                            </p>
                          </div>

                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={saveCargoLines}
                              disabled={isPricingActionDisabled || savingCargo}
                              className={primaryButtonClass}
                            >
                              {savingCargo ? 'Guardando...' : 'Guardar carga'}
                            </button>

                            <button
                              type="button"
                              className={secondaryButtonClass}
                              disabled={
                                isPricingActionDisabled ||
                                savingCargo ||
                                !['miami_lcl', 'miami_air'].includes(
                                  selectedQuote.service_product
                                )
                              }
                              onClick={recalculateMiamiPricing}
                            >
                              Recalcular
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 space-y-3">
                          {cargoLines.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              No hay líneas de carga registradas.
                            </p>
                          ) : (
                            cargoLines.map((line, index) => (
                              <div
                                key={line.id}
                                className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                              >
                                <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                                  <p className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Línea #{index + 1}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCargoLines((prev) =>
                                        prev.filter((item) => item.id !== line.id)
                                      )
                                    }
                                    disabled={isPricingActionDisabled}
                                    className="flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 text-xs text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                  >
                                    Quitar
                                  </button>
                                </div>

                                <div className="space-y-3 bg-white p-4 dark:bg-slate-950/40">
                                  <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Cantidad
                                      </label>
                                      <input
                                        className={fieldClass}
                                        type="number"
                                        min="1"
                                        value={line.quantity ?? ''}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'quantity', e.target.value)
                                        }
                                        placeholder="1"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Tipo de paquete
                                      </label>
                                      <select
                                        className={fieldClass}
                                        value={line.package_type ?? 'Caja'}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'package_type', e.target.value)
                                        }
                                      >
                                        <option>Caja</option>
                                        <option>Pallet</option>
                                        <option>Pieza</option>
                                      </select>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Peso unit. (lbs)
                                      </label>
                                      <input
                                        className={fieldClass}
                                        type="number"
                                        value={line.weight_lbs ?? ''}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'weight_lbs', e.target.value)
                                        }
                                        placeholder="0"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-4">
                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Largo
                                      </label>
                                      <input
                                        className={fieldClass}
                                        type="number"
                                        value={line.length ?? ''}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'length', e.target.value)
                                        }
                                        placeholder="0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Ancho
                                      </label>
                                      <input
                                        className={fieldClass}
                                        type="number"
                                        value={line.width ?? ''}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'width', e.target.value)
                                        }
                                        placeholder="0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Alto
                                      </label>
                                      <input
                                        className={fieldClass}
                                        type="number"
                                        value={line.height ?? ''}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'height', e.target.value)
                                        }
                                        placeholder="0"
                                      />
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                      <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                        Unidad
                                      </label>
                                      <select
                                        className={fieldClass}
                                        value={line.dimension_unit ?? 'in'}
                                        onChange={(e) =>
                                          updateCargoLine(line.id, 'dimension_unit', e.target.value)
                                        }
                                      >
                                        <option value="in">Pulgadas (in)</option>
                                        <option value="cm">Centímetros (cm)</option>
                                        <option value="mm">Milímetros (mm)</option>
                                        <option value="m">Metros (m)</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setCargoLines((prev) => [
                                ...prev,
                                {
                                  id: crypto.randomUUID(),
                                  quantity: 1,
                                  package_type: 'Caja',
                                  length: '',
                                  width: '',
                                  height: '',
                                  dimension_unit: 'in',
                                  weight_lbs: '',
                                },
                              ])
                            }
                            disabled={isPricingActionDisabled}
                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-400 hover:border-slate-400 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-500 dark:hover:border-slate-600 dark:hover:text-slate-300"
                          >
                            Agregar línea
                          </button>
                        </div>
                      </section>
                    )}

                    {isMiamiFlow ? (
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                            Líneas de Cotización
                          </h3>

                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Administra cargos operativos y ajustes comerciales.
                          </p>
                        </div>

                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={isPricingActionDisabled}
                          onClick={() => setShowAddChargeModal(true)}
                        >
                          + Agregar cargo
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-lg font-semibold">
                      Líneas de Cotización
                      </h3>
                    )}

                    {showCargoInsuranceButton && (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={insuranceTaxable}
                            onChange={(event) =>
                              setInsuranceTaxable(event.target.checked)
                            }
                            className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                          />
                          Aplicar ISV {defaultTaxRate}% al seguro
                        </label>

                        <button
                          type="button"
                          className={secondaryButtonClass}
                          disabled={isPricingActionDisabled}
                          onClick={applyCargoInsurance}
                        >
                          Aplicar seguro de carga
                        </button>
                      </div>
                    )}

                    {optionalClientRates.length > 0 && (
                      <section className={cn(cardClass, 'mb-4 p-5')}>
                        <div className={cn('flex items-center justify-between gap-4', isOptionalClientRatesOpen && 'mb-4')}>
                          <div>
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                              Cargos opcionales del cliente
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              Agrega manualmente cargos configurados en el perfil del cliente.
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsOptionalClientRatesOpen((current) => !current)}
                            aria-expanded={isOptionalClientRatesOpen}
                            aria-controls="optional-client-rates-content"
                            className={cn(secondaryButtonClass, 'flex shrink-0 items-center gap-2')}
                          >
                            {isOptionalClientRatesOpen ? 'Ocultar' : 'Mostrar'}
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 transition-transform',
                                isOptionalClientRatesOpen && 'rotate-180'
                              )}
                            />
                          </button>
                        </div>

                        {isOptionalClientRatesOpen && (
                        <div
                          id="optional-client-rates-content"
                          className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                        >
                          <div className="grid grid-cols-[1fr_140px_120px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                            <span>Cargo</span>
                            <span className="text-right">Monto</span>
                            <span className="text-right">Acción</span>
                          </div>
                          {optionalClientRates.map((rate) => {
                            const alreadyAdded = pricingItems.some(
                              (item) => item.description === rate.rate_label
                            )
                            const currency = rate.currency || 'USD'

                            return (
                              <div
                                key={rate.rate_code}
                                className={`grid grid-cols-[1fr_140px_120px] items-center gap-4 border-b border-slate-100 px-4 py-2.5 last:border-0 dark:border-slate-800 ${
                                  alreadyAdded
                                    ? 'bg-emerald-50/50 dark:bg-emerald-950/10'
                                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20'
                                }`}
                              >
                                <div>
                                  <p
                                    className={`text-sm font-medium ${
                                      alreadyAdded
                                        ? 'text-slate-400 dark:text-slate-500'
                                        : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {rate.rate_label}
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {rate.category || 'Cargo opcional'}
                                    {rate.unit ? ` · ${rate.unit}` : ''}
                                  </p>
                                </div>

                                <div className="contents">
                                  <span className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                                    {currency} {formatCurrency(Number(rate.amount || 0))}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => addOptionalClientRate(rate)}
                                    disabled={isPricingActionDisabled || alreadyAdded}
                                    className={alreadyAdded ? 'text-right text-xs font-medium text-emerald-600 disabled:opacity-100 dark:text-emerald-400' : `${secondaryButtonClass} text-xs`}
                                  >
                                    {alreadyAdded ? 'Agregado' : 'Agregar'}
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        )}
                      </section>
                    )}

                    {pricingItems.length === 0 ? (
                      <p className="text-gray-500">
                        No hay líneas de cotización.
                      </p>
                    ) : (
                      <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            <th className="p-2 text-xs uppercase text-gray-500">Descripción</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Tipo</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Proveedor</th>
                            <th className="p-2 text-xs uppercase text-gray-500">QTY</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Costo Unit.</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Costo Total</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Venta Unit.</th>
                            <th className="p-2 text-xs uppercase text-gray-500">ISV</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Venta Total</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Margen</th>
                            <th className="p-2 text-xs uppercase text-gray-500">Acción</th>
                          </tr>
                        </thead>

                        <tbody>
                          {pricingItems.map((item) => {
                            const qty = Number(item.quantity || 1)
                            const subtotal = qty * Number(item.sale_amount || 0)
                            const tax = calculateTaxAmount(Boolean(item.taxable), subtotal, defaultTaxRate)
                            const total = subtotal + tax
                            const currency = item.currency || 'USD'
                            const costSubtotal =
                              qty * Number(item.cost_amount || 0)
                            const saleSubtotal =
                              qty * Number(item.sale_amount || 0)
                            const editingCost =
                              Number(editingPricingItemForm?.cost_amount || 0)
                            const editingSale =
                              Number(editingPricingItemForm?.sale_amount || 0)
                            const editingQty =
                              Number(editingPricingItemForm?.quantity || 0)
                            const displayCostSubtotal =
                              editingPricingItemId === item.id
                                ? editingCost * editingQty
                                : costSubtotal
                            const displaySaleSubtotal =
                              editingPricingItemId === item.id
                                ? editingSale * editingQty
                                : saleSubtotal
                            const displayMargin =
                              displaySaleSubtotal - displayCostSubtotal
                            const margin = displayMargin

                            return (
                              <tr
                                key={item.id}
                                className={`border-b ${
                                  margin < 0
                                    ? 'bg-red-50 dark:bg-red-950/30'
                                    : margin === 0
                                    ? 'bg-slate-50 dark:bg-slate-900/40'
                                    : 'dark:bg-[#131c2e]'
                                }`}
                              >
                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      value={editingPricingItemForm?.description || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          description: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-full"
                                    />
                                  ) : (
                                    item.description
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <select
                                      value={
                                        editingPricingItemForm?.item_type ||
                                        'Otro'
                                      }
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          item_type: e.target.value,
                                        })
                                      }
                                      className="w-full rounded border px-2 py-1 text-sm"
                                    >
                                      {pricingItemTypeOptions.map((type) => (
                                        <option key={type} value={type}>
                                          {type}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                      {item.item_type || 'Otro'}
                                    </span>
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {item.supplier || 'N/A'}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      type="number"
                                      value={editingPricingItemForm?.quantity || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          quantity: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-20"
                                    />
                                  ) : (
                                    item.quantity
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editingPricingItemForm?.cost_amount || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          cost_amount: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-full"
                                    />
                                  ) : (
                                    `USD ${formatCurrency(item.cost_amount || 0)}`
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  USD {formatCurrency(displayCostSubtotal)}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={editingPricingItemForm?.sale_amount || ''}
                                      onChange={(e) =>
                                        setEditingPricingItemForm({
                                          ...editingPricingItemForm,
                                          sale_amount: e.target.value,
                                        })
                                      }
                                      className="border rounded px-2 py-1 text-sm w-full"
                                    />
                                  ) : (
                                    `USD ${formatCurrency(item.sale_amount)}`
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {currency} {tax.toFixed(2)}
                                </td>

                                <td className="p-2 text-sm font-bold">
                                  {editingPricingItemId === item.id
                                    ? `USD ${formatCurrency(displaySaleSubtotal)}`
                                    : `USD ${formatCurrency(item.total_amount)}`
                                  }
                                </td>

                                <td className="p-2 text-sm font-semibold">
                                  <span
                                    className={`font-semibold ${
                                      margin > 0
                                        ? 'text-green-600'
                                        : margin < 0
                                        ? 'text-red-600'
                                        : 'text-yellow-600'
                                    }`}
                                  >
                                    USD {formatCurrency(margin)}
                                  </span>
                                  {displaySaleSubtotal > 0 && (
                                    <span className="block text-xs text-slate-400 dark:text-slate-500">
                                      {((margin / displaySaleSubtotal) * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => updatePricingItem(item)}
                                        disabled={isPricingActionDisabled}
                                        className="text-green-600 font-medium"
                                      >
                                        Guardar
                                      </button>

                                      <button
                                        onClick={cancelEditingPricingItem}
                                        className="text-gray-500 font-medium"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-3">
                                      <button
                                        onClick={() => startEditingPricingItem(item)}
                                        disabled={isPricingActionDisabled}
                                        className="text-blue-600 font-medium"
                                      >
                                        Modificar
                                      </button>

                                      <button
                                        onClick={() => deletePricingItem(item.id)}
                                        disabled={isPricingActionDisabled}
                                        className="text-red-600 font-medium"
                                      >
                                        Eliminar
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>

                <div className={cn(cardClass, 'p-6')}>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Observaciones para Cliente (PDF)
                  </h3>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Estas observaciones aparecerán en la cotización enviada al cliente.
                  </p>

                  <textarea
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    className={`${fieldClass} mt-4 min-h-[140px] w-full py-3`}
                    placeholder="Ej: Tarifas sujetas a espacio con naviera..."
                  />

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      className={primaryButtonClass}
                      onClick={saveClientNotes}
                    >
                      Guardar observaciones
                    </button>
                  </div>
                </div>

                <div className="flex flex-col justify-end gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={previewQuotationPdf}
                    className={cn(
                      secondaryButtonClass,
                      'inline-flex items-center justify-center gap-2'
                    )}
                  >
                    <FileText className="h-4 w-4" />
                    Previsualizar PDF
                  </button>

                  <button
                    onClick={approvePricing}
                    disabled={isPricingActionDisabled}
                    className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    Aprobar Pricing
                  </button>

                  <button
                    onClick={markAsSentToClient}
                    disabled={isPricingActionDisabled}
                    className="rounded-xl bg-green-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-green-700"
                  >
                    Marcar como Enviada al Cliente
                  </button>
                </div>

                <Card className={cardClass}>
                  <CardHeader>
                    <CardTitle>Resumen Comercial</CardTitle>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Costo Base Sari</p>
                      <p className="text-xl font-bold dark:text-white">
                        USD {formatCurrency(totalCost)}
                      </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Venta Cliente</p>
                      <p className="text-xl font-bold dark:text-white">
                        USD {formatCurrency(totalSaleWithTax)}
                      </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Profit</p>
                      <p
                        className={`text-xl font-bold ${
                          profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        USD {formatCurrency(profit)}
                      </p>
                      </div>

                      <div
                      className={`rounded-xl border p-4 ${
                        gpPercentage >= 15
                          ? 'border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/30'
                          : gpPercentage >= 8
                          ? 'border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/30'
                          : 'border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/30'
                      }`}
                    >
                      <p className="text-xs text-gray-500 dark:text-slate-400">GP %</p>
                      <p
                        className={`text-xl font-bold ${
                          gpPercentage >= 15
                            ? 'text-green-700 dark:text-green-400'
                            : gpPercentage >= 8
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {gpPercentage.toFixed(2)}%
                      </p>
                      <p
                        className={`mt-0.5 text-[10px] font-semibold ${
                          gpPercentage >= 15
                            ? 'text-green-600 dark:text-green-500'
                            : gpPercentage >= 8
                            ? 'text-orange-500 dark:text-orange-400'
                            : 'text-red-500 dark:text-red-400'
                        }`}
                      >
                        {profitabilityStatus}
                      </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Target Cliente</p>
                      <p className="text-xl font-bold dark:text-white">
                        {targetRate > 0
                          ? `USD ${formatCurrency(targetRate)}`
                          : 'N/A'}
                      </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Vs Target</p>

                      {targetRate > 0 ? (
                        <>
                          <p
                            className={`text-xl font-bold ${
                              targetRateDifference <= 0
                                ? 'text-green-700'
                                : 'text-red-700'
                            }`}
                          >
                            {targetRateDifference <= 0 ? '-' : '+'} USD{' '}
                            {formatCurrency(Math.abs(targetRateDifference))}
                          </p>

                          <p className="text-xs text-gray-500 mt-1">
                            {targetRateDifference <= 0
                              ? `${Math.abs(targetRateDifferencePercentage).toFixed(2)}% abajo`
                              : `${targetRateDifferencePercentage.toFixed(2)}% arriba`}
                          </p>
                        </>
                      ) : (
                        <p className="text-xl font-bold">N/A</p>
                      )}
                      </div>
                    </div>

                  </CardContent>
                </Card>
              </>
            )}
        </div>
      </div>

      <Dialog
        open={showAddChargeModal}
        onOpenChange={(open) => {
          setShowAddChargeModal(open)

          if (!open) {
            resetMiamiChargeForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar cargo</DialogTitle>
            <DialogDescription>
              Registra un cargo operativo o ajuste comercial para esta cotización Miami.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Descripción</label>
              <input
                value={miamiChargeForm.description}
                onChange={(e) =>
                  setMiamiChargeForm({
                    ...miamiChargeForm,
                    description: e.target.value,
                  })
                }
                className={cn(fieldClass, 'mt-1')}
              />
            </div>

            <div>
              <label className={labelClass}>Categoría</label>
              <select
                value={miamiChargeForm.category}
                onChange={(e) =>
                  setMiamiChargeForm({
                    ...miamiChargeForm,
                    category: e.target.value,
                  })
                }
                className={cn(fieldClass, 'mt-1')}
              >
                <option value="freight">Flete</option>
                <option value="origin_charge">Gasto origen</option>
                <option value="destination_charge">Gasto destino</option>
                <option value="other_charge">Otro</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Venta USD</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={miamiChargeForm.sale_amount}
                onChange={(e) =>
                  setMiamiChargeForm({
                    ...miamiChargeForm,
                    sale_amount: e.target.value,
                  })
                }
                className={cn(fieldClass, 'mt-1')}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={miamiChargeForm.taxable}
                onChange={(e) =>
                  setMiamiChargeForm({
                    ...miamiChargeForm,
                    taxable: e.target.checked,
                  })
                }
              />
              Gravable ISV {defaultTaxRate}%
            </label>

            <div>
              <label className={labelClass}>Proveedor</label>
              <input
                value={miamiChargeForm.supplier}
                onChange={(e) =>
                  setMiamiChargeForm({
                    ...miamiChargeForm,
                    supplier: e.target.value,
                  })
                }
                className={cn(fieldClass, 'mt-1')}
              />
            </div>

            <div>
              <label className={labelClass}>Notas</label>
              <textarea
                value={miamiChargeForm.notes}
                onChange={(e) =>
                  setMiamiChargeForm({
                    ...miamiChargeForm,
                    notes: e.target.value,
                  })
                }
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddChargeModal(false)
                resetMiamiChargeForm()
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={isPricingActionDisabled || savingMiamiCharge}
              onClick={saveMiamiCharge}
              className={primaryButtonClass}
            >
              {savingMiamiCharge ? 'Guardando...' : 'Guardar cargo'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmSelectRateOpen}
        onOpenChange={(open) => {
          setConfirmSelectRateOpen(open)

          if (!open) {
            setSelectedRateForConfirm(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Seleccionar tarifa de agente</DialogTitle>
            <DialogDescription>
              Esta acción marcará esta tarifa como la opción seleccionada para pricing.
            </DialogDescription>
          </DialogHeader>

          {selectedRateForConfirm && (
            <div className={cn(mutedCardClass, 'border border-slate-200 p-4 text-sm dark:border-slate-700')}>
              <p className="font-semibold text-slate-900 dark:text-white">
                {selectedRateForConfirm.agent_name ||
                  selectedRateForConfirm.agente_nombre ||
                  selectedRateForConfirm.agent ||
                  'Agente'}
              </p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">
                Costo final: {selectedRateForConfirm.moneda || 'USD'}{' '}
                {formatCurrency(getAgentQuoteFinalCost(selectedRateForConfirm))}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmSelectRateOpen(false)
                setSelectedRateForConfirm(null)
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={isPricingActionDisabled || selectingRate}
              onClick={confirmSelectRate}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              {selectingRate ? 'Seleccionando...' : 'Si, seleccionar tarifa'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pricingValidationDialogOpen}
        onOpenChange={setPricingValidationDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>No se puede aprobar Pricing</DialogTitle>
            <DialogDescription>
              Hay información pendiente o inconsistente antes de aprobar esta cotización.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <ul className="space-y-2">
              {pricingValidationErrors.map((error) => (
                <li
                  key={error}
                  className="flex gap-2 text-sm text-amber-900 dark:text-amber-100"
                >
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-300" />
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPricingValidationDialogOpen(false)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Entendido
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={profitabilityDialogOpen}
        onOpenChange={setProfitabilityDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aprobación con margen sensible</DialogTitle>
            <DialogDescription>
              Esta cotización tiene condiciones comerciales que requieren justificación.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
            <ul className="space-y-2">
              {profitabilityWarnings.map((warning) => (
                <li
                  key={warning}
                  className="text-sm text-red-800 dark:text-red-100"
                >
                  • {warning}
                </li>
              ))}
            </ul>
          </div>

          <textarea
            value={profitabilityReason}
            onChange={(e) => {
              setProfitabilityReason(e.target.value)
              profitabilityReasonRef.current = e.target.value
            }}
            placeholder="Justifica por qué se aprueba esta cotización..."
            rows={4}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setProfitabilityDialogOpen(false)
                setProfitabilityReason('')
                profitabilityReasonRef.current = ''
                setPendingApprovePricing(null)
              }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm dark:border-slate-700"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={!profitabilityReason.trim()}
              onClick={async () => {
                if (!pendingApprovePricing) return
                await pendingApprovePricing()
                setProfitabilityDialogOpen(false)
                setProfitabilityReason('')
                profitabilityReasonRef.current = ''
                setPendingApprovePricing(null)
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Aprobar con justificación
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={operationalImpactDialogOpen}
        onOpenChange={(open) => {
          if (!open && !processingOperationalApproval) {
            setOperationalImpactDialogOpen(false)
            setOperationalImpact(null)
            setPendingOperationalApproval(null)
            return
          }

          setOperationalImpactDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Impacto operativo detectado</DialogTitle>
            <DialogDescription>
              Esta cotización tiene operación asociada. Elige cómo cerrar la aprobación de repricing.
            </DialogDescription>
          </DialogHeader>

          {operationalImpact && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Shipping Instruction
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {operationalImpact.shippingInstruction?.routing_number ||
                      operationalImpact.shippingInstruction?.id ||
                      'No encontrada'}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total bookings
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {operationalImpact.bookings.length}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Bookings confirmados
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {operationalImpact.confirmedBookings.length > 0 ? 'Sí' : 'No'}
                  </p>
                </div>
              </div>

              {operationalImpact.confirmedBookings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  Los bookings confirmados no serán modificados.
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                        Campo
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                        Anterior
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 dark:text-slate-300">
                        Nuevo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {operationalImpact.changes.map((change) => (
                      <tr key={change.label}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                          {change.label}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {change.previousValue}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {change.newValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setOperationalImpactDialogOpen(false)
                    setOperationalImpact(null)
                    setPendingOperationalApproval(null)
                  }}
                  disabled={processingOperationalApproval}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => approveOperationalImpact('skip')}
                  disabled={processingOperationalApproval}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Aprobar sin actualizar operación
                </button>

                <button
                  type="button"
                  onClick={() => approveOperationalImpact('sync')}
                  disabled={processingOperationalApproval}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {processingOperationalApproval
                    ? 'Procesando...'
                    : 'Aprobar y propagar'}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={postApprovalDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            cancelPostApprovalChange()
            return
          }

          setPostApprovalDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{postApprovalDialogCopy.title}</DialogTitle>

            <DialogDescription>
              {postApprovalDialogCopy.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              Toda modificacion posterior quedara registrada en el historial de
              actividad.
            </div>

            <textarea
              value={postApprovalReason}
              onChange={(event) => {
                setPostApprovalReason(event.target.value)
                postApprovalReasonRef.current = event.target.value
              }}
              placeholder="Describe el motivo del cambio..."
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-400"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancelPostApprovalChange}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={savingPostApproval}
              onClick={confirmPostApprovalChange}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {savingPostApproval ? 'Registrando...' : 'Guardar cambio'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {deleteAgentQuoteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-950">
              Eliminar tarifa de agente
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Se eliminará permanentemente la cotización recibida del proveedor.
            </p>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proveedor:
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {agentQuotePendingDelete?.agente_nombre ||
                  agentQuotePendingDelete?.agent_name ||
                  agentQuotePendingDelete?.agent ||
                  'Proveedor sin nombre'}
              </p>
            </div>

            <p className="mt-4 text-sm text-slate-500">
              Esta acción no se puede deshacer.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setDeleteAgentQuoteId(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
                onClick={() => handleDeleteAgentQuote(deleteAgentQuoteId)}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function PricingComparisonPage() {
  return (
    <Suspense fallback={<p className="p-8">Cargando pricing...</p>}>
      <PricingComparisonContent />
    </Suspense>
  )
}
