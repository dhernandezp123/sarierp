type CalculateMiamiLclInput = {
  ft3: number
  lbs: number
  rateFt3: number
  rateLbs: number
  minimumSmall: number
  minimumLarge: number
  bunker?: number
}

export const calculateMiamiLcl = ({
  ft3,
  lbs,
  rateFt3,
  rateLbs,
  minimumSmall,
  minimumLarge,
  bunker = 0,
}: CalculateMiamiLclInput) => {
  const byFt3 = ft3 * rateFt3
  const byLbs = lbs * rateLbs
  const baseAmount = Math.max(byFt3, byLbs)

  let minimumApplied = 0
  let minimumLabel = 'N/A'

  if (ft3 > 0 || lbs > 0) {
    if (ft3 <= 45 && lbs <= 1000) {
      minimumApplied = minimumSmall
      minimumLabel = 'Small LCL'
    } else if (ft3 <= 90 && lbs <= 2000) {
      minimumApplied = minimumLarge
      minimumLabel = 'Mínimo LCL'
    }
  }

  const finalAmount = Math.max(baseAmount, minimumApplied) + bunker

  return {
    byFt3,
    byLbs,
    baseAmount,
    minimumApplied,
    minimumLabel,
    bunker,
    finalAmount,
  }
}
