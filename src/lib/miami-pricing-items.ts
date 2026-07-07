import { usesClientRates } from '@/src/lib/quotation-products'
import { calculateTaxAmount, normalizeTaxRatePercent } from '@/src/lib/tax'

export type ClientRate = {
  id?: string
  cliente_id: string
  rate_code: string
  rate_label: string
  category: string
  unit: string | null
  currency: string
  amount: number
  is_active: boolean
  valid_from: string | null
  valid_to: string | null
  notes: string | null
}

export type SurchargeRule = {
  code: string
  label: string
  service_product: string
  calculation_type: string
  rate_per_lbs: number | string | null
  rate_per_ft3: number | string | null
  fixed_amount: number | string | null
  minimum_amount: number | string | null
  currency: string | null
  is_active: boolean
}

export type DestinationCharge = {
  id: string
  description: string
  amount: string
  taxable: boolean
}

export type OriginCharge = {
  id: string
  rateCode: string
  description: string
  amount: string
  taxable: boolean
}

export type MiamiOptions = {
  applyStandardCharges: boolean
  taxStandardDestinationCharges: boolean
  includeAirDocumentsHandling: boolean
  isImo: boolean
  isHazmat: boolean
  includeImoCertificate: boolean
}

export type MiamiPricingItemInput = {
  quotationId: string
  serviceProduct: string
  clientRates: ClientRate[]
  originCharges: OriginCharge[]
  destinationCharges: DestinationCharge[]
  miamiOptions: MiamiOptions
  lclEstimated: number
  lclByFt3: number
  lclByLbs: number
  minimumApplied: number
  airEstimated: number
  airChargeableKg: number
  airMinimumApplied: number
  bunkerRule?: SurchargeRule | null
  bunkerAmount: number
  pickupAmount: number
  applyStandardCharges: boolean
  taxRatePercent?: number | string | null
  createdBy?: string | null
}

