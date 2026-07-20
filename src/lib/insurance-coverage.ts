export type InsuranceCoverageItem = {
  item_type?: string | null
  description?: string | null
  rate_code?: string | null
}

const normalizeCoverageText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

export function normalizeInsuranceExclusionPatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((pattern) => String(pattern || '').trim())
        .filter(Boolean)
    )
  )
}

export function isInsurancePricingItem(item: InsuranceCoverageItem) {
  const itemType = normalizeCoverageText(item.item_type)
  const description = normalizeCoverageText(item.description)

  return itemType === 'seguro' || description.includes('seguro de carga')
}

export function getInsuranceExclusionMatch(
  item: InsuranceCoverageItem,
  patterns: string[]
) {
  const searchableValues = [item.rate_code, item.description, item.item_type]
    .map(normalizeCoverageText)
    .filter(Boolean)

  return (
    normalizeInsuranceExclusionPatterns(patterns).find((pattern) => {
      const normalizedPattern = normalizeCoverageText(pattern)
      return (
        normalizedPattern.length > 0 &&
        searchableValues.some((value) => value.includes(normalizedPattern))
      )
    }) || null
  )
}

export function partitionInsuranceCoverage<T extends InsuranceCoverageItem>(
  items: T[],
  exclusionPatterns: string[]
) {
  const included: T[] = []
  const excluded: Array<{ item: T; matchedPattern: string }> = []

  items.forEach((item) => {
    if (isInsurancePricingItem(item)) return

    const matchedPattern = getInsuranceExclusionMatch(item, exclusionPatterns)

    if (matchedPattern) {
      excluded.push({ item, matchedPattern })
      return
    }

    included.push(item)
  })

  return { included, excluded }
}
