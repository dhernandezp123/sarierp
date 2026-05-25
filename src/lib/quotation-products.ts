export const tradeDirections = [
  { value: 'import', label: 'Importación' },
  { value: 'export', label: 'Exportación' },
]

export const serviceProducts = [
  { value: 'miami_lcl', label: 'Miami LCL' },
  { value: 'miami_air', label: 'Miami Aéreo' },
  { value: 'other_origin_fcl', label: 'Otro origen FCL' },
  { value: 'other_origin_lcl', label: 'Otro origen LCL' },
  { value: 'usa_ltl_ftl', label: 'USA LTL / FTL' },
  { value: 'courier', label: 'Courier' },
]

export const usesClientRates = (serviceProduct: string) =>
  ['miami_lcl', 'miami_air'].includes(serviceProduct)