export function buildMiamiPricingItems({
  quotationId,
  serviceProduct,
  clientRates,
  originCharges,
  destinationCharges,
  miamiOptions,
  lclEstimated,
  lclByFt3,
  lclByLbs,
  minimumApplied,
  airEstimated,
  airChargeableKg,
  airMinimumApplied,
  bunkerRule,
  bunkerAmount,
  pickupAmount,
  applyStandardCharges,
  taxRatePercent,
  createdBy,
}: MiamiPricingItemInput) {
  if (!usesClientRates(serviceProduct)) return []

  const normalizedTaxRate = normalizeTaxRatePercent(taxRatePercent)

  const getClientRate = (code: string) =>
    clientRates.find((item) => item.rate_code === code)

  const originItems = originCharges
    .filter((charge) => Number(charge.amount || 0) > 0)
    .map((charge) => {
      const amount = Number(charge.amount || 0)
      const taxAmount = calculateTaxAmount(charge.taxable, amount, normalizedTaxRate)
      const sourceRate = getClientRate(charge.rateCode)
      const description =
        charge.description || sourceRate?.rate_label || 'Cargo en origen'

      return {
        quotation_id: quotationId,
        rate_code: `origin_charge:${charge.rateCode}:${charge.id}`,
        description,
        item_type: 'origin_charge',
        quantity: 1,
        cost_amount: 0,
        sale_amount: amount,
        currency: sourceRate?.currency || 'USD',
        taxable: charge.taxable,
        tax_rate: charge.taxable ? normalizedTaxRate : 0,
        tax_amount: taxAmount,
        total_amount: amount + taxAmount,
        supplier: 'Sari Express',
        created_by: createdBy || null,
        notes: charge.taxable
          ? `Cargo adicional en origen gravable con ISV ${normalizedTaxRate}%.`
          : 'Cargo adicional en origen.',
      }
    })

  const destinationItems = destinationCharges
    .filter((charge) => Number(charge.amount || 0) > 0)
    .map((charge) => {
      const amount = Number(charge.amount || 0)
      const taxAmount = calculateTaxAmount(charge.taxable, amount, normalizedTaxRate)
      const description = charge.description || 'Cargo en destino'
      const normalizedDescription = description.toLowerCase()
      const itemType =
        normalizedDescription.includes('aduana') ||
        normalizedDescription.includes('entrega') ||
        normalizedDescription.includes('delivery') ||
        normalizedDescription.includes('destino')
          ? 'destination_charge'
          : 'other_charge'

      return {
        quotation_id: quotationId,
        rate_code: `destination_charge:${charge.id}`,
        description,
        item_type: itemType,
        quantity: 1,
        cost_amount: 0,
        sale_amount: amount,
        currency: 'USD',
        taxable: charge.taxable,
        tax_rate: charge.taxable ? normalizedTaxRate : 0,
        tax_amount: taxAmount,
        total_amount: amount + taxAmount,
        supplier: 'Sari Express',
        created_by: createdBy || null,
        notes: charge.taxable
          ? `Cargo en destino gravable con ISV ${normalizedTaxRate}%.`
          : 'Cargo adicional en destino.',
      }
    })

  if (serviceProduct === 'miami_lcl') {
    const items = [
      {
        quotation_id: quotationId,
        rate_code: 'miami_lcl_freight',
        description: 'Flete Miami LCL',
        item_type: 'freight',
        quantity: 1,
        cost_amount: 0,
        sale_amount: lclEstimated,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: lclEstimated,
        currency: 'USD',
        taxable: false,
        supplier: 'Sari Express',
        notes: `Cálculo automático: FT3 USD ${lclByFt3.toFixed(
          2
        )} vs LBS USD ${lclByLbs.toFixed(
          2
        )}. Mínimo aplicado USD ${minimumApplied.toFixed(2)}.`,
        created_by: createdBy,
      },
    ]

    if (bunkerRule && bunkerAmount > 0) {
      items.push({
        quotation_id: quotationId,
        rate_code: bunkerRule.code,
        description: bunkerRule.label,
        item_type: 'freight',
        quantity: 1,
        cost_amount: 0,
        sale_amount: bunkerAmount,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: bunkerAmount,
        currency: bunkerRule.currency || 'USD',
        taxable: false,
        supplier: 'Sari Express',
        notes: `Cálculo automático: MAX(lbs x ${Number(
          bunkerRule.rate_per_lbs || 0
        ).toFixed(2)}, ft3 x ${Number(
          bunkerRule.rate_per_ft3 || 0
        ).toFixed(2)}, mínimo USD ${Number(
          bunkerRule.minimum_amount || 0
        ).toFixed(2)}).`,
        created_by: createdBy,
      })
    }

    if (pickupAmount > 0) {
      items.push({
        quotation_id: quotationId,
        rate_code: 'pickup_recolecta',
        description: 'Pickup / Recolecta Interna',
        item_type: 'origin_charge',
        quantity: 1,
        cost_amount: 0,
        sale_amount: pickupAmount,
        currency: 'USD',
        taxable: false,
        supplier: 'Sari Express',
        tax_rate: 0,
        tax_amount: 0,
        total_amount: pickupAmount,
        created_by: createdBy || null,
        notes: 'Aplicado automáticamente por Incoterm EXW.',
      })
    }

    const standardChargeCodes = applyStandardCharges
      ? ['bl', 'sed', 'documentos_manejo', 'desconsolidar']
      : []

    const conditionalChargeCodes = [
      miamiOptions.isHazmat ? 'hazmat_imo_charge_line' : null,
      miamiOptions.isImo ? 'declaracion_imo' : null,
      miamiOptions.includeImoCertificate ? 'certificado_imo' : null,
    ].filter(Boolean) as string[]

    ;[...standardChargeCodes, ...conditionalChargeCodes].forEach((code) => {
      const rate = getClientRate(code)
      const amount = Number(rate?.amount || 0)

      if (!rate || amount <= 0) return

      const isStandardDestinationCharge =
        code === 'documentos_manejo' || code === 'desconsolidar'
      const isTaxable =
        isStandardDestinationCharge &&
        miamiOptions.taxStandardDestinationCharges
      const taxAmount = calculateTaxAmount(isTaxable, amount, normalizedTaxRate)

      items.push({
        quotation_id: quotationId,
        rate_code: code,
        description: rate.rate_label,
        item_type:
          isStandardDestinationCharge
            ? 'destination_charge'
            : 'origin_charge',
        quantity: 1,
        cost_amount: 0,
        sale_amount: amount,
        tax_rate: isTaxable ? normalizedTaxRate : 0,
        tax_amount: taxAmount,
        total_amount: amount + taxAmount,
        currency: rate.currency || 'USD',
        taxable: isTaxable,
        supplier: 'Sari Express',
        notes: isTaxable
          ? `Cargo estándar en destino gravable con ISV ${normalizedTaxRate}%.`
          : 'Cargo aplicado automáticamente según configuración Miami LCL.',
        created_by: createdBy,
      })
    })

    return [...items, ...originItems, ...destinationItems]
  }

  if (serviceProduct === 'miami_air') {
    const airNotes = airMinimumApplied > 0
      ? `Mínimo aéreo aplicado USD ${airMinimumApplied.toFixed(2)} (${airChargeableKg.toFixed(2)} kg facturable).`
      : `Cálculo automático: ${airChargeableKg.toFixed(2)} KG x tarifa cliente.`

    const items = [
      {
        quotation_id: quotationId,
        rate_code: 'miami_air_freight',
        description: 'Flete Miami Aéreo Consolidado',
        item_type: 'freight',
        quantity: 1,
        cost_amount: 0,
        sale_amount: airEstimated,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: airEstimated,
        currency: 'USD',
        taxable: false,
        supplier: 'Sari Express',
        notes: airNotes,
        created_by: createdBy,
      },
    ]

    if (pickupAmount > 0) {
      items.push({
        quotation_id: quotationId,
        rate_code: 'pickup_recolecta',
        description: 'Pickup / Recolecta Interna',
        item_type: 'origin_charge',
        quantity: 1,
        cost_amount: 0,
        sale_amount: pickupAmount,
        currency: 'USD',
        taxable: false,
        supplier: 'Sari Express',
        tax_rate: 0,
        tax_amount: 0,
        total_amount: pickupAmount,
        created_by: createdBy || null,
        notes: 'Aplicado automáticamente por Incoterm EXW.',
      })
    }

    if (miamiOptions.includeAirDocumentsHandling) {
      const documentsHandlingRate = getClientRate('documentos_manejo')
      const amount = Number(documentsHandlingRate?.amount || 0)

      if (documentsHandlingRate && amount > 0) {
        items.push({
          quotation_id: quotationId,
          rate_code: 'documentos_manejo',
          description: documentsHandlingRate.rate_label,
          item_type: 'origin_charge',
          quantity: 1,
          cost_amount: 0,
          sale_amount: amount,
          currency: documentsHandlingRate.currency || 'USD',
          taxable: false,
          supplier: 'Sari Express',
          tax_rate: 0,
          tax_amount: 0,
          total_amount: amount,
          created_by: createdBy || null,
          notes: 'Cargo de origen aplicado desde tarifa activa del cliente.',
        })
      }
    }

    return [...items, ...originItems, ...destinationItems]
  }

  return []
}
