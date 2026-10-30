import type { ChangeEvent } from 'react'
import { type CargoDimensionLine, validateCargoLines } from '@/src/lib/quotation-cargo'
import { type CustomsCharge, validateCustomsQuotation } from '@/src/lib/customs-quotation'
import { getCargoStructure, usesOwnPricing } from '@/src/lib/quotation-products'

export const createInitialQuotationForm = (validUntil: string) => ({
  cliente_id: '',

  trade_direction: 'import',
  service_product: '',
  quote_type: '',
  valid_until: validUntil,

  contact_name: '',
  contact_email: '',
  contact_phone: '',
  contact_state: '',
  contact_country: '',
  preferred_carrier: '',
  transit_time: '',
  target_rate: '',
  commercial_value: '',

  incoterm: '',
  tipo_transporte: '',

  origen: '',
  destino: '',
  puerto_origen: '',
  puerto_destino: '',
  pickup_address: '',
  delivery_address: '',

  container_type: '',
  container_qty: '',
  package_type: '',
  package_details: '',
  peso_kg: '',
  gross_weight: '',
  volumen_cbm: '',
  cantidad_bultos: '',
  commodity: '',

  // null uses the client's Miami default until a choice is made for this quote.
  requires_insurance: null as boolean | null,
  insurance_taxable: false,
  fob_value: '',
  freight_value: '',
  insurance_markup_percentage: '10',
  insurance_rate: '1.0',
  insurance_cost: '0',

  observaciones: '',
  pricing_notes: '',
  client_notes: '',
})

export type QuotationFormData = ReturnType<typeof createInitialQuotationForm>

export type QuotationFieldChange = (
  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) => void

export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP']
// Recolección en origen a cargo del forwarder; entrega en destino incluida.
export const PICKUP_INCOTERMS = ['EXW', 'FCA']
export const DELIVERY_INCOTERMS = ['DAP', 'DDP']

export const FCL_PACKAGE_TYPES = [
  'Cajas', 'Pallets', 'Envases', 'Tubos', 'Cajas metálicas',
  'Cilindros', 'Rollos', 'Sacos', 'Granel', 'Otro',
]

export type RouteLabels = {
  place: string
  portTypes: string[]
  originExample: string
  destinationExample: string
  carrierLabel: string
  carrierExample: string
}

// Etiquetas y tipos de lugar del catálogo `ports` que corresponden a cada transporte.
export function getRouteLabels(transport: string): RouteLabels {
  if (transport === 'Aéreo') {
    return {
      place: 'Aeropuerto',
      portTypes: ['Aeropuerto'],
      originExample: 'Ej. PVG Shanghai',
      destinationExample: 'Ej. SAP San Pedro Sula',
      carrierLabel: 'Aerolínea de preferencia',
      carrierExample: 'Ej. Avianca Cargo, Copa',
    }
  }
  if (transport === 'Terrestre') {
    return {
      place: 'Ciudad',
      portTypes: ['Ciudad', 'Frontera'],
      originExample: 'Ej. Laredo, TX',
      destinationExample: 'Ej. San Pedro Sula',
      carrierLabel: 'Transportista de preferencia',
      carrierExample: 'Ej. transportista habitual',
    }
  }
  return {
    place: 'Puerto',
    portTypes: ['Puerto'],
    originExample: 'Ej. Shanghai',
    destinationExample: 'Ej. Puerto Cortés',
    carrierLabel: 'Carrier de preferencia',
    carrierExample: 'Ej. MSC, Hapag-Lloyd',
  }
}

// Sugerencias del catálogo según el tipo de lugar del transporte; sin coincidencias
// del tipo se ofrecen todas para no dejar el campo sin ayuda.
export function filterPortsForTransport<T extends { type?: string | null }>(ports: T[], transport: string) {
  const types = getRouteLabels(transport).portTypes
  const matching = ports.filter((port) => types.includes(port.type || 'Puerto'))
  return matching.length > 0 ? matching : ports
}

export type FormIssue = { field: string; message: string }

export type QuotationSubmitInput = {
  status: string
  formData: QuotationFormData
  todayString: string
  missingReactivationReason: boolean
  isMiamiFlow: boolean
  isCustomsFlow: boolean
  customsCharges: CustomsCharge[]
  miamiLclEstimated: number
  miamiAirEstimated: number
  containerCount: number
  cargoLines: CargoDimensionLine[]
}

// Reúne todos los datos faltantes para señalarlos juntos en lugar de uno por envío.
// `field` es el data-field (o name) del control que se enfoca.
export function collectQuotationSubmitIssues({
  status,
  formData,
  todayString,
  missingReactivationReason,
  isMiamiFlow,
  isCustomsFlow,
  customsCharges,
  miamiLclEstimated,
  miamiAirEstimated,
  containerCount,
  cargoLines,
}: QuotationSubmitInput): FormIssue[] {
  const isDraftSave = status === 'Borrador'
  const structure = getCargoStructure(formData.quote_type)
  const issues: FormIssue[] = []
  const add = (field: string, message: string) => issues.push({ field, message })

  if (missingReactivationReason) add('reactivation_reason', 'Ingresa el motivo de reactivación')
  if (!formData.cliente_id) add('cliente_id', 'Selecciona el cliente')
  if (!formData.trade_direction) add('trade_direction', 'Selecciona la dirección comercial')
  if (!formData.service_product) {
    add('service_product', 'Selecciona el producto / servicio')
    return issues
  }
  if (!isDraftSave && !isCustomsFlow && !formData.incoterm) {
    add('incoterm', 'Selecciona el Incoterm')
  }
  if (formData.valid_until && formData.valid_until < todayString) {
    add('valid_until', 'La fecha de validez no puede ser anterior a hoy')
  }

  if (isCustomsFlow) {
    const error = validateCustomsQuotation(customsCharges, formData, isDraftSave)
    if (error) add('customs', error)
  }

  if (!isDraftSave && formData.service_product === 'miami_lcl' && miamiLclEstimated <= 0) {
    add('miami', 'Ingresa FT3 o libras para calcular la tarifa Miami LCL')
  }
  if (!isDraftSave && formData.service_product === 'miami_air' && miamiAirEstimated <= 0) {
    add('miami', 'Ingresa KG para calcular la tarifa Miami Aéreo')
  }

  const sendsToPricing = !isDraftSave && !usesOwnPricing(formData.service_product)
  if (sendsToPricing) {
    if (!formData.tipo_transporte) add('tipo_transporte', 'Selecciona el tipo de transporte')
    if (!formData.quote_type) add('quote_type', 'Selecciona la modalidad')
    if (structure === 'containers' && containerCount === 0) {
      add('containers', 'Agrega al menos un contenedor / unidad')
    }
    if (!formData.commodity) add('commodity', 'Ingresa la mercancía / commodity')
  }

  // Las líneas incompletas se descartarían del payload; se señalan en lugar de omitirlas.
  if (!isMiamiFlow && structure === 'loose') {
    const { issuesByLine, message } = validateCargoLines(cargoLines, isDraftSave ? 'draft' : 'pricing')
    const firstInvalidLine = cargoLines.find((line) => issuesByLine[line.id])
    if (message) add(firstInvalidLine ? `cargo-line-${firstInvalidLine.id}` : 'cargo', message)
  }

  return issues
}

export type ContainerLine = {
  container_type_id: string
  container_type_name: string
  quantity: number
  notes: string | null
}
