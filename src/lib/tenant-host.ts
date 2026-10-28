export const PLATFORM_HOSTNAME = 'forwarders.app'

const PLATFORM_CANONICAL_ROUTES = new Set([
  '/politicas',
])

const PLATFORM_LEGAL_DOCUMENT_PATTERN = /^\/legal\/platform-2026-(?:06-22|09-(?:07|24))\.json$/
const LOGISTICS_LEGAL_DOCUMENT_PATTERN = /^\/legal\/logistics-2026-(?:06|09-(?:07|24))\.json$/

export const RESERVED_TENANT_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'mail',
  'support',
  'www',
])

const HOSTNAME_PATTERN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export type TenantHostResolution =
  | { kind: 'platform'; requestHostname: string }
  | {
      kind: 'tenant'
      requestHostname: string
      lookupHostname: string
      slug: string | null
      isLocalAlias: boolean
    }
  | { kind: 'invalid'; reason: string }

export function isPlatformLegalDocumentPath(pathname: string) {
  return PLATFORM_LEGAL_DOCUMENT_PATTERN.test(pathname)
}

export function isLogisticsLegalDocumentPath(pathname: string) {
  return LOGISTICS_LEGAL_DOCUMENT_PATTERN.test(pathname)
}

export function isLegalDocumentPath(pathname: string) {
  return isPlatformLegalDocumentPath(pathname)
    || isLogisticsLegalDocumentPath(pathname)
}

export function isPlatformCanonicalPath(pathname: string) {
  return PLATFORM_CANONICAL_ROUTES.has(pathname)
    || isPlatformLegalDocumentPath(pathname)
}

export function getTenantEntryRedirectUrl(requestUrl: string) {
  const url = new URL(requestUrl)
  if (url.pathname !== '/') return null

  url.pathname = '/login'
  url.search = ''
  url.hash = ''
  return url
}

export function getTenantPlatformRedirectUrl(
  requestUrl: string,
  isLocalAlias = false,
) {
  const url = new URL(requestUrl)
  if (isLocalAlias || !isPlatformCanonicalPath(url.pathname)) return null

  url.protocol = 'https:'
  url.hostname = PLATFORM_HOSTNAME
  url.port = ''
  return url
}

function stripPort(value: string) {
  if (value.startsWith('[')) return null

  const colonIndex = value.lastIndexOf(':')
  if (colonIndex < 0) return value
  if (value.indexOf(':') !== colonIndex) return null

  const port = value.slice(colonIndex + 1)
  return /^\d{1,5}$/.test(port) ? value.slice(0, colonIndex) : null
}
export function normalizeRequestHostname(value: string | null | undefined) {
  if (!value || /[\u0000-\u0020\u007f,/@\\]/.test(value)) return null

  const withoutPort = stripPort(value.trim().toLowerCase())
  if (!withoutPort) return null

  const hostname = withoutPort.endsWith('.')
    ? withoutPort.slice(0, -1)
    : withoutPort

  if (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
  ) {
    return hostname
  }

  return HOSTNAME_PATTERN.test(hostname) ? hostname : null
}

function tenantSlugFromPlatformHostname(hostname: string, platformHostname: string) {
  const suffix = `.${platformHostname}`
  if (!hostname.endsWith(suffix)) return null

  const slug = hostname.slice(0, -suffix.length)
  if (!SLUG_PATTERN.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) return null
  return slug
}

export function resolveTenantHost(
  rawHostname: string | null | undefined,
  options: {
    platformHostname?: string
    localTenantHostname?: string | null
  } = {},
): TenantHostResolution {
  const platformHostname = normalizeRequestHostname(
    options.platformHostname || PLATFORM_HOSTNAME,
  )
  const requestHostname = normalizeRequestHostname(rawHostname)

  if (!platformHostname || !requestHostname) {
    return { kind: 'invalid', reason: 'hostname_invalid' }
  }

  if (requestHostname === platformHostname) {
    return { kind: 'platform', requestHostname }
  }

  if (requestHostname === 'localhost' || requestHostname === '127.0.0.1') {
    const localTenantHostname = normalizeRequestHostname(options.localTenantHostname)
    if (!localTenantHostname || localTenantHostname === platformHostname) {
      return { kind: 'invalid', reason: 'local_tenant_not_configured' }
    }

    const slug = tenantSlugFromPlatformHostname(localTenantHostname, platformHostname)
    if (!slug) return { kind: 'invalid', reason: 'local_tenant_invalid' }

    return {
      kind: 'tenant',
      requestHostname,
      lookupHostname: localTenantHostname,
      slug,
      isLocalAlias: true,
    }
  }

  if (requestHostname.endsWith('.localhost')) {
    const slug = requestHostname.slice(0, -'.localhost'.length)
    if (!SLUG_PATTERN.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
      return { kind: 'invalid', reason: 'tenant_slug_invalid' }
    }

    return {
      kind: 'tenant',
      requestHostname,
      lookupHostname: `${slug}.${platformHostname}`,
      slug,
      isLocalAlias: true,
    }
  }

  if (requestHostname.endsWith(`.${platformHostname}`)) {
    const slug = tenantSlugFromPlatformHostname(requestHostname, platformHostname)
    if (!slug) return { kind: 'invalid', reason: 'tenant_slug_invalid' }

    return {
      kind: 'tenant',
      requestHostname,
      lookupHostname: requestHostname,
      slug,
      isLocalAlias: false,
    }
  }

  return {
    kind: 'tenant',
    requestHostname,
    lookupHostname: requestHostname,
    slug: null,
    isLocalAlias: false,
  }
}
