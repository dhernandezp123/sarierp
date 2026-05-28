export function calculateMiamiLcl({
  ft3,
  lbs,
  rateFt3,
  rateLbs,
  minimumSmall,
  minimumLarge,
}: {
  ft3: number
  lbs: number
  rateFt3: number
  rateLbs: number
  minimumSmall: number
  minimumLarge: number
}) {
  const ft3Amount = Number(ft3 || 0) * Number(rateFt3 || 0)
  const lbsAmount = Number(lbs || 0) * Number(rateLbs || 0)

  const freightBase = Math.max(ft3Amount, lbsAmount)

  const minimumApplied =
    Number(ft3 || 0) < 90
      ? Number(minimumSmall || 0)
      : Number(minimumLarge || 0)

  const oceanFreight = Math.max(freightBase, minimumApplied)

  return {
    ft3Amount,
    lbsAmount,
    minimumApplied: oceanFreight === minimumApplied ? minimumApplied : 0,
    oceanFreight,
    basis:
      oceanFreight === minimumApplied
        ? 'minimum'
        : ft3Amount >= lbsAmount
          ? 'ft3'
          : 'lbs',
    isMinimum: oceanFreight === minimumApplied,
  }
}
