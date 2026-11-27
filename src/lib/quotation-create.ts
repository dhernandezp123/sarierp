import type { SupabaseClient } from '@supabase/supabase-js'
import { measureOperation } from './browser/measurements'

type CreationLines = {
  quotation: Record<string, unknown>
  containers: Record<string, unknown>[]
  cargo: Record<string, unknown>[]
  pricing: Record<string, unknown>[]
}

/** Keep parent, containers/cargo and automatic Miami pricing in the existing RPC. */
export async function createQuotation(client: Pick<SupabaseClient, 'rpc'>, lines: CreationLines) {
  return measureOperation('quotation_create', async () => {
    const { data, error } = await client.rpc('create_quotation_with_child_lines', {
      p_quotation_data: lines.quotation, p_container_lines: lines.containers,
      p_cargo_lines: lines.cargo, p_pricing_items: lines.pricing,
    })
    if (error) throw new Error(error.message)
    if (!Array.isArray(data) || data.length !== 1 || !data[0]
      || typeof data[0].id !== 'string' || !data[0].id
      || data[0].id !== lines.quotation.id
      || (data[0].quotation_number !== null && typeof data[0].quotation_number !== 'string')) {
      throw new Error('No se confirmó la creación. Consulta el listado antes de reintentar.')
    }
    return data[0] as { id: string; quotation_number: string | null }
  })
}

/**
 * WA-04: crea la cotización desde una solicitud de WhatsApp a nombre del vendedor que la pidió
 * y la vincula en la misma transacción. `newClient` crea el cliente dentro de la conversión.
 */
export async function convertWhatsappRequest(
  client: Pick<SupabaseClient, 'rpc'>,
  requestId: string,
  lines: CreationLines,
  newClient: Record<string, unknown> | null,
  /** Solo si la pidió Pricing y el cliente no tiene vendedor válido: vendedor Admin/Ventas elegido. */
  sellerId: string | null = null,
) {
  return measureOperation('quotation_create', async () => {
    const { data, error } = await client.rpc('whatsapp_convert_quote_request', {
      p_request_id: requestId, p_quotation_data: lines.quotation, p_container_lines: lines.containers,
      p_cargo_lines: lines.cargo, p_pricing_items: lines.pricing, p_new_client: newClient, p_seller_id: sellerId,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : null
    if (!row || typeof row.quotation_id !== 'string' || row.quotation_id !== lines.quotation.id) {
      throw new Error('No se confirmó la conversión. Revisa la solicitud antes de reintentar.')
    }
    return { id: row.quotation_id as string, quotation_number: (row.quotation_number ?? null) as string | null, cliente_id: row.cliente_id as string, seller_id: row.seller_id as string }
  })
}
