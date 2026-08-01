export function normalizeExternalHttpUrl(
  value: string | null | undefined
): string | null {
  const candidate = value?.trim()
  if (!candidate) return null

  try {
    const parsed = new URL(candidate)
    const usesHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'

    if (
      !usesHttp
      || !parsed.hostname
      || parsed.username
      || parsed.password
    ) {
      return null
    }

    return parsed.href
  } catch {
    return null
  }
}
