import { supabase } from '@/src/lib/supabase/client'

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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    module,
    action,
    entity_type: entityType || null,
    entity_id: entityId || null,
    description,
    metadata: metadata || null,
  })
}