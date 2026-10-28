import { supabase } from '@/src/lib/supabase/client'
import { reportDiagnostic } from '@/src/lib/diagnostics'
import { toast } from 'sonner'

type ActivityLogPayload = {
  module: string
  action: string
  entityType?: string
  entityId?: string
  description: string
  metadata?: Record<string, unknown>
}

export async function createActivityLog({
  module,
  action,
  entityType,
  entityId,
  description,
  metadata,
}: ActivityLogPayload) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) throw { code: 'AUTH_UNAVAILABLE' }
    const { error } = await supabase.from('activity_logs').insert({
      user_id: user.id,
      module,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      description,
      metadata: metadata || null,
    })
    if (error) throw error
    return { ok: true as const }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code : null
    const reference = reportDiagnostic('activity_log_failed', { entityId, code })
    toast.warning(`No se pudo registrar la actividad auxiliar. Referencia: ${reference}. Verifica el resultado de la operación antes de repetirla.`)
    return { ok: false as const, reference }
  }
}
