import { getAirChargeableWeights } from './quotation-cargo'

type MinimumRule = {
  code: string
  fixed_amount?: number | string | null
  minimum_amount?: number | string | null
}

export function calculateMiamiAir(actualKg: number, cbm: number, ratePerKg: number, rules: MinimumRule[]) {
  const weights = getAirChargeableWeights(actualKg, cbm)
  const kg = weights.chargeableWeightKg
  const small = rules.find((rule) => rule.code === 'miami_air_min_small')
  const large = rules.find((rule) => rule.code === 'miami_air_min_large')
  const smallThreshold = Number(small?.minimum_amount || 0)
  const largeThreshold = Number(large?.minimum_amount || 0)
  let minimumApplied = 0
  if (kg > 0 && smallThreshold > 0 && kg < smallThreshold) {
    minimumApplied = Number(small?.fixed_amount || 0)
  } else if (kg > 0 && smallThreshold > 0 && kg >= smallThreshold && kg <= largeThreshold) {
    minimumApplied = Number(large?.fixed_amount || 0)
  }
  // Sin volumen, el minimo base tambien protege los envios de mas de 40 kg.
  if (kg > 0 && !(cbm > 0)) {
    minimumApplied = Math.max(minimumApplied, Number(small?.fixed_amount || 0))
  }
  return { ...weights, minimumApplied, freight: Math.max(kg * ratePerKg, minimumApplied) }
}
