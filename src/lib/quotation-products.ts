import {
  defaultServiceProducts,
  fetchActiveServiceProducts,
  tradeDirections,
  usesClientRatesFromCatalog,
} from '@/src/lib/pricing-catalogs'

export { fetchActiveServiceProducts, tradeDirections }

export const serviceProducts = defaultServiceProducts

export type TradeDirection = (typeof tradeDirections)[number]['value']
export type ServiceProduct = string

export const isCustomsOnly = (product?: string | null) => product === 'customs_only'

export const usesOwnPricing = (product?: string | null) =>
  isCustomsOnly(product) || product === 'miami_lcl' || product === 'miami_air'

export type ProductTransportRule = { transport: string; modalities: string[] }

// Transporte y modalidades que corresponden a cada producto con pricing por agentes.
// Productos personalizados del catálogo no tienen regla y conservan selección libre.
const productTransportRules: Record<string, ProductTransportRule> = {
  other_origin_fcl: { transport: 'Marítima', modalities: ['FCL'] },
  other_origin_lcl: { transport: 'Marítima', modalities: ['LCL'] },
  other_origin_air: { transport: 'Aéreo', modalities: ['Consolidado'] },
  usa_ltl_ftl: { transport: 'Terrestre', modalities: ['LTL', 'FTL'] },
  courier: { transport: 'Aéreo', modalities: ['Courier'] },
}

export const getProductTransportRule = (product?: string | null) =>
  (product && productTransportRules[product]) || null

// Modalidad resultante al aplicar la regla del producto sobre la modalidad actual.
export function resolveProductQuoteType(rule: ProductTransportRule, currentQuoteType: string) {
  if (rule.modalities.length === 1) return rule.modalities[0]
  return rule.modalities.includes(currentQuoteType) ? currentQuoteType : ''
}

export type CargoStructure = 'containers' | 'loose' | 'none'

// FCL/FTL usan quotation_containers; la carga suelta usa quotation_cargo_lines.
export function getCargoStructure(quoteType?: string | null): CargoStructure {
  if (quoteType === 'FCL' || quoteType === 'FTL') return 'containers'
  if (quoteType === 'LCL' || quoteType === 'LTL' || quoteType === 'Consolidado' || quoteType === 'Courier') {
    return 'loose'
  }
  return 'none'
}

export function usesClientRates(product?: string | null) {
  return usesClientRatesFromCatalog(serviceProducts, product)
}
