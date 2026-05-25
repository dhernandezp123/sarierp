export const tradeDirections = [
  {
    value: 'import',
    label: 'Importación',
  },
  {
    value: 'export',
    label: 'Exportación',
  },
] as const

export const serviceProducts = [
  {
    value: 'miami_lcl',
    label: 'Miami Consolidado Marítimo LCL',
    appliesClientRates: true,
  },
  {
    value: 'miami_air',
    label: 'Miami Consolidado Aéreo',
    appliesClientRates: true,
  },
  {
    value: 'other_origin_fcl',
    label: 'FCL Otros Orígenes',
    appliesClientRates: false,
  },
  {
    value: 'other_origin_lcl',
    label: 'LCL Otros Orígenes',
    appliesClientRates: false,
  },
  {
    value: 'usa_ltl_ftl',
    label: 'LTL / FTL USA',
    appliesClientRates: false,
  },
  {
    value: 'courier',
    label: 'Courier',
    appliesClientRates: false,
  },
] as const

export type TradeDirection = (typeof tradeDirections)[number]['value']
export type ServiceProduct = (typeof serviceProducts)[number]['value']

export function usesClientRates(product?: string | null) {
  return serviceProducts.some(
    (item) => item.value === product && item.appliesClientRates
  )
}