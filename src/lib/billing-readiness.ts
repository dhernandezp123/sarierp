export type BillingReadinessCode =
  | 'READY_TO_INVOICE'
  | 'COSTS_PENDING'
  | 'OPERATIONS_PENDING'
  | 'CLIENT_DATA_MISSING'
  | 'PRICING_INVALID'

export type BillingQueueRow = {
  quotation_id: string
  quotation_number: string | null
  client_id: string
  client_name: string
  shipment_count: number
  shipment_numbers: string | null
  primary_shipping_instruction_id: string | null
  latest_closed_at: string | null
  financial_validation_status: string
  currency: string | null
  estimated_total: number
  readiness_code: BillingReadinessCode
  blocker: string | null
  next_action: string
}

export type ShipmentClosure = {
  operational_status: string | null
  closed_at: string | null
}

export function operationsAreComplete(shipments: ShipmentClosure[]) {
  const active = shipments.filter(
    (shipment) => !['Cancelada', 'Cancelado'].includes(
      shipment.operational_status || ''
    )
  )

  return active.length > 0 && active.every(
    (shipment) =>
      shipment.operational_status === 'Finalizado' && Boolean(shipment.closed_at)
  )
}

export function billingQueueHref(view: 'work' | 'documents' = 'work') {
  return view === 'documents' ? '/invoicing?view=documents' : '/invoicing?view=work'
}

export function billingReturnHref(value?: string | null) {
  if (!value || !/^\/invoicing(?:\?|$)/.test(value)) return '/invoicing?view=work'

  try {
    const url = new URL(value, 'https://forwarders.app')
    if (url.pathname !== '/invoicing') return '/invoicing?view=work'
    return billingQueueHref(url.searchParams.get('view') === 'documents' ? 'documents' : 'work')
  } catch {
    return '/invoicing?view=work'
  }
}

export function billingQueueActionHref(row: BillingQueueRow, returnTo: string) {
  const encodedReturn = encodeURIComponent(billingReturnHref(returnTo))

  switch (row.readiness_code) {
    case 'READY_TO_INVOICE':
      return `/invoicing/new?quotation=${row.quotation_id}&returnTo=${encodedReturn}`
    case 'COSTS_PENDING':
      return `/cost-validation/${row.quotation_id}?returnTo=${encodedReturn}`
    case 'OPERATIONS_PENDING':
      return row.primary_shipping_instruction_id
        ? `/operations/shipping-instructions/${row.primary_shipping_instruction_id}?returnTo=${encodedReturn}`
        : null
    default:
      return null
  }
}
