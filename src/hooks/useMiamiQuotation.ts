'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { supabase } from '@/src/lib/supabase/client'
import { calculateMiamiLcl } from '@/src/lib/miami-lcl-calculator'
import { usesClientRates } from '@/src/lib/quotation-products'
import {
  buildMiamiPricingItems as buildMiamiPricingItemsPayload,
  type ClientRate,
  type DestinationCharge,
  type MiamiOptions,
  type SurchargeRule,
} from '@/src/lib/miami-pricing-items'

type UseMiamiQuotationParams = {
  clienteId: string
  serviceProduct: string
  incoterm: string
  totalCargoFt3: number
  totalCargoCbm: number
  totalCargoWeight: number
  createdBy?: string | null
}

export function useMiamiQuotation({
  clienteId,
  serviceProduct,
  incoterm,
  totalCargoFt3,
  totalCargoCbm,
  totalCargoWeight,
  createdBy,
}: UseMiamiQuotationParams) {
  const [clientRates, setClientRates] = useState<ClientRate[]>([])
  const [surchargeRules, setSurchargeRules] = useState<SurchargeRule[]>([])
  const [showClientRates, setShowClientRates] = useState(false)
  const [pickupMode, setPickupMode] = useState<'none' | 'standard' | 'manual'>(
    'none'
  )
  const [manualPickupAmount, setManualPickupAmount] = useState(0)
  const [destinationCharges, setDestinationCharges] = useState<
    DestinationCharge[]
  >([])
  const [miamiOptions, setMiamiOptions] = useState<MiamiOptions>({
    applyStandardCharges: true,
    taxStandardDestinationCharges: false,
    isImo: false,
    isHazmat: false,
    includeImoCertificate: false,
  })
  const [miamiCalc, setMiamiCalc] = useState({
    ft3: '',
    lbs: '',
    cbm: '',
    kg: '',
  })

  useEffect(() => {
    loadSurchargeRules(serviceProduct)

    if (!clienteId || !usesClientRates(serviceProduct)) {
      setClientRates([])
      return
    }

    loadClientRates(clienteId)
  }, [clienteId, serviceProduct])

  const loadClientRates = async (clientId: string) => {
    const { data, error } = await supabase
      .from('client_rates')
      .select('*')
      .eq('cliente_id', clientId)
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('rate_label', { ascending: true })

    if (error) {
      toast.error('No se pudieron cargar las tarifas del cliente')
      return
    }

    setClientRates((data || []) as ClientRate[])
  }

  const loadSurchargeRules = async (product: string) => {
    if (!product) {
      setSurchargeRules([])
      return
    }

    const { data, error } = await supabase
      .from('surcharge_rules')
      .select('*')
      .eq('service_product', product)
      .eq('is_active', true)

    if (error) {
      console.error('Error cargando surcharges:', error)
      setSurchargeRules([])
      return
    }

    setSurchargeRules((data || []) as SurchargeRule[])
  }

  const getClientRateAmount = (code: string) => {
    const rate = clientRates.find((item) => item.rate_code === code)
    return Number(rate?.amount || 0)
  }

  const getClientRate = (code: string) =>
    clientRates.find((item) => item.rate_code === code)

  const miamiLclFt3Rate = getClientRateAmount('lcl_maritimo_sps_ft3')
  const miamiLclLbsRate = getClientRateAmount('lcl_maritimo_sps_lbs')
  const miamiLclSmallMinimum = getClientRateAmount(
    'small_maritimo_min_lcl_1000_lbs_45_ft3'
  )
  const miamiLclLargeMinimum = getClientRateAmount(
    'minimo_maritimo_2mil_lbs_90_ft3'
  )
  const miamiAirKgRate = getClientRateAmount('consolidado_aereo_kg')

  const miamiLclResult = calculateMiamiLcl({
    ft3: Number(miamiCalc.ft3 || 0),
    lbs: Number(miamiCalc.lbs || 0),
    rateFt3: miamiLclFt3Rate,
    rateLbs: miamiLclLbsRate,
    minimumSmall: miamiLclSmallMinimum,
    minimumLarge: miamiLclLargeMinimum,
  })

  const lclByFt3 = miamiLclResult.ft3Amount
  const lclByLbs = miamiLclResult.lbsAmount
  const lclEstimated = miamiLclResult.oceanFreight

  const shouldApplyStandardCharges =
    serviceProduct === 'miami_lcl' && !miamiLclResult.isMinimum

  const applyStandardCharges =
    shouldApplyStandardCharges && miamiOptions.applyStandardCharges

  const isMiamiFlow =
    serviceProduct === 'miami_lcl' || serviceProduct === 'miami_air'
  const canUseMiamiCalculator = isMiamiFlow && !!clienteId && clientRates.length > 0

  const airEstimated = Number(miamiCalc.kg || 0) * miamiAirKgRate

  const pickupRate =
    getClientRateAmount('recolectas_internas') ||
    getClientRateAmount('delivery_miami')

  const bunkerRule = surchargeRules.find(
    (rule) => rule.code === 'bunker_emergency_surcharge'
  )

  const bunkerAmount =
    bunkerRule && serviceProduct === 'miami_lcl'
      ? Math.max(
          Number(miamiCalc.lbs || 0) * Number(bunkerRule.rate_per_lbs || 0),
          Number(miamiCalc.ft3 || 0) * Number(bunkerRule.rate_per_ft3 || 0),
          Number(bunkerRule.minimum_amount || 0)
        )
      : 0

  const pickupAmount =
    incoterm === 'EXW'
      ? pickupMode === 'standard'
        ? pickupRate
        : pickupMode === 'manual'
          ? manualPickupAmount
          : 0
      : 0

  const miamiLclTotal = lclEstimated + bunkerAmount + pickupAmount

  const buildMiamiPricingItems = (quotationId: string) =>
    buildMiamiPricingItemsPayload({
      quotationId,
      serviceProduct,
      clientRates,
      destinationCharges,
      miamiOptions,
      lclEstimated,
      lclByFt3,
      lclByLbs,
      minimumApplied: miamiLclResult.minimumApplied,
      airEstimated,
      bunkerRule,
      bunkerAmount,
      pickupAmount,
      applyStandardCharges,
      createdBy,
    })

  const buildMiamiPreviewItems = () => {
    return buildMiamiPricingItems('preview-quotation-id').map((item) => ({
      ...item,
      quotation_id: 'preview',
      id: crypto.randomUUID(),
    }))
  }

  useEffect(() => {
    if (!isMiamiFlow) return

    setMiamiCalc((prev) => ({
      ...prev,
      ft3: totalCargoFt3 ? totalCargoFt3.toFixed(2) : '',
      cbm: totalCargoCbm ? totalCargoCbm.toFixed(3) : '',
      lbs: totalCargoWeight ? totalCargoWeight.toFixed(2) : prev.lbs,
    }))
  }, [isMiamiFlow, totalCargoFt3, totalCargoCbm, totalCargoWeight])

  return {
    clientRates,
    surchargeRules,
    showClientRates,
    setShowClientRates,
    pickupMode,
    setPickupMode,
    manualPickupAmount,
    setManualPickupAmount,
    destinationCharges,
    setDestinationCharges,
    miamiOptions,
    setMiamiOptions,
    miamiCalc,
    setMiamiCalc,
    getClientRate,
    getClientRateAmount,
    miamiLclResult,
    lclByFt3,
    lclByLbs,
    lclEstimated,
    shouldApplyStandardCharges,
    applyStandardCharges,
    isMiamiFlow,
    canUseMiamiCalculator,
    airEstimated,
    pickupRate,
    bunkerRule,
    bunkerAmount,
    pickupAmount,
    miamiLclTotal,
    buildMiamiPricingItems,
    buildMiamiPreviewItems,
  }
}

export type MiamiQuotationState = ReturnType<typeof useMiamiQuotation>
