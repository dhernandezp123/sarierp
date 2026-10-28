import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export class EmailEnvironmentUnavailableError extends Error {
  constructor() {
    super('No se pudo verificar el ambiente. El correo permanece bloqueado.')
    this.name = 'EmailEnvironmentUnavailableError'
  }
}

// A local demo flag is a veto. A local production flag is never a substitute
// for a verified database environment. Do not cache this decision across calls.
export async function readEmailEnvironment(
  admin: Pick<SupabaseClient, 'from'>
): Promise<'demo' | 'production'> {
  if (process.env.APP_ENV?.trim().toLowerCase() === 'demo'
    || process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() === 'demo') return 'demo'

  let result
  try {
    result = await admin.from('platform_environment').select('environment')
      .eq('singleton', true).maybeSingle()
  } catch {
    throw new EmailEnvironmentUnavailableError()
  }
  if (result.error || !result.data
    || (result.data.environment !== 'production' && result.data.environment !== 'demo')) {
    throw new EmailEnvironmentUnavailableError()
  }
  return result.data.environment
}
