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
