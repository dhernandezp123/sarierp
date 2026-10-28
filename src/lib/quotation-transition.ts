import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuotationLossReason } from './quotation-loss-reasons'

type QuotationState = { id: string; status: string; status_revision?: number | string | null }
type TransitionOptions = {
  reason?: string
  loss?: { reason: QuotationLossReason; detail: string }
  syncOperation?: boolean
}

export function quotationRevision(quotation: QuotationState) {
  const raw = quotation.status_revision
  if (raw === null || raw === undefined || (typeof raw === 'string' && !/^\d+$/.test(raw))) {
    throw new Error('Recarga la cotización antes de continuar.')
  }
  const revision = Number(raw)
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Versión de cotización inválida. Recarga antes de continuar.')
  return revision
}

export async function transitionQuotation(
  client: Pick<SupabaseClient, 'rpc'>,
  quotation: QuotationState,
  nextStatus: string,
  options: TransitionOptions = {}
) {
  const revision = quotationRevision(quotation)
  const { data, error } = await client.rpc('transition_quotation', {
    p_quotation_id: quotation.id,
    p_expected_status: quotation.status,
    p_expected_revision: revision,
    p_new_status: nextStatus,
    p_reason: options.reason?.trim() || null,
    p_loss_reason: options.loss?.reason || null,
    p_loss_detail: options.loss?.detail.trim() || null,
    p_sync_operation: options.syncOperation || false,
  })
  if (error) throw new Error(error.message)
  if (!data || Array.isArray(data) || data.id !== quotation.id || data.status !== nextStatus
    || quotationRevision(data) !== revision + 1) {
    throw new Error('No se confirmó la transición. Recarga la cotización antes de reintentar.')
  }
  return data as QuotationState & Record<string, unknown>
}
