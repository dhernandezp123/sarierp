'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Pencil, X } from 'lucide-react'
import { toast } from 'sonner'

import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import { calculateMiamiLcl } from '@/src/lib/miami-lcl-calculator'
import { canTransition } from '@/src/lib/quotation-status'
import {
  calculateGrossProfitPercent,
  validatePricingCompleteness,
} from '@/src/lib/pricing-validation'
import { CotizacionCombobox } from '@/src/components/ui/CotizacionCombobox'
import { AgenteCombobox } from '@/src/components/ui/AgenteCombobox'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

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
  amount: number
}

type SurchargeRule = {
  code: string
  label: string
  rate_per_lbs: number | string | null
  rate_per_ft3: number | string | null
  minimum_amount: number | string | null
  currency: string | null
}

type AgentQuote = any

function PricingComparisonContent() {
  const { profile } = useUser()
  const searchParams = useSearchParams()
  const quoteId = searchParams.get('quoteId')

  const [quotations, setQuotations] = useState<any[]>([])
  const [selectedQuote, setSelectedQuote] = useState<any>(null)

  const [agents, setAgents] = useState<any[]>([])
  const [agentQuotes, setAgentQuotes] = useState<AgentQuote[]>([])
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [quotationContainers, setQuotationContainers] = useState<any[]>([])
  const [containerRateLines, setContainerRateLines] = useState<any[]>([])
  const [cargoLines, setCargoLines] = useState<CargoLine[]>([])
  const [savingCargo, setSavingCargo] = useState(false)
  const [clientRates, setClientRates] = useState<ClientRate[]>([])
  const [surchargeRules, setSurchargeRules] = useState<SurchargeRule[]>([])

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
  const [postApprovalDialogOpen, setPostApprovalDialogOpen] = useState(false)
  const [postApprovalReason, setPostApprovalReason] = useState('')
  const [pendingPostApprovalAction, setPendingPostApprovalAction] = useState<null | (() => Promise<void>)>(null)
  const [savingPostApproval, setSavingPostApproval] = useState(false)
  const [showAddChargeModal, setShowAddChargeModal] = useState(false)
  const [savingMiamiCharge, setSavingMiamiCharge] = useState(false)
  const [miamiChargeForm, setMiamiChargeForm] = useState({
    description: '',
    category: 'freight',
    sale_amount: '',
    taxable: false,
    supplier: 'Sari Express',
    notes: '',
  })
  const agentQuotesSectionRef = useRef<HTMLDivElement | null>(null)
  const postApprovalReasonRef = useRef('')
  const profitabilityReasonRef = useRef('')
  const postApprovalResolveRef = useRef<((reason: string | null) => void) | null>(null)

  const [editingPricingItemForm, setEditingPricingItemForm] =
    useState<any>(null)

  useEffect(() => {
    fetchQuotations()
    fetchAgents()
  }, [quoteId])

  const fetchQuotations = async () => {
    const { data, error } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          codigo_cliente,
          nombre
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

    const { data: ratesData } = await supabase
      .from('client_rates')
      .select('rate_code, amount')
      .eq('cliente_id', quote.cliente_id)
      .eq('is_active', true)

    const { data: surchargeData } = await supabase
      .from('surcharge_rules')
      .select('code, label, rate_per_lbs, rate_per_ft3, minimum_amount, currency')
      .eq('service_product', quote.service_product)
      .eq('is_active', true)

    setClientRates((ratesData || []) as ClientRate[])
    setSurchargeRules((surchargeData || []) as SurchargeRule[])
  }

  useEffect(() => {
    if (!selectedQuote?.id) return

    loadMiamiRates()
  }, [selectedQuote?.id, selectedQuote?.cliente_id, selectedQuote?.service_product])

  const handleSelectQuote = async (quote: any) => {
    setSelectedQuote(quote)
    await fetchAgentQuotes(quote.id)
    await fetchPricingItems(quote.id)
    await fetchQuotationContainers(quote.id)
    await loadCargoLines(quote.id)
    await loadMiamiRates(quote)
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

  const getTotalContainersQty = (fallbackQty?: string | number) =>
    quotationContainers.length > 0
      ? quotationContainers.reduce(
          (sum, container) => sum + Number(container.quantity || 0),
          0
        )
      : Number(fallbackQty || agentForm.containers_qty || 1)

  const getTotalOceanFreight = () =>
    containerRateLines.length > 0
      ? containerRateLines.reduce(
          (sum, line) =>
            sum +
            Number(line.quantity || 0) *
              Number(line.ocean_freight || 0),
          0
        )
      : Number(agentForm.ocean_freight || 0)

  const handleEditAgentQuote = async (quote: any) => {
    setEditingAgentQuoteId(quote.id)

    setAgentForm({
      agent_id: quote.agent_id || '',
      agente_nombre: quote.agente_nombre || '',
      ocean_freight: String(quote.ocean_freight || quote.costo || ''),
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

    if (!ensureQuoteIsEditable()) return

    const oldStatus = selectedQuote.status || 'Borrador'
    const nextStatus = 'Pendiente de Fijar Precios'

    if (oldStatus !== nextStatus && !canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    const reason = await requestChangeReason(
      editingAgentQuoteId ? 'Actualizar tarifa de agente' : 'Agregar tarifa de agente'
    )

    if (reason === null) return

    const totalContainersQty = getTotalContainersQty()
    const totalOceanFreight = getTotalOceanFreight()

    const suggestedSale =
      totalOceanFreight +
      Number(agentForm.exw_cost || 0) +
      Number(agentForm.mbl_fee || 0) +
      Number(agentForm.profit_per_container || 0) * totalContainersQty

    const agentQuotePayload = {
      agent_id: agentForm.agent_id || null,
      agente_nombre: agentForm.agente_nombre,
      costo: totalOceanFreight,
      ocean_freight: totalOceanFreight,
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
      suggested_sale: suggestedSale,
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

    await supabase
      .from('pricing_items')
      .delete()
      .eq('quotation_id', selectedQuote.id)

    await supabase
      .from('agent_quotes')
      .update({ is_selected: false })
      .eq('quotation_id', selectedQuote.id)

    const { error } = await supabase
      .from('agent_quotes')
      .update({ is_selected: true })
      .eq('id', agentQuoteId)

    if (error) {
      toast.error(error.message)
      return
    }

    const updatedQuoteFields = {
      valid_until:
        selectedAgentQuote.valid_until || selectedQuote.valid_until || null,
      preferred_carrier:
        selectedAgentQuote.carrier || selectedQuote.preferred_carrier || null,
      transit_time:
        selectedAgentQuote.transit_time || selectedQuote.transit_time || null,
      transshipment:
        selectedAgentQuote.transshipment || selectedQuote.transshipment || null,
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

    await fetchQuotations()

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

    const oceanFreightLines =
      containerRatesData && containerRatesData.length > 0
        ? containerRatesData.map((rate) => {
            const unitOceanFreight =
              Number(rate.ocean_freight || 0) +
              agentProfitPerContainer +
              mblPerContainer

            const quantity = Number(rate.quantity || 1)

            return {
              quotation_id: selectedQuote.id,
              item_type: 'Flete',
              description: `Ocean Freight ${rate.container_type_name}`,
              cost_amount: unitOceanFreight,
              sale_amount: unitOceanFreight,
              quantity,
              taxable: false,
              tax_rate: 15,
              tax_amount: 0,
              total_amount: unitOceanFreight * quantity,
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
              description: 'Ocean Freight',
              cost_amount: oceanFreight + mblFee + totalProfit,
              sale_amount: oceanFreight + mblFee + totalProfit,
              quantity: 1,
              taxable: false,
              tax_rate: 15,
              tax_amount: 0,
              total_amount: oceanFreight + mblFee + totalProfit,
              currency,
              supplier,
              notes: '',
              created_by: profile?.id,
            },
          ]

    const pricingLines = [
      ...oceanFreightLines,
      {
        quotation_id: selectedQuote.id,
        item_type: 'Origen',
        description: 'EXW',
        cost_amount: exwCost,
        sale_amount: exwCost,
        quantity: 1,
        taxable: false,
        tax_rate: 15,
        tax_amount: 0,
        total_amount: exwCost,
        currency,
        supplier,
        notes: '',
        created_by: profile?.id,
      },
    ]

    const { error: pricingError } = await supabase
      .from('pricing_items')
      .insert(pricingLines)

    if (pricingError) {
      toast.error(pricingError.message)
      return
    }

    toast.success('Tarifa seleccionada')

    await fetchAgentQuotes(selectedQuote.id)
    await fetchPricingItems(selectedQuote.id)
  }

  const handleDeleteAgentQuote = async (agentQuoteId: string) => {
    if (!selectedQuote || isLockedQuote) return

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
        tax_rate: 15,
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
      supplier: 'Sari Express',
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

    const taxAmount = miamiChargeForm.taxable ? saleAmount * 0.15 : 0
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
          tax_rate: 15,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          currency: 'USD',
          supplier: miamiChargeForm.supplier.trim() || 'Sari Express',
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

    const bunkerRule = surchargeRules.find(
      (rule) => rule.code === 'bunker_emergency_surcharge'
    )

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
        .eq('description', bunkerRule.label)

      if (bunkerError) {
        toast.error('No se pudo recalcular el Bunker')
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

  const startEditingPricingItem = (item: any) => {
    if (!ensureQuoteIsEditable()) return

    setEditingPricingItemId(item.id)

    setEditingPricingItemForm({
      description: item.description || '',
      quantity: item.quantity || 1,
      sale_amount: item.sale_amount || 0,
      cost_amount: item.cost_amount || 0,
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
    const taxAmount = item.taxable ? subtotal * 0.15 : 0
    const totalAmount = subtotal + taxAmount

    const { error } = await supabase
      .from('pricing_items')
      .update({
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

  const executeApprovePricing = async (reason?: string) => {
    if (!selectedQuote) return

    const oldStatus = selectedQuote.status || 'Borrador'
    const nextStatus = 'Pricing Aprobado'

    if (!canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    const { error } = await supabase
      .from('quotations')
      .update({
        status: nextStatus,
        total_cost: totalCost,
        total_sale: totalSale,
        profit_amount: profit,
        gp_percentage: gpPercentage,
        pricing_approved: true,
        pricing_approved_by: profile?.id,
        pricing_approved_at: new Date().toISOString(),
      })
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

    await createActivityLog({
      module: 'pricing',
      action: 'pricing_approved',
      entityType: 'quotation',
      entityId: selectedQuote.id,
      description: `Pricing aprobó la cotización ${
        selectedQuote.quotation_number || selectedQuote.id
      }`,
      metadata: {
        reason: reason || null,
      },
    })

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

    toast.success('Pricing aprobado correctamente')

    await fetchQuotations()

    setSelectedQuote({
      ...selectedQuote,
      status: nextStatus,
      total_cost: totalCost,
      total_sale: totalSale,
      profit_amount: profit,
      gp_percentage: gpPercentage,
      pricing_approved: true,
    })
  }

  const approvePricing = async () => {
    if (!selectedQuote) return

    if (!ensureQuoteIsEditable()) return

    const oldStatus = selectedQuote.status || 'Borrador'
    const nextStatus = 'Pricing Aprobado'

    if (!canTransition(oldStatus, nextStatus)) {
      toast.error(`Transicion no permitida: ${oldStatus} a ${nextStatus}`)
      return
    }

    const selectedAgentQuote = agentQuotes.find((quote) => quote.is_selected)
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
      ? subtotal * 0.15
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
    containerRateLines.length > 0
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

  const fastestTransit = Math.min(
    ...agentQuotes
      .map((q) => Number(q.transit_time || q.transit || 0))
      .filter((n) => n > 0)
  )

  const fastestQuote = agentQuotes
    .filter((q) => Number(q.transit_time || q.transit || 0) > 0)
    .sort(
      (a, b) =>
        Number(a.transit_time || a.transit || 0) -
        Number(b.transit_time || b.transit || 0)
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

  const lockedQuoteMessage =
    'Esta cotización ya fue enviada, ganada o perdida. La edición está bloqueada para proteger el historial comercial.'

  const ensureQuoteIsEditable = () => {
    if (!isLockedQuote) return true

    toast.error(lockedQuoteMessage)
    return false
  }

  const requestChangeReason = async (changeType: string) => {
    if (!selectedQuote) return null

    if (!requiresChangeReason) return ''

    return new Promise<string | null>((resolve) => {
      postApprovalResolveRef.current = resolve
      postApprovalReasonRef.current = ''
      setPostApprovalReason('')
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

                  <CardContent className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-5">
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
                        Origen
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.origen || 'N/A'}
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
                        Commodity
                      </p>

                      <p className="font-semibold text-slate-900 dark:text-white">
                        {selectedQuote.mercancia || selectedQuote.commodity || 'N/A'}
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

                  <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    <div className="col-span-full border-b border-slate-200 pb-2 dark:border-slate-800">
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
                        }}
                        placeholder="Seleccionar agente/proveedor"
                        className={cn(fieldClass, 'mt-1 w-full')}
                      />
                    </div>

                    <div className="col-span-full border-b border-slate-200 pb-2 pt-2 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Costos
                      </h3>
                    </div>

                    {quotationContainers.length > 0 && (
                      <div className="col-span-full space-y-3">
                        <p className={labelClass}>
                          Costos del proveedor por contenedor
                        </p>

                        {quotationContainers.map((container) => {
                          const currentLine = containerRateLines.find(
                            (line) => line.quotation_container_id === container.id
                          )

                          return (
                            <div
                              key={container.id}
                              className={cn(
                                mutedCardClass,
                                'grid items-center gap-3 p-3 md:grid-cols-[1fr_220px_140px]'
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
                                        container_type_name: container.container_type_name,
                                        quantity: container.quantity,
                                        ocean_freight: value,
                                      },
                                    ]
                                  })
                                }}
                                className={fieldClass}
                              />

                              <p className={cn(valueClass, 'text-right')}>
                                USD{' '}
                                {formatCurrency(
                                  Number(container.quantity || 0) *
                                    Number(currentLine?.ocean_freight || 0)
                                )}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {quotationContainers.length === 0 && (
                      <div>
                        <label className={labelClass}>
                          Costo proveedor
                        </label>

                        <input
                          name="ocean_freight"
                          placeholder="Ocean Freight"
                          value={agentForm.ocean_freight}
                          onChange={handleAgentChange}
                          className={cn(fieldClass, 'mt-1 w-full')}
                        />
                      </div>
                    )}

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

                    <div className="col-span-full border-b border-slate-200 pb-2 pt-2 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Tránsito
                      </h3>
                    </div>

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
                        Carrier
                      </label>

                      <input
                        className={cn(fieldClass, 'mt-1 w-full')}
                        placeholder="Carrier / Naviera"
                        value={agentForm.carrier}
                        onChange={(e) =>
                          setAgentForm({ ...agentForm, carrier: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <label className={labelClass}>
                        Transbordo
                      </label>

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

                    <div className="col-span-full rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-700/40 dark:bg-emerald-950/40">
                      <p className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">
                        Costo base Sari
                      </p>

                      <p className="mt-2 text-3xl font-bold text-emerald-700">
                        {agentForm.moneda || 'USD'}{' '}
                        {agentTotalCost.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {suggestedSales.map((item) => (
                          <div
                            key={item.margin}
                            className={cn(
                              mutedCardClass,
                              'border border-emerald-100 p-3 dark:border-slate-800 dark:bg-slate-950/70'
                            )}
                          >
                            <p className="text-xs text-gray-500">
                              +{item.margin}%
                            </p>

                            <p className="mt-1 font-bold text-emerald-700">
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

                    <button
                      onClick={saveAgentQuote}
                      disabled={isLockedQuote}
                      className="col-span-full rounded-xl bg-zinc-950 px-6 py-3 font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    >
                      {editingAgentQuoteId ? 'Actualizar Tarifa' : 'Guardar Tarifa'}
                    </button>
                  </CardContent>
                </Card>

                <div
                  ref={agentQuotesSectionRef}
                  className={cn(cardClass, 'p-6')}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Tarifas de Agentes
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Compara opciones por costo, transito, carrier y rentabilidad.
                      </p>
                    </div>
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
                              {getAgentQuoteProviderName(fastestQuote)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {Number(fastestQuote?.transit_time || fastestQuote?.transit || 0)} días
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
                                  {activeQuote.carrier || 'Carrier N/A'} •{' '}
                                  {activeQuote.transit_time ||
                                    activeQuote.transit ||
                                    'N/A'}{' '}
                                  días
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

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {agentQuotes.map((quote) => {
                              const finalSariCost = getAgentQuoteFinalCost(quote)
                              const baseCost = getAgentQuoteBaseCost(quote)
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
                                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        {quote.carrier || 'Carrier N/A'} -{' '}
                                        {quote.transit_time || quote.transit || 'N/A'} dias
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
                                        disabled={isLockedQuote || isSelected}
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                                        title="Eliminar tarifa"
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>

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

                                  <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
                                    <div>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        Carrier:
                                      </span>{' '}
                                      {quote.carrier || 'N/A'}
                                    </div>

                                    <div>
                                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                                        Vigencia:
                                      </span>{' '}
                                      {quote.valid_until ||
                                        quote.validity_date ||
                                        'N/A'}
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
                                      disabled={isLockedQuote || isSelected}
                                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      Editar
                                    </button>

                                    <button
                                      type="button"
                                      disabled={isLockedQuote || isSelected}
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
                    <div className="grid grid-cols-4 gap-4">
                      <select
                        name="item_type"
                        value={pricingForm.item_type}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      >
                        <option value="Flete">Flete</option>
                        <option value="Origen">Origen</option>
                        <option value="Destino">Destino</option>
                        <option value="Seguro">Seguro</option>
                        <option value="Documentación">Documentación</option>
                        <option value="Aduana">Aduana</option>
                        <option value="Inland">Inland</option>
                        <option value="Profit">Profit</option>
                        <option value="Otro">Otro</option>
                      </select>

                      <input
                        name="description"
                        placeholder="Descripción"
                        value={pricingForm.description}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <input
                        name="cost_amount"
                        placeholder="Costo"
                        value={pricingForm.cost_amount}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <input
                        type="number"
                        placeholder="QTY"
                        value={pricingForm.quantity}
                        onChange={(e) =>
                          setPricingForm({
                            ...pricingForm,
                            quantity: e.target.value,
                          })
                        }
                        className="border p-3 rounded-xl"
                      />

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pricingForm.taxable}
                          onChange={(e) =>
                            setPricingForm({
                              ...pricingForm,
                              taxable: e.target.checked,
                            })
                          }
                        />

                        Gravable ISV 15%
                      </label>

                      <input
                        name="sale_amount"
                        placeholder="Venta"
                        value={pricingForm.sale_amount}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <select
                        name="currency"
                        value={pricingForm.currency}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      >
                        <option value="USD">USD</option>
                        <option value="HNL">HNL</option>
                      </select>

                      <input
                        name="supplier"
                        placeholder="Proveedor"
                        value={pricingForm.supplier}
                        onChange={handlePricingChange}
                        className="border p-3 rounded"
                      />

                      <input
                        name="notes"
                        placeholder="Notas"
                        value={pricingForm.notes}
                        onChange={handlePricingChange}
                        className="border p-3 rounded col-span-2"
                      />

                      <button
                        onClick={savePricingItem}
                        disabled={isLockedQuote}
                        className="bg-zinc-950 text-white px-6 py-3 rounded-xl col-span-4"
                      >
                        Agregar Cargo Adicional
                      </button>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
                      <p className="text-slate-400">
                        Subtotal: USD {subtotal.toFixed(2)}
                      </p>

                      <p className="text-slate-400">
                        ISV: USD {taxAmount.toFixed(2)}
                      </p>

                      <p className="mt-2 text-lg font-bold text-white">
                        Total: USD {totalAmount.toFixed(2)}
                      </p>
                    </div>
                      </>
                    )}

                    {isMiamiFlow && (
                      <section className={cn(cardClass, 'p-5')}>
                        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
                          Gestión operativa Miami
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Esta cotización usa tarifas propias de Sari Express. No requiere comparativo de agentes.
                        </p>

                        <div className="mt-4 grid gap-4 md:grid-cols-4">
                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Producto</p>
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {selectedQuote.service_product === 'miami_lcl'
                                ? 'Miami Consolidado LCL'
                                : 'Miami Consolidado Aéreo'}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Incoterm</p>
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {selectedQuote.incoterm || 'N/A'}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Origen</p>
                            <p className="font-semibold text-slate-950 dark:text-white">
                              {selectedQuote.origen || 'N/A'}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Destino</p>
                            <p className="font-semibold text-slate-950 dark:text-white">
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
                            <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                              Editar carga / Recalcular Miami
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              Ajusta piezas, dimensiones y peso para recalcular volumen y libras.
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveCargoLines}
                              disabled={isLockedQuote || savingCargo}
                              className={primaryButtonClass}
                            >
                              {savingCargo ? 'Guardando...' : 'Guardar carga'}
                            </button>

                            <button
                              type="button"
                              className={secondaryButtonClass}
                              disabled={
                                isLockedQuote ||
                                savingCargo ||
                                !['miami_lcl', 'miami_air'].includes(
                                  selectedQuote.service_product
                                )
                              }
                              onClick={recalculateMiamiPricing}
                            >
                              Recalcular tarifas
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 space-y-4">
                          {cargoLines.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              No hay líneas de carga registradas.
                            </p>
                          ) : (
                            cargoLines.map((line, index) => (
                              <div
                                key={line.id}
                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/40"
                              >
                                <div className="mb-3 flex items-center justify-between">
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    Línea #{index + 1}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCargoLines((prev) =>
                                        prev.filter((item) => item.id !== line.id)
                                      )
                                    }
                                    className="text-sm font-semibold text-red-600 hover:text-red-700"
                                  >
                                    Quitar
                                  </button>
                                </div>

                                <div className="grid gap-3 md:grid-cols-3">
                                  <input
                                    className={fieldClass}
                                    type="number"
                                    value={line.quantity ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'quantity', e.target.value)
                                    }
                                    placeholder="Cantidad"
                                  />
                                  <input
                                    className={fieldClass}
                                    value={line.package_type ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'package_type', e.target.value)
                                    }
                                    placeholder="Tipo de paquete"
                                  />
                                  <input
                                    className={fieldClass}
                                    type="number"
                                    value={line.weight_lbs ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'weight_lbs', e.target.value)
                                    }
                                    placeholder="Peso lbs"
                                  />
                                </div>

                                <div className="mt-3 grid gap-3 md:grid-cols-4">
                                  <input
                                    className={fieldClass}
                                    type="number"
                                    value={line.length ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'length', e.target.value)
                                    }
                                    placeholder="Largo"
                                  />
                                  <input
                                    className={fieldClass}
                                    type="number"
                                    value={line.width ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'width', e.target.value)
                                    }
                                    placeholder="Ancho"
                                  />
                                  <input
                                    className={fieldClass}
                                    type="number"
                                    value={line.height ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'height', e.target.value)
                                    }
                                    placeholder="Alto"
                                  />
                                  <input
                                    className={fieldClass}
                                    value={line.dimension_unit ?? ''}
                                    onChange={(e) =>
                                      updateCargoLine(line.id, 'dimension_unit', e.target.value)
                                    }
                                    placeholder="Unidad"
                                  />
                                </div>
                              </div>
                            ))
                          )}
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
                          disabled={isLockedQuote}
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

                    {pricingItems.length === 0 ? (
                      <p className="text-gray-500">
                        No hay líneas de cotización.
                      </p>
                    ) : (
                      <table className="w-full text-left">
                        <thead className="bg-zinc-950 text-white">
                          <tr>
                            <th className="p-2 text-xs uppercase text-gray-500">Descripción</th>
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
                            const tax = item.taxable ? subtotal * 0.15 : 0
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
                                </td>

                                <td className="p-2 text-sm">
                                  {editingPricingItemId === item.id ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => updatePricingItem(item)}
                                        disabled={isLockedQuote}
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
                                        disabled={isLockedQuote}
                                        className="text-blue-600 font-medium"
                                      >
                                        Modificar
                                      </button>

                                      <button
                                        onClick={() => deletePricingItem(item.id)}
                                        disabled={isLockedQuote}
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

                
<div className="flex flex-col justify-end gap-3 sm:flex-row">
  <button
    onClick={approvePricing}
    disabled={isLockedQuote}
    className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
  >
    Aprobar Pricing
  </button>

  <button
    onClick={markAsSentToClient}
    className="rounded-xl bg-green-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-green-700"
  >
    Marcar como Enviada al Cliente
  </button>
</div>

                <Card className={cardClass}>
                  <CardHeader>
                    <CardTitle>Resumen Comercial</CardTitle>
                  </CardHeader>

                  <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Costo Base Sari</p>
                      <p className="text-xl font-bold">
                        USD {formatCurrency(totalCost)}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Venta Cliente</p>
                      <p className="text-xl font-bold">
                        USD {formatCurrency(totalSale)}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Profit</p>
                      <p
                        className={`text-xl font-bold ${
                          profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        USD {formatCurrency(profit)}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">GP %</p>
                      <p
                        className={`text-xl font-bold ${
                          gpPercentage >= 15
                            ? 'text-green-600'
                            : gpPercentage >= 8
                            ? 'text-orange-500'
                            : 'text-red-600'
                        }`}
                      >
                        {gpPercentage.toFixed(2)}%
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Target Cliente</p>
                      <p className="text-xl font-bold">
                        {targetRate > 0
                          ? `USD ${formatCurrency(targetRate)}`
                          : 'N/A'}
                      </p>
                    </div>

                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-gray-500">Vs Target</p>

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
              Gravable ISV 15%
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
              disabled={isLockedQuote || savingMiamiCharge}
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
              disabled={isLockedQuote || selectingRate}
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
            <DialogTitle>Cotizacion ya enviada al cliente</DialogTitle>

            <DialogDescription>
              Esta cotizacion ya fue aprobada o enviada al cliente. Debes
              registrar el motivo del cambio para mantener trazabilidad.
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

