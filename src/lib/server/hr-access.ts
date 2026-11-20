import type { User } from '@supabase/supabase-js'
import { createClient } from '@/src/lib/supabase/server'
import { canManageHr, canUseHrSelfService } from '@/src/lib/hr'
import { headers } from 'next/headers'
import { profileMatchesAccessContext, readTenantHeaders } from '@/src/lib/tenant-context'

type Profile = { id: string; tenant_id: string; rol: string; status: string; is_active: boolean; is_platform_admin: boolean }
type Session = { ok: true; client: Awaited<ReturnType<typeof createClient>>; user: User; profile: Profile } | { ok: false; response: Response }
export async function requireHrSession(manager = false): Promise<Session> {
  const client = await createClient(), { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return { ok: false, response: Response.json({ error: 'Inicia sesión para continuar.' }, { status: 401 }) }
  const profileResult = await client.from('profiles').select('id,tenant_id,rol,status,is_active,is_platform_admin').eq('id', user.id).maybeSingle<Profile>()
  if (profileResult.error) return { ok: false, response: Response.json({ error: 'No se pudo validar tu acceso.' }, { status: 503 }) }
  const profile = profileResult.data
  if (!profile?.tenant_id || !(manager ? canManageHr(profile) : canUseHrSelfService(profile)) || !profileMatchesAccessContext(profile, readTenantHeaders(await headers()))) return { ok: false, response: Response.json({ error: 'No autorizado.' }, { status: 403 }) }
  return { ok: true, client, user, profile }
}
