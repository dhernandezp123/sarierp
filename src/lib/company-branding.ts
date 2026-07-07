export type CompanyBranding = {
  legal_name: string | null
  trade_name: string | null
  rtn: string | null
  address: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
  miami_consignee: string | null
  miami_address_line: string | null
  miami_suite_prefix: string | null
  miami_city: string | null
  miami_state: string | null
  miami_zip: string | null
  miami_country: string | null
  miami_phone: string | null
}

export const COMPANY_BRANDING_SELECT = `
  legal_name,
  trade_name,
  rtn,
  address,
  city,
  country,
  phone,
  email,
  logo_url,
  miami_consignee,
  miami_address_line,
  miami_suite_prefix,
  miami_city,
  miami_state,
  miami_zip,
  miami_country,
  miami_phone
`

export const DEFAULT_COMPANY_BRANDING: CompanyBranding = {
  legal_name: 'SARI EXPRESS S DE R.L. DE C.V.',
  trade_name: 'Sari Express',
  rtn: '08019003239182',
  address:
    'BO. LOS ANDES 9 CALLE 12-13 AVE N.E, San Pedro Sula, Cortes, Honduras, CP: 21101',
  city: 'San Pedro Sula',
  country: 'Honduras',
  phone: null,
  email: null,
  logo_url: '/logo/sari-logo.png',
  miami_consignee: null,
  miami_address_line: null,
  miami_suite_prefix: null,
  miami_city: 'Miami',
  miami_state: 'FL',
  miami_zip: null,
  miami_country: 'USA',
  miami_phone: null,
}

const clean = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function normalizeCompanyBranding(
  data?: Partial<CompanyBranding> | null
): CompanyBranding {
  if (!data) return DEFAULT_COMPANY_BRANDING

  return {
    legal_name: clean(data.legal_name) || DEFAULT_COMPANY_BRANDING.legal_name,
    trade_name: clean(data.trade_name) || DEFAULT_COMPANY_BRANDING.trade_name,
    rtn: clean(data.rtn) || DEFAULT_COMPANY_BRANDING.rtn,
    address: clean(data.address) || DEFAULT_COMPANY_BRANDING.address,
    city: clean(data.city) || DEFAULT_COMPANY_BRANDING.city,
    country: clean(data.country) || DEFAULT_COMPANY_BRANDING.country,
    phone: clean(data.phone),
    email: clean(data.email),
    logo_url: clean(data.logo_url) || DEFAULT_COMPANY_BRANDING.logo_url,
    miami_consignee: clean(data.miami_consignee),
    miami_address_line: clean(data.miami_address_line),
    miami_suite_prefix: clean(data.miami_suite_prefix),
    miami_city: clean(data.miami_city) || DEFAULT_COMPANY_BRANDING.miami_city,
    miami_state: clean(data.miami_state) || DEFAULT_COMPANY_BRANDING.miami_state,
    miami_zip: clean(data.miami_zip),
    miami_country:
      clean(data.miami_country) || DEFAULT_COMPANY_BRANDING.miami_country,
    miami_phone: clean(data.miami_phone),
  }
}

export function getCompanyDisplayName(company?: CompanyBranding | null) {
  const normalized = normalizeCompanyBranding(company)
  return normalized.legal_name || normalized.trade_name || 'Sari Express'
}

export function getCompanyTradeName(company?: CompanyBranding | null) {
  const normalized = normalizeCompanyBranding(company)
  return normalized.trade_name || normalized.legal_name || 'Sari Express'
}

export function getCompanyAddressLines(company?: CompanyBranding | null) {
  const normalized = normalizeCompanyBranding(company)
  const cityLine = [normalized.city, normalized.country].filter(Boolean).join(', ')

  return [normalized.address, cityLine].filter(
    (line): line is string => Boolean(line)
  )
}

export function getCompanyNotifyParty(company?: CompanyBranding | null) {
  const normalized = normalizeCompanyBranding(company)
  const name = getCompanyDisplayName(normalized)
  const addressLines = getCompanyAddressLines(normalized)
  const taxLine = normalized.rtn ? `RTN/TAXID: ${normalized.rtn}` : null

  return [name, ...addressLines, taxLine].filter(Boolean).join('\n')
}
