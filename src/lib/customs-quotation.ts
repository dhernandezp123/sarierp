import { calculateTaxAmount, normalizeTaxRatePercent } from '@/src/lib/tax'

export type CustomsCharge = {
  code: string
  description: string
  cost: string
  sale: string
  taxable: boolean
  taxRate?: number | string | null
}

export const newCustomsCharges = (): CustomsCharge[] => [
  { code: 'customs_service', description: 'Servicio de Aduanas', cost: '0', sale: '', taxable: true },
]

/** A seller's own zero-cost honorarium has no external supplier invoice.
 * Finance must still explicitly validate it; delivery and nonzero costs keep reconciliation. */
export function ownCustomsZeroCostIds(product: string | null | undefined, items: Array<{
  id: string; rate_code?: string | null; cost_amount: number | string | null
}>) {
  return product === 'customs_only' ? items.filter(item => item.rate_code === 'customs_service' &&
    item.cost_amount !== null && Number(item.cost_amount) === 0).map(item => item.id) : []
}

export function hydrateCustomsCharges(items: Array<{
  rate_code?: string | null; description?: string | null; cost_amount?: number | string | null
  sale_amount?: number | string | null; quantity?: number | string | null
  taxable?: boolean | null; tax_rate?: number | string | null
}>): CustomsCharge[] {
  return items.length ? items.map((item, index) => ({
    code: item.rate_code || `customs_extra:${index}`,
    description: item.description || 'Servicio de Aduanas',
    cost: String(Number(item.cost_amount || 0) * Number(item.quantity || 1)),
    sale: String(Number(item.sale_amount || 0) * Number(item.quantity || 1)),
    taxable: Boolean(item.taxable),
    taxRate: item.tax_rate,
  })) : newCustomsCharges()
}

export function validateCustomsQuotation(charges: CustomsCharge[], data: {
  commodity: string; puerto_destino: string; delivery_address: string; valid_until: string; pricing_notes?: string
}, draft = false): string | null {
  if (charges.some(item => !item.description.trim() ||
    !Number.isFinite(Number(item.sale)) || !Number.isFinite(Number(item.cost)) ||
    Number(item.sale) < 0 || Number(item.cost) < 0)) return 'Revisa las descripciones y los importes de los servicios.'
  if (draft) return null
  if (!data.commodity.trim() || !data.puerto_destino.trim() || !data.valid_until)
    return 'Completa mercancía, aduana de despacho y vigencia.'
  if (!charges.some(item => item.code === 'customs_service' && Number(item.sale) > 0))
    return 'Ingresa los honorarios del servicio de Aduanas.'
  if (charges.some(item => item.code === 'customs_delivery') &&
    (!data.delivery_address.trim() || !charges.some(item => item.code === 'customs_delivery' && Number(item.sale) > 0)))
    return 'Completa la dirección y el precio de la entrega final.'
  const sale = charges.reduce((sum, item) => sum + Number(item.sale), 0)
  const cost = charges.reduce((sum, item) => sum + Number(item.cost), 0)
  if (sale > 0 && (sale - cost) / sale < 0.05 && !data.pricing_notes?.trim())
    return 'Justifica el margen menor al 5% en las notas internas de rentabilidad.'
  return null
}

export function buildCustomsPricingItems(quotationId: string, charges: CustomsCharge[], taxRate: number,
  supplier: string, createdBy?: string | null) {
  return charges.map(item => {
    const sale = Number(item.sale)
    const rate = normalizeTaxRatePercent(item.taxRate ?? taxRate)
    const tax = calculateTaxAmount(item.taxable, sale, rate)
    return {
      quotation_id: quotationId, rate_code: item.code, description: item.description.trim(),
      item_type: 'destination_charge', quantity: 1, cost_amount: Number(item.cost), sale_amount: sale,
      currency: 'USD', taxable: item.taxable, tax_rate: item.taxable ? rate : 0,
      tax_amount: tax, total_amount: sale + tax, supplier, created_by: createdBy || null,
      notes: null,
    }
  })
}

export function nextCustomsStatus(status: string, delivery: boolean): string | null {
  if (status === 'Pendiente Validación') return 'En gestión aduanera'
  if (status === 'En gestión aduanera') return 'Liberado'
  if (status === 'Liberado') return delivery ? 'Entregado' : 'Finalizado'
  if (status === 'Entregado') return 'Finalizado'
  return null
}
