import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { readEmailEnvironment } from './email-environment'
import { RECOVERY_CALLBACK_PATH } from '../password-recovery'

export function recoveryAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Recovery unavailable')
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

export async function recoveryEnvironmentAllowed(admin: ReturnType<typeof recoveryAdminClient>) {
  return await readEmailEnvironment(admin) === 'production'
}

export async function sendRecoveryEmail(email: string, hostname: string) {
  // This client sends SMTP through Auth, never signs in or updates another user's password.
  // Implicit recovery lets the recipient open the email on their own browser/device.
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: 'implicit', autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  return auth.auth.resetPasswordForEmail(email, {
    redirectTo: `https://${hostname}${RECOVERY_CALLBACK_PATH}`,
  })
}
