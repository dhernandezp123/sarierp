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

export function usesClientRates(product?: string | null) {
  return usesClientRatesFromCatalog(serviceProducts, product)
}
