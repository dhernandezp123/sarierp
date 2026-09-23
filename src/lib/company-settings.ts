import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

import type { CompanyBranding } from '@/src/lib/company-branding'

type CompanySettingsResult<T> = {
  data: T | null
  error: PostgrestError | null
}

export type TenantCompanySettings = CompanyBranding & {
  id: string
  tenant_id: string
  zip_code: string | null
  phone_2: string | null
  website: string | null
  default_currency: string | null
  default_tax_rate: number | null
  insurance_cost_rate_percent: number | null
  insurance_included_service_patterns: string[] | null
  insurance_excluded_service_patterns: string[] | null
  invoice_footer_note: string | null
  lugar_emision_defecto: string | null
  exchange_rate_usd_hnl: number | null
  condiciones_bl: string | null
  condiciones_awb: string | null
  condiciones_carta_porte: string | null
  plantilla_cotizacion: string | null
  updated_at: string | null
  updated_by: string | null
}

export type TenantEmailBranding = Pick<
  TenantCompanySettings,
  'trade_name' | 'legal_name' | 'email'
>

/** Loads the complete settings row for the authenticated internal tenant. */
export async function loadCurrentCompanySettings<T = TenantCompanySettings>(
  client: SupabaseClient
): Promise<CompanySettingsResult<T>> {
  const { data, error } = await client
    .rpc('get_current_company_settings')
    .maybeSingle()

  return { data: data as T | null, error }
}

/** Loads only branding/contact fields safe for an approved portal client. */
export async function loadCurrentCompanyBranding(
  client: SupabaseClient
): Promise<CompanySettingsResult<CompanyBranding>> {
  const { data, error } = await client
    .rpc('get_current_company_branding')
    .maybeSingle()

  return { data: data as CompanyBranding | null, error }
}

/** Server-side lookup after the caller and tenant ownership were validated. */
export async function loadTenantEmailBranding(
  client: SupabaseClient,
  tenantId: string,
): Promise<CompanySettingsResult<TenantEmailBranding>> {
  const { data, error } = await client
    .from('company_settings')
    .select('trade_name, legal_name, email')
    .eq('tenant_id', tenantId)
    .single()

  return { data: data as TenantEmailBranding | null, error }
}
