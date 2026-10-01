const DASHBOARD_FILTERS = new Set([
  'all',
  'attention',
  'unassigned',
  'departures',
  'arrivals',
  'documentation',
  'exceptions',
  'recently_completed',
])

export function operationsDashboardHref(filter = 'all', search = '') {
  const query = new URLSearchParams()
  if (DASHBOARD_FILTERS.has(filter) && filter !== 'all') query.set('queue', filter)
  if (search.trim()) query.set('q', search.trim())
  return `/operations/dashboard${query.size ? `?${query.toString()}` : ''}`
}

export function operationsReturnHref(value?: string | null) {
  if (value && /^\/invoicing(?:\?|$)/.test(value)) {
    try {
      const url = new URL(value, 'https://forwarders.app')
      if (url.pathname === '/invoicing') {
        return url.searchParams.get('view') === 'documents'
          ? '/invoicing?view=documents'
          : '/invoicing?view=work'
      }
    } catch {
      return '/operations/shipping-instructions'
    }
  }

  if (!value || !/^\/operations\/dashboard(?:\?|$)/.test(value)) {
    return '/operations/shipping-instructions'
  }

  try {
    const url = new URL(value, 'https://forwarders.app')
    if (url.pathname !== '/operations/dashboard') {
      return '/operations/shipping-instructions'
    }
    return operationsDashboardHref(
      url.searchParams.get('queue') || 'all',
      url.searchParams.get('q') || ''
    )
  } catch {
    return '/operations/shipping-instructions'
  }
}
