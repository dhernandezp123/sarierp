import { supabase } from '@/src/lib/supabase/client'

export type ShipmentSummary = {
  id: string
  shipment_number: string
  quotation_id: string | null
  client_id: string | null
  shipping_instruction_id: string | null
  service_type: string | null
  incoterm: string | null
  origin: string | null
  destination: string | null
  operational_status: string
  derived_operational_status: string
  requires_hbl: boolean | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  closed_at: string | null
  metadata: Record<string, unknown>
}

export type ShipmentContext = {
  shipment: ShipmentSummary
  shipping_instruction: {
    id: string
    routing_number: string
    status: string
    operational_status: string | null
  } | null
}

export async function loadShipmentContext(operationId: string) {
  const { data, error } = await supabase.rpc('get_shipment_context', {
    p_operation_id: operationId,
  })

  if (error) throw error
  return data as ShipmentContext
}

export function operationIdForLegacyRoute(context: ShipmentContext) {
  return context.shipping_instruction?.id || context.shipment.id
}
