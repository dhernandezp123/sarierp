export type BillingOffice = {
  id: string
  name: string
  address: string
  phone: string
  email: string
  establishment_code: string
  emission_point_code: string
  is_active: boolean
  updated_at: string
}

export type IssuerSnapshot = {
  legal_name: string
  trade_name: string | null
  rtn: string
  fiscal_address: string
  address: string
  phone: string
  email: string
  office_name: string
  invoice_footer_note: string | null
}

export const fiscalDocumentCodes = {
  Factura: '01', 'Nota de Crédito': '06', 'Nota de Débito': '07',
  'Boleta de Compra': '11', 'Comprobante de Retención': '05', 'Guía de Remisión': '08',
} as const

export function validateOffice(office: Pick<BillingOffice, 'name' | 'email' | 'establishment_code' | 'emission_point_code'>) {
  if (!office.name.trim() || office.name.trim().length > 120) return 'Escribe un nombre de hasta 120 caracteres.'
  if (office.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(office.email)) return 'Revisa el correo de la oficina.'
  for (const code of [office.establishment_code, office.emission_point_code]) {
    if (code && !/^\d{3}$/.test(code)) return 'Cada código SAR debe tener tres dígitos.'
  }
  return null
}
