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

export function usesClientRates(product?: string | null) {
  return usesClientRatesFromCatalog(serviceProducts, product)
}
