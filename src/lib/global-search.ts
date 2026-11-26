import type { SupabaseClient } from '@supabase/supabase-js'
import { canAccessPath } from './permissions'

type Row = Record<string, string | null>
type Source = { table: string; label: string; path: string; fields: string[]; extra?: string[]; deleted?: boolean; href?: (row: Row) => string }
export const searchSources: Source[] = [
  { table: 'quotations', label: 'Cotización', path: '/quotations', fields: ['quotation_number', 'origen', 'destino', 'puerto_origen', 'puerto_destino', 'pricing_notes', 'client_notes'], deleted: true },
  { table: 'bookings', label: 'Booking', path: '/operations/bookings', fields: ['booking_number', 'carrier_booking', 'carrier'], extra: ['shipping_instruction_id'], href: r => `/operations/shipping-instructions/${r.shipping_instruction_id}/bookings/${r.id}` },
  { table: 'shipping_instructions', label: 'Instrucción de embarque', path: '/operations/shipping-instructions', fields: ['routing_number', 'reference_number'], deleted: true },
  { table: 'clientes', label: 'Cliente', path: '/clientes', fields: ['nombre', 'rtn', 'email'], deleted: true },
  { table: 'agents', label: 'Agente', path: '/agents', fields: ['name', 'country', 'contact_name', 'email'] },
  { table: 'suppliers', label: 'Proveedor', path: '/suppliers', fields: ['nombre', 'contacto', 'email'] },
  { table: 'invoices', label: 'Documento de facturación', path: '/invoicing', fields: ['invoice_number', 'cliente_nombre', 'cliente_rtn'], deleted: true },
]
export type SearchResult = { id: string; type: string; title: string; detail: string; href: string }
// Quote the PostgREST value and escape LIKE wildcards: user text never becomes filter syntax.
export function searchPattern(text: string) {
  return `"%${text.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/"/g, '\\"')}%"`
}
export async function searchRecords(client: SupabaseClient, text: string, role: string, tenantId: string, signal: AbortSignal) {
  const query = text.trim().slice(0, 120)
  if (query.length < 2) return { results: [] as SearchResult[], failed: [] as string[], limited: [] as string[] }
  const sources = searchSources.map(source => source.table === 'quotations' && role === 'Pricing'
    ? { ...source, path: '/pricing-comparison', href: (row: Row) => `/pricing-comparison?quotation=${row.id}` } : source
  ).filter(source => canAccessPath(role, source.table === 'quotations' && role === 'Pricing' ? source.path : `${source.path}/record`))
  const responses = await Promise.allSettled(sources.map(async source => {
    let request = client.from(source.table).select(['id', ...source.fields, ...(source.extra || [])].join(','))
      .eq('tenant_id', tenantId).or(source.fields.map(field => `${field}.ilike.${searchPattern(query)}`).join(','))
    if (source.deleted) request = request.is('deleted_at', null)
    const { data, error } = await request.order('id').limit(9).abortSignal(signal)
    if (error) throw error
    const rows = (data || []) as unknown as Row[]
    return { limited: rows.length > 8, results: rows.slice(0, 8).flatMap(row => {
      if (source.table === 'bookings' && !row.shipping_instruction_id) return []
      const href = source.href ? source.href(row) : `${source.path}/${row.id}`
      if (!canAccessPath(role, href.split('?')[0])) return []
      const values = source.fields.map(field => row[field]).filter((v): v is string => !!v)
      const match = values.find(v => v.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      return [{ id: `${source.table}:${row.id}`, type: source.label, title: values[0] || source.label, detail: (match || values[1] || '').slice(0, 180), href }]
    }) }
  }))
  return {
    results: responses.flatMap(r => r.status === 'fulfilled' ? r.value.results : []),
    failed: responses.flatMap((r, i) => r.status === 'rejected' ? [sources[i].label] : []),
    limited: responses.flatMap((r, i) => r.status === 'fulfilled' && r.value.limited ? [sources[i].label] : []),
  }
}
