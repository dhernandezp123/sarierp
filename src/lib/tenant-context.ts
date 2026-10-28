export const TENANT_HEADERS = {
  id: 'x-forwarders-tenant-id',
  slug: 'x-forwarders-tenant-slug',
  hostname: 'x-forwarders-tenant-hostname',
  requestHostname: 'x-forwarders-request-hostname',
  name: 'x-forwarders-tenant-name',
  tradeName: 'x-forwarders-tenant-trade-name',
  logoUrl: 'x-forwarders-tenant-logo-url',
  primaryColor: 'x-forwarders-tenant-primary-color',
  secondaryColor: 'x-forwarders-tenant-secondary-color',
} as const

export type TenantPublicContext = {
  id: string
  slug: string
  hostname: string
  requestHostname: string
  name: string
  tradeName: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
}

export type TenantPublicContextRow = {
  tenant_id: string
  slug: string
  tenant_name: string
  hostname: string
  trade_name: string | null
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const HOSTNAME_PATTERN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const DEFAULT_PRIMARY_COLOR = '#0038BD'
const DEFAULT_SECONDARY_COLOR = '#07111F'

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > maxLength || /[\u0000-\u001f\u007f]/.test(text)) return null
  return text
}

export function sanitizeTenantLogoUrl(value: unknown) {
  const logoUrl = cleanText(value, 2048)
  if (!logoUrl) return null
  if (logoUrl.startsWith('/') && !logoUrl.startsWith('//')) return logoUrl

  try {
    const parsed = new URL(logoUrl)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export function tenantContextFromRow(
  row: TenantPublicContextRow | null | undefined,
  requestHostname: string,
): TenantPublicContext | null {
  if (!row) return null

  const name = cleanText(row.tenant_name, 160)
  const tradeName = cleanText(row.trade_name, 160) || name
  const hostname = cleanText(row.hostname, 253)?.toLowerCase()

  if (
    !UUID_PATTERN.test(row.tenant_id)
    || !SLUG_PATTERN.test(row.slug)
    || !hostname
    || !HOSTNAME_PATTERN.test(hostname)
    || !name
    || !tradeName
  ) {
    return null
  }

  return {
    id: row.tenant_id,
    slug: row.slug,
    hostname,
    requestHostname,
    name,
    tradeName,
    logoUrl: sanitizeTenantLogoUrl(row.logo_url),
    primaryColor: COLOR_PATTERN.test(row.primary_color || '')
      ? row.primary_color!
      : DEFAULT_PRIMARY_COLOR,
    secondaryColor: COLOR_PATTERN.test(row.secondary_color || '')
      ? row.secondary_color!
      : DEFAULT_SECONDARY_COLOR,
  }
}

function encodeHeaderValue(value: string) {
  return encodeURIComponent(value)
}

function decodeHeaderValue(value: string | null) {
  if (!value) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

export function clearTenantHeaders(headers: Headers) {
  Object.values(TENANT_HEADERS).forEach((name) => headers.delete(name))
}

export function writeTenantHeaders(headers: Headers, tenant: TenantPublicContext) {
  clearTenantHeaders(headers)
  headers.set(TENANT_HEADERS.id, tenant.id)
  headers.set(TENANT_HEADERS.slug, tenant.slug)
  headers.set(TENANT_HEADERS.hostname, tenant.hostname)
  headers.set(TENANT_HEADERS.requestHostname, tenant.requestHostname)
  headers.set(TENANT_HEADERS.name, encodeHeaderValue(tenant.name))
  headers.set(TENANT_HEADERS.tradeName, encodeHeaderValue(tenant.tradeName))
  if (tenant.logoUrl) headers.set(TENANT_HEADERS.logoUrl, encodeHeaderValue(tenant.logoUrl))
  headers.set(TENANT_HEADERS.primaryColor, tenant.primaryColor)
  headers.set(TENANT_HEADERS.secondaryColor, tenant.secondaryColor)
}

export function readTenantHeaders(headers: Pick<Headers, 'get'>): TenantPublicContext | null {
  const row: TenantPublicContextRow = {
    tenant_id: headers.get(TENANT_HEADERS.id) || '',
    slug: headers.get(TENANT_HEADERS.slug) || '',
    tenant_name: decodeHeaderValue(headers.get(TENANT_HEADERS.name)) || '',
    hostname: headers.get(TENANT_HEADERS.hostname) || '',
    trade_name: decodeHeaderValue(headers.get(TENANT_HEADERS.tradeName)),
    logo_url: decodeHeaderValue(headers.get(TENANT_HEADERS.logoUrl)),
    primary_color: headers.get(TENANT_HEADERS.primaryColor),
    secondary_color: headers.get(TENANT_HEADERS.secondaryColor),
  }

  return tenantContextFromRow(
    row,
    headers.get(TENANT_HEADERS.requestHostname) || row.hostname,
  )
}

export function profileMatchesTenant(
  profileTenantId: string | null | undefined,
  tenant: TenantPublicContext | null,
) {
  return Boolean(tenant && profileTenantId && tenant.id === profileTenantId)
}

type AccessProfile = {
  tenant_id?: string | null
  is_platform_admin?: boolean | null
}

/**
 * Mantiene separados los dos contextos de acceso de la aplicacion:
 * usuarios operativos dentro de su tenant y soporte de plataforma sin tenant.
 */
export function profileMatchesAccessContext(
  profile: AccessProfile | null | undefined,
  tenant: TenantPublicContext | null,
) {
  if (!profile) return false

  if (!tenant) {
    return profile.is_platform_admin === true && !profile.tenant_id
  }

  return profile.is_platform_admin !== true
    && profileMatchesTenant(profile.tenant_id, tenant)
}

export function isPlatformSupportPath(pathname: string) {
  return pathname === '/support'
    || /^\/support\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pathname)
}
