import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllReportRows } from './report-query'
import type { CostContainer, CostPricingLine, FreightSource, ProviderCostLine } from './cost-analysis'

export type CostValidationData = {
  quotation: { id: string; quotation_number: string; status: string; quote_type: string; financial_validation_status: string; clientName: string }
  pricing: CostPricingLine[]; invoices: ProviderCostLine[]; containers: CostContainer[]; agent: FreightSource | null
  options: { id: string; option_code: string; label: string; currency: string; cost_total: number; sale_subtotal: number; accepted_at: string | null }[]
  shipments: { id: string; shipment_number: string; operational_status: string; closed_at: string | null; bookings: { id: string; booking_number: string | null; carrier_booking: string | null; carrier: string | null; shipment_status: string | null; etd: string | null; eta: string | null; booking_containers: { container_type: string; quantity: number }[] }[] }[]
  taxes: { id: string; country: string; tax_name: string; percentage: number }[]
  customerInvoice: { id: string; invoice_number: string | null } | null
}

export async function loadCostValidationData(client: Pick<SupabaseClient, 'from' | 'rpc'>, id: string, isCurrent = () => true): Promise<CostValidationData> {
  const { data: quotation, error } = await client.from('quotations')
    .select('id,quotation_number,status,quote_type,financial_validation_status,clientes(nombre)').eq('id', id).is('deleted_at', null).single()
  if (error || !quotation) throw new Error('No se pudo cargar la cotización.')
  const permission = await client.rpc('can_select_provider_invoice_item', { p_quotation_id: id })
  if (permission.error) throw new Error('No se pudo verificar el acceso a las facturas de proveedor.')
  if (permission.data !== true) throw new Error('Tu cuenta no tiene acceso a los costos de proveedor de esta cotización. No se puede determinar si existen facturas.')
  if (!isCurrent()) throw new Error('Carga reemplazada')
  const read = <T>(table: string, columns: string, filter: string | null = 'quotation_id', active = false) => readAllReportRows<T>((from, to) => {
    let query = client.from(table).select(columns).order('id').range(from, to)
    if (filter) query = query.eq(filter, id)
    if (active) query = query.is('deleted_at', null)
    return query as unknown as PromiseLike<{ data: T[] | null; error: { message: string } | null }>
  }, { label: table, isCurrent })
  const [pricing, invoices, containers, agents, optionsResult, shipmentsResult, taxesResult, customerInvoiceResult] = await Promise.all([
    read<CostPricingLine>('pricing_items', 'id,item_type,description,supplier,currency,quantity,cost_amount,sale_amount', 'quotation_id', true),
    read<ProviderCostLine>('provider_invoice_items', 'id,pricing_item_id,description,supplier,currency,quantity,unit_cost,total_cost,tax_amount,invoice_number,invoice_date', 'quotation_id', true),
    read<CostContainer>('quotation_containers', 'id,container_type_name,quantity'),
    client.from('agent_quotes').select('carrier,ocean_freight,profit_per_container,mbl_fee,mbl_quantity,moneda').eq('quotation_id', id).eq('is_selected', true).is('deleted_at', null).maybeSingle(),
    client.from('quotation_options').select('id,option_code,label,currency,cost_total,sale_subtotal,accepted_at').eq('quotation_id', id).eq('status', 'Aceptada'),
    client.from('shipments').select('id,shipment_number,operational_status,closed_at,shipping_instruction:shipping_instructions!inner(deleted_at),bookings(id,booking_number,carrier_booking,carrier,shipment_status,etd,eta,booking_containers(container_type,quantity))').eq('quotation_id', id).is('shipping_instruction.deleted_at', null),
    client.from('tax_rates').select('id,country,tax_name,percentage').eq('is_active', true).order('country'),
    client.from('invoices').select('id,invoice_number').eq('quotation_id', id).eq('invoice_type', 'Factura').neq('status', 'Anulada').is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!isCurrent()) throw new Error('Carga reemplazada')
  if ([agents, optionsResult, shipmentsResult, taxesResult, customerInvoiceResult].some(r => r.error)) throw new Error('No se pudo cargar todo el contexto de costos. Reintenta la consulta.')
  const customer = Array.isArray(quotation.clientes) ? quotation.clientes[0] : quotation.clientes
  return { quotation: { ...quotation, clientName: customer?.nombre || 'Sin cliente' }, pricing, invoices, containers: ['FCL', 'FTL'].includes(quotation.quote_type) ? containers : [],
    agent: quotation.quote_type === 'FCL' ? agents.data : null, options: optionsResult.data || [], shipments: shipmentsResult.data || [],
    taxes: taxesResult.data || [], customerInvoice: customerInvoiceResult.data }
}
