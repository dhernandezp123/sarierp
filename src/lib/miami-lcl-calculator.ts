type CalculateMiamiLclInput = {
  ft3: number
  lbs: number
  rateFt3: number
  rateLbs: number
  minimumSmall: number
  minimumLarge: number
  bunker?: number
}

type MiamiLclBasis = 'minimum_small' | 'minimum_large' | 'weight' | 'volume'

export const calculateMiamiLcl = ({
  ft3,
  lbs,
  rateFt3,
  rateLbs,
  minimumSmall,
  minimumLarge,
  bunker = 0,
}: CalculateMiamiLclInput) => {
  const ft3Amount = ft3 * rateFt3
  const lbsAmount = lbs * rateLbs

  let minimumAmount = 0
  let minimumType: MiamiLclBasis = 'minimum_large'

  if (ft3 > 0 || lbs > 0) {
    if (ft3 <= 45 && lbs <= 1000) {
      minimumAmount = minimumSmall
      minimumType = 'minimum_small'
    } else if (ft3 <= 90 && lbs <= 2000) {
      minimumAmount = minimumLarge
      minimumType = 'minimum_large'
    }
  }

  const candidates: Array<{ basis: MiamiLclBasis; amount: number }> = [
    { basis: 'volume', amount: ft3Amount },
    { basis: 'weight', amount: lbsAmount },
    { basis: minimumType, amount: minimumAmount },
  ]

  const winner = candidates.reduce((max, item) =>
    item.amount > max.amount ? item : max
  )

  const isMinimum =
    winner.basis === 'minimum_small' || winner.basis === 'minimum_large'
  const oceanFreight = winner.amount + bunker

  return {
    ft3Amount,
    lbsAmount,
    minimumApplied: minimumAmount,
    oceanFreight,
    basis: winner.basis,
    isMinimum,
    bunker,
    byFt3: ft3Amount,
    byLbs: lbsAmount,
    baseAmount: Math.max(ft3Amount, lbsAmount),
    finalAmount: oceanFreight,
  }
}
