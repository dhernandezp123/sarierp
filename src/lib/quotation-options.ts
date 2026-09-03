export type QuotationOptionStatus =
  | 'Borrador'
  | 'Ofrecida'
  | 'Aceptada'
  | 'No seleccionada'
  | 'Retirada'

export type QuotationOptionItem = {
  id: string
  quotation_option_id: string
  item_type: string
  description: string
  cost_amount: number | string | null
  sale_amount: number | string | null
  currency: string | null
  supplier: string | null
  notes: string | null
  quantity: number | string | null
  taxable: boolean | null
  tax_rate: number | string | null
  tax_amount: number | string | null
  total_amount: number | string | null
  rate_code: string | null
  insurance_coverage_override?: boolean | null
  sort_order: number
  created_at: string
}

export type QuotationCommercialOption = {
  id: string
  quotation_id: string
  agent_quote_id: string
  option_code: string
  label: string
  status: QuotationOptionStatus
  is_recommended: boolean
  sort_order: number
  agent_id: string | null
  agent_name: string | null
  carrier: string | null
  etd: string | null
  transit_time: string | null
  free_days_destination: number | null
  transshipment: string | null
  valid_until: string | null
  currency: string
  cost_total: number | string
  sale_subtotal: number | string
  tax_total: number | string
  grand_total: number | string
  profit_amount: number | string
  gp_percentage: number | string
  created_by: string
  created_at: string
  updated_at: string
  offered_at: string | null
  accepted_at: string | null
  items: QuotationOptionItem[]
}

export const getClientVisibleQuotationOptions = (
  options: QuotationCommercialOption[]
) => {
  const accepted = options.filter((option) => option.status === 'Aceptada')
  if (accepted.length > 0) return accepted

  const offered = options.filter((option) => option.status === 'Ofrecida')
  if (offered.length > 0) return offered

  return options.filter((option) => option.status === 'Borrador')
}
