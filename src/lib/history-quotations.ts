import type { SupabaseClient } from '@supabase/supabase-js'
import { readAllReportRows, readReportRowsByIds } from './report-query'

type HistoryQuotation = { id: string; [field: string]: unknown }
type AgentValidity = { id: string; quotation_id: string; valid_until: string | null; is_selected: boolean }
type QuantityLine = { id: string; quotation_id: string; quantity: number }

export async function loadHistoricalQuotations(client: Pick<SupabaseClient, 'from'>, isCurrent = () => true) {
  const rows = await readAllReportRows((from, to) => client.from('quotations')
    .select('*, cliente:clientes(*), created_by_profile:profiles!quotations_created_by_fkey(*)')
    .is('deleted_at', null).order('created_at', { ascending: false }).order('id').range(from, to),
  { label: 'historico de cotizaciones', isCurrent }) as HistoryQuotation[]
  const ids = rows.map(row => row.id)
  const [agents, containers, cargo] = await Promise.all([
    readReportRowsByIds<AgentValidity>(ids, (batch, from, to) => client.from('agent_quotes')
      .select('id, quotation_id, valid_until, is_selected').in('quotation_id', batch).order('id').range(from, to),
    { label: 'vigencias de agentes', isCurrent }),
    readReportRowsByIds<QuantityLine>(ids, (batch, from, to) => client.from('quotation_containers')
      .select('id, quotation_id, quantity').in('quotation_id', batch).order('id').range(from, to),
    { label: 'contenedores del historico', isCurrent }),
    readReportRowsByIds<QuantityLine>(ids, (batch, from, to) => client.from('quotation_cargo_lines')
      .select('id, quotation_id, quantity').in('quotation_id', batch).order('id').range(from, to),
    { label: 'carga del historico', isCurrent }),
  ])
  const group = <T extends { quotation_id: string }>(items: T[]) => {
    const groups = new Map<string, T[]>()
    for (const item of items) { const rows = groups.get(item.quotation_id) || []; rows.push(item); groups.set(item.quotation_id, rows) }
    return groups
  }
  const byAgent = group(agents), byContainer = group(containers), byCargo = group(cargo)
  return rows.map(row => ({ ...row, agent_quotes: byAgent.get(row.id) || [], quotation_containers: byContainer.get(row.id) || [], quotation_cargo_lines: byCargo.get(row.id) || [] }))
}
