export type MiamiRateDestination = 'SPS' | 'TGU'
export const miamiRateDestinationOptions = [
  { value: 'SPS', label: 'SPS — San Pedro Sula' },
  { value: 'TGU', label: 'TGU — Tegucigalpa' },
] as const

export function normalizeMiamiRateDestination(value: unknown): MiamiRateDestination {
  return value === 'TGU' ? 'TGU' : 'SPS'
}

export function miamiRateDestinationLabel(value: unknown) {
  return normalizeMiamiRateDestination(value) === 'TGU' ? 'Tegucigalpa' : 'San Pedro Sula'
}

export function miamiRateLabel(label: string, destination: MiamiRateDestination) {
  return destination === 'TGU' ? label.replace(/\bSPS\b/g, 'TGU') : label
}

/** An explicit destination wins over a global rate, never over the other city. */
export function selectMiamiDestinationRates<T extends { rate_code: string; miami_rate_destination?: string | null; is_active?: boolean | null }>(rates: T[], destination: MiamiRateDestination): T[] {
  const selected = new Map<string, T>()
  for (const rate of rates) {
    if (rate.is_active === false || (rate.miami_rate_destination && rate.miami_rate_destination !== destination)) continue
    const previous = selected.get(rate.rate_code)
    if (!previous || rate.miami_rate_destination === destination) selected.set(rate.rate_code, rate)
  }
  return [...selected.values()]
}

export function hasMiamiFreightRates(rates: { rate_code: string; amount: number }[], product: string) {
  const required = product === 'miami_air' ? ['consolidado_aereo_kg'] : [
    'lcl_maritimo_sps_ft3', 'lcl_maritimo_sps_lbs',
    'small_maritimo_min_lcl_1000_lbs_45_ft3', 'minimo_maritimo_2mil_lbs_90_ft3',
  ]
  return required.every(code => rates.some(rate => rate.rate_code === code && Number.isFinite(Number(rate.amount)) && Number(rate.amount) >= 0))
    && required.some(code => rates.some(rate => rate.rate_code === code && Number(rate.amount) > 0))
}
