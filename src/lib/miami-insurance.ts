import type { TenantCompanySettings } from './company-settings'
import {
  calculateInsuranceDeclaration,
  DEFAULT_INSURANCE_COST_RATE_PERCENT,
  INSURANCE_MINIMUM_CHARGE_USD,
} from './insurance-calculator'
import {
  DEFAULT_INSURANCE_INCLUDED_SERVICE_PATTERNS,
  isInsurancePricingItem,
  normalizeInsuranceCoveragePatterns,
  normalizeInsuranceExclusionPatterns,
  partitionInsuranceCoverage,
  type InsuranceCoverageItem,
} from './insurance-coverage'
import { calculateTaxAmount, normalizeTaxRatePercent } from './tax'

type ServiceItem = InsuranceCoverageItem & {
  quantity?: number | string | null
  cost_amount?: number | string | null
  sale_amount?: number | string | null
}
type Settings = Pick<TenantCompanySettings, 'default_tax_rate' | 'insurance_cost_rate_percent' | 'insurance_included_service_patterns' | 'insurance_excluded_service_patterns'>
type Input<T> = {
  quotationId: string
  items: T[]
  required: boolean
  commercialValue: number
  saleRatePercent: number
  settings: Settings | null
  createdBy?: string | null
}
const money = (amount: number) => amount.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })

/** Build the requested insurance alongside the automatic Miami charges, before
 * the existing atomic create RPC. Never updates an existing quote or snapshot. */
export function withMiamiInsurance<T extends ServiceItem>({ quotationId, items, required, commercialValue, saleRatePercent, settings, createdBy }: Input<T>) {
  const fail = (error: string) => ({ items, insurance:null, error })
  if (!required) return { items, insurance:null, error:null }
  if (!settings) return fail('No se ha cargado la configuración de seguro de la empresa. Recarga la página o guarda un borrador.')
  if (!Number.isFinite(commercialValue) || commercialValue <= 0) return fail('Ingresa un valor comercial / FOB mayor a cero para incluir el seguro.')
  if (!Number.isFinite(saleRatePercent) || saleRatePercent <= 0) return fail('El cliente no tiene un porcentaje de seguro válido configurado.')
  const costRate = Number(settings.insurance_cost_rate_percent ?? DEFAULT_INSURANCE_COST_RATE_PERCENT)
  if (!Number.isFinite(costRate) || costRate <= 0 || costRate > 5) return fail('La empresa no tiene una tasa de costo de seguro válida (mayor a 0% y hasta 5%).')
  const services = items.filter(item => !isInsurancePricingItem(item))
  const coverage = partitionInsuranceCoverage(services,
    normalizeInsuranceExclusionPatterns(settings.insurance_excluded_service_patterns),
    normalizeInsuranceCoveragePatterns(settings.insurance_included_service_patterns ?? DEFAULT_INSURANCE_INCLUDED_SERVICE_PATTERNS))
  const sale = coverage.included.reduce((sum,item) => sum + Number(item.sale_amount || 0) * Number(item.quantity ?? 1),0)
  const cost = coverage.included.reduce((sum,item) => sum + Number(item.cost_amount || 0) * Number(item.quantity ?? 1),0)
  if (!Number.isFinite(sale) || !Number.isFinite(cost) || sale <= 0 || cost < 0) return fail('No se detectaron servicios cubiertos válidos para calcular el seguro Full Cover.')
  const saleCalc = calculateInsuranceDeclaration({invoiceValue:commercialValue,freightValue:sale,saleRatePercent,costRatePercent:costRate})
  const costCalc = calculateInsuranceDeclaration({invoiceValue:commercialValue,freightValue:cost,saleRatePercent,costRatePercent:costRate})
  const taxRate = normalizeTaxRatePercent(settings.default_tax_rate)
  const tax = calculateTaxAmount(true,saleCalc.insuranceSale,taxRate)
  const insurance = {
    quotation_id:quotationId,
    rate_code:'cargo_insurance',
    item_type:'Seguro',
    description:'Seguro de Carga',
    supplier:'JAH Insurance',
    quantity:1,
    cost_amount:costCalc.insuranceCost,
    sale_amount:saleCalc.insuranceSale,
    currency:'USD',
    taxable:true,
    tax_rate:taxRate,
    tax_amount:tax,
    total_amount:saleCalc.insuranceSale + tax,
    created_by:createdBy || null,
    notes:[
      `Valor factura / FOB: USD ${money(commercialValue)}`,
      `Servicios incluidos en Full Cover - venta: USD ${money(sale)} (${coverage.included.map(item=>item.description || item.rate_code || 'Servicio').join(' + ')})`,
      `Servicios incluidos en Full Cover - costo: USD ${money(cost)}`,
      `Servicios excluidos por política: ${coverage.excluded.map(({item,matchedPattern})=>`${item.description || item.rate_code || 'Servicio'} [${matchedPattern}]`).join(' + ') || 'Ninguno'}`,
      `Valor asegurado costo: (FOB + costos) × 1.10 = USD ${money(costCalc.insuredValue)}`,
      `Valor asegurado venta: (FOB + ventas) × 1.10 = USD ${money(saleCalc.insuredValue)}`,
      `Seguro costo calculado: USD ${money(costCalc.insuredValue)} × ${costRate}% = USD ${money(costCalc.calculatedInsuranceCost)}`,
      costCalc.insuranceCostMinimumApplied ? `Mínimo de seguro aplicado al costo: USD ${money(INSURANCE_MINIMUM_CHARGE_USD)}` : `Seguro costo final: USD ${money(costCalc.insuranceCost)}`,
      `Seguro venta calculada: USD ${money(saleCalc.insuredValue)} × ${saleRatePercent}% = USD ${money(saleCalc.calculatedInsuranceSale)}`,
      saleCalc.insuranceSaleMinimumApplied ? `Mínimo de seguro aplicado a la venta: USD ${money(INSURANCE_MINIMUM_CHARGE_USD)}` : `Seguro venta final: USD ${money(saleCalc.insuranceSale)}`,
      `ISV ${taxRate}% aplicado: Sí`,
    ].join('\n'),
  }
  return { items:[...services,insurance], insurance, error:null }
}
