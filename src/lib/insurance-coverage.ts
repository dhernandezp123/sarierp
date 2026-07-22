export type InsuranceCoverageItem = {
  id?: string | null
  item_type?: string | null
  description?: string | null
  rate_code?: string | null
  insurance_coverage_override?: boolean | null
}

export const DEFAULT_INSURANCE_INCLUDED_SERVICE_PATTERNS = [
  'Ocean Freight',
  'Flete Terrestre',
  'Air Freight',
  'Aéreo Consolidado',
  'Origen',
  'origin_charge',
  'Documentación',
  'Aduana',
]

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

export const normalizeInsuranceCoveragePatterns =
  normalizeInsuranceExclusionPatterns

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

export function getInsuranceInclusionMatch(
  item: InsuranceCoverageItem,
  patterns: string[]
) {
  return getInsuranceExclusionMatch(item, patterns)
}

export function partitionInsuranceCoverage<T extends InsuranceCoverageItem>(
  items: T[],
  exclusionPatterns: string[],
  inclusionPatterns: string[] = DEFAULT_INSURANCE_INCLUDED_SERVICE_PATTERNS
) {
  const included: T[] = []
  const excluded: Array<{ item: T; matchedPattern: string }> = []

  items.forEach((item) => {
    if (isInsurancePricingItem(item)) return

    if (item.insurance_coverage_override === true) {
      included.push(item)
      return
    }

    if (item.insurance_coverage_override === false) {
      excluded.push({ item, matchedPattern: 'Exclusión excepcional de la cotización' })
      return
    }

    const matchedPattern = getInsuranceExclusionMatch(item, exclusionPatterns)

    if (matchedPattern) {
      excluded.push({ item, matchedPattern })
      return
    }

    const inclusionMatch = getInsuranceInclusionMatch(item, inclusionPatterns)

    if (inclusionMatch) {
      included.push(item)
      return
    }

    excluded.push({
      item,
      matchedPattern: 'No incluido por la política general',
    })
  })

  return { included, excluded }
}
