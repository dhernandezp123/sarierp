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
  type OriginCharge,
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
  initialPricingItems?: MiamiExistingPricingItem[]
}

type MiamiExistingPricingItem = {
  id?: string
  rate_code?: string | null
  description: string | null
  item_type: string | null
  sale_amount: number | string | null
  total_amount?: number | string | null
  taxable?: boolean | null
}

export function useMiamiQuotation({
  clienteId,
  serviceProduct,
  incoterm,
  totalCargoFt3,
  totalCargoCbm,
  totalCargoWeight,
  createdBy,
  initialPricingItems = [],
}: UseMiamiQuotationParams) {
  const [clientRates, setClientRates] = useState<ClientRate[]>([])
  const [surchargeRules, setSurchargeRules] = useState<SurchargeRule[]>([])
  const [showClientRates, setShowClientRates] = useState(false)
  const [pickupMode, setPickupMode] = useState<'none' | 'standard' | 'manual'>(
    'none'
  )
  const [manualPickupAmount, setManualPickupAmount] = useState(0)
  const [originCharges, setOriginCharges] = useState<OriginCharge[]>([])
  const [destinationCharges, setDestinationCharges] = useState<
    DestinationCharge[]
  >([])
  const [miamiOptions, setMiamiOptions] = useState<MiamiOptions>({
    applyStandardCharges: true,
    taxStandardDestinationCharges: false,
    includeAirDocumentsHandling: false,
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
  const [hydratedPricingItemsKey, setHydratedPricingItemsKey] = useState('')

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

  const automaticRateCodes = new Set([
    'small_maritimo_min_lcl_1000_lbs_45_ft3',
    'minimo_maritimo_2mil_lbs_90_ft3',
    'lcl_maritimo_sps_ft3',
    'lcl_maritimo_sps_lbs',
    'consolidado_aereo_kg',
    'delivery_miami',
    'recolectas_internas',
    'documentos_manejo',
    'desconsolidar',
    'bl',
    'sed',
    'hazmat_imo_charge_line',
    'declaracion_imo',
    'certificado_imo',
  ])

  const originChargeRates = clientRates.filter((rate) => {
    const amount = Number(rate.amount || 0)
    const category = (rate.category || '').toLowerCase()

    return (
      amount > 0 &&
      category === 'otros cargos' &&
      !automaticRateCodes.has(rate.rate_code)
    )
  })

  const airDocumentsHandlingRate = getClientRate('documentos_manejo')

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

  const AIR_MIN_SMALL = 270   // < 22 kg  (< ~50 lbs)
  const AIR_MIN_LARGE = 375   // 22–40 kg (~50–90 lbs)
  const AIR_KG_THRESHOLD_SMALL = 22
  const AIR_KG_THRESHOLD_LARGE = 40

  const airChargeableKg = Number(miamiCalc.kg || 0)
  const airCalculated   = airChargeableKg * miamiAirKgRate

  let airEstimated       = airCalculated
  let airMinimumApplied  = 0

  if (airChargeableKg > 0 && airChargeableKg < AIR_KG_THRESHOLD_SMALL) {
    airEstimated      = Math.max(airCalculated, AIR_MIN_SMALL)
    airMinimumApplied = AIR_MIN_SMALL
  } else if (airChargeableKg >= AIR_KG_THRESHOLD_SMALL && airChargeableKg <= AIR_KG_THRESHOLD_LARGE) {
    airEstimated      = Math.max(airCalculated, AIR_MIN_LARGE)
    airMinimumApplied = AIR_MIN_LARGE
  }

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
      originCharges,
      destinationCharges,
      miamiOptions,
      lclEstimated,
      lclByFt3,
      lclByLbs,
      minimumApplied: miamiLclResult.minimumApplied,
      airEstimated,
      airChargeableKg,
      airMinimumApplied,
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
      kg:
        serviceProduct === 'miami_air' && totalCargoWeight
          ? (totalCargoWeight / 2.20462).toFixed(2)
          : prev.kg,
    }))
  }, [
    isMiamiFlow,
    serviceProduct,
    totalCargoFt3,
    totalCargoCbm,
    totalCargoWeight,
  ])

  useEffect(() => {
    if (!isMiamiFlow || initialPricingItems.length === 0) return

    const hydrationKey = `${serviceProduct}:${initialPricingItems
      .map((item) => item.id || item.description || '')
      .join('|')}`

    if (hydratedPricingItemsKey === hydrationKey) return
    if (clienteId && clientRates.length === 0) return

    const normalizedStandardLabels = [
      'bl',
      'sed',
      'documentos_manejo',
      'desconsolidar',
    ]
      .map((code) => getClientRate(code)?.rate_label?.toLowerCase())
      .filter(Boolean) as string[]

    const conditionalRates = [
      { code: 'hazmat_imo_charge_line', option: 'isHazmat' },
      { code: 'declaracion_imo', option: 'isImo' },
      { code: 'certificado_imo', option: 'includeImoCertificate' },
    ] as const

    const standardCodes = new Set(['bl', 'sed', 'documentos_manejo', 'desconsolidar'])
    const autoCalculatedCodes = new Set([
      'miami_lcl_freight',
      'miami_air_freight',
      'bunker_emergency_surcharge',
    ])
    const conditionalCodeMap: Record<string, keyof MiamiOptions> = {
      hazmat_imo_charge_line: 'isHazmat',
      declaracion_imo: 'isImo',
      certificado_imo: 'includeImoCertificate',
    }

    const nextDestinationCharges: DestinationCharge[] = []
    const nextOriginCharges: OriginCharge[] = []
    let nextPickupMode: 'none' | 'standard' | 'manual' = 'none'
    let nextManualPickupAmount = 0
    let hasStandardCharge = false
    let hasTaxableStandardDestinationCharge = false
    const nextMiamiOptions = { ...miamiOptions }

    initialPricingItems.forEach((item) => {
      const description = item.description || ''
      const normalizedDescription = description.toLowerCase()
      const amount = Number(item.sale_amount || item.total_amount || 0)
      const itemType = item.item_type || ''
      const rateCode = item.rate_code || null

      if (amount <= 0) return

      // --- Path A: item has rate_code (new items) ---
      if (rateCode) {
        if (autoCalculatedCodes.has(rateCode) || rateCode.startsWith('bunker_')) return

        if (rateCode === 'pickup_recolecta') {
          nextPickupMode = 'manual'
          nextManualPickupAmount = amount
          return
        }

        if (standardCodes.has(rateCode)) {
          if (
            serviceProduct === 'miami_air' &&
            rateCode === 'documentos_manejo'
          ) {
            nextMiamiOptions.includeAirDocumentsHandling = true
            return
          }

          hasStandardCharge = true
          if (item.taxable && (rateCode === 'documentos_manejo' || rateCode === 'desconsolidar')) {
            hasTaxableStandardDestinationCharge = true
          }
          return
        }

        if (rateCode in conditionalCodeMap) {
          nextMiamiOptions[conditionalCodeMap[rateCode]] = true
          return
        }

        if (rateCode.startsWith('destination_charge:')) {
          nextDestinationCharges.push({
            id: item.id || crypto.randomUUID(),
            description,
            amount: String(amount),
            taxable: Boolean(item.taxable),
          })
          return
        }

        if (rateCode.startsWith('origin_charge:')) {
          const [, sourceRateCode = ''] = rateCode.split(':')
          nextOriginCharges.push({
            id: item.id || crypto.randomUUID(),
            rateCode: sourceRateCode,
            description,
            amount: String(amount),
            taxable: Boolean(item.taxable),
          })
          return
        }

        return
      }

      // --- Path B: legacy items without rate_code — string matching fallback ---
      if (
        normalizedDescription.includes('flete miami') ||
        normalizedDescription.includes('bunker')
      ) {
        return
      }

      if (
        normalizedDescription.includes('pickup') ||
        normalizedDescription.includes('recolecta')
      ) {
        nextPickupMode = 'manual'
        nextManualPickupAmount = amount
        return
      }

      if (itemType === 'origin_charge') {
        const documentsHandlingLabel =
          getClientRate('documentos_manejo')?.rate_label?.toLowerCase()

        if (
          serviceProduct === 'miami_air' &&
          documentsHandlingLabel &&
          normalizedDescription === documentsHandlingLabel
        ) {
          nextMiamiOptions.includeAirDocumentsHandling = true
          return
        }

        const matchingOriginRate = originChargeRates.find(
          (rate) => rate.rate_label.toLowerCase() === normalizedDescription
        )

        nextOriginCharges.push({
          id: item.id || crypto.randomUUID(),
          rateCode: matchingOriginRate?.rate_code || '',
          description,
          amount: String(amount),
          taxable: Boolean(item.taxable),
        })
        return
      }

      const isStandardCharge = normalizedStandardLabels.some(
        (label) => label && normalizedDescription === label
      )

      if (isStandardCharge) {
        hasStandardCharge = true
        if (
          item.taxable &&
          (itemType === 'destination_charge' ||
            normalizedDescription.includes('manejo') ||
            normalizedDescription.includes('desconsolidar'))
        ) {
          hasTaxableStandardDestinationCharge = true
        }
        return
      }

      const conditionalRate = conditionalRates.find((rate) => {
        const label = getClientRate(rate.code)?.rate_label?.toLowerCase()
        return label && normalizedDescription === label
      })

      if (conditionalRate) {
        nextMiamiOptions[conditionalRate.option] = true
        return
      }

      nextDestinationCharges.push({
        id: item.id || crypto.randomUUID(),
        description,
        amount: String(amount),
        taxable: Boolean(item.taxable),
      })
    })

    setPickupMode(nextPickupMode)
    setManualPickupAmount(nextManualPickupAmount)
    setOriginCharges(nextOriginCharges)
    setDestinationCharges(nextDestinationCharges)
    setMiamiOptions({
      ...nextMiamiOptions,
      includeAirDocumentsHandling:
        nextMiamiOptions.includeAirDocumentsHandling || false,
      applyStandardCharges: hasStandardCharge,
      taxStandardDestinationCharges:
        hasTaxableStandardDestinationCharge ||
        miamiOptions.taxStandardDestinationCharges,
    })
    setHydratedPricingItemsKey(hydrationKey)
  }, [
    isMiamiFlow,
    serviceProduct,
    clienteId,
    clientRates,
    initialPricingItems,
    hydratedPricingItemsKey,
    miamiOptions,
    getClientRate,
    originChargeRates,
  ])

  return {
    clientRates,
    surchargeRules,
    showClientRates,
    setShowClientRates,
    pickupMode,
    setPickupMode,
    manualPickupAmount,
    setManualPickupAmount,
    originCharges,
    setOriginCharges,
    originChargeRates,
    airDocumentsHandlingRate,
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
    airChargeableKg,
    airMinimumApplied,
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
