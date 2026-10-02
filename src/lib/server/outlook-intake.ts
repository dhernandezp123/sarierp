import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { SARI_MAILBOX, validateGraphCursor } from '@/src/lib/mail-intake'

export function intakeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Falta configuración de Supabase en el servidor')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function outlookToken() {
  const tenant = process.env.SARI_OUTLOOK_DIRECTORY_ID
  const client = process.env.SARI_OUTLOOK_CLIENT_ID
  const secret = process.env.SARI_OUTLOOK_CLIENT_SECRET
  if (!tenant || !/^[0-9a-f-]{36}$/i.test(tenant) || !client || !secret) {
    throw new Error('Falta configurar la aplicación de Microsoft 365')
  }
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: client, client_secret: secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
  })
  if (!response.ok) throw new Error(`Microsoft no autorizó la conexión (${response.status})`)
  const result = await response.json()
  if (typeof result.access_token !== 'string') throw new Error('Microsoft no devolvió un token')
  return result.access_token as string
}

export async function graphRequest(token: string, url: string, options: RequestInit = {}) {
  // All paths are generated locally; cursors are separately validated before use.
  if (new URL(url).origin !== 'https://graph.microsoft.com') throw new Error('Destino Graph inválido')
  return fetch(url, { ...options, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    Prefer: 'IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=5',
    ...options.headers,
  } })
}

export function inboxDeltaUrl(startsAt: string, cursor: string | null) {
  if (cursor) return validateGraphCursor(cursor, SARI_MAILBOX)
  const url = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SARI_MAILBOX)}/mailFolders/inbox/messages/delta`)
  url.searchParams.set('$select', 'id,internetMessageId,conversationId,subject,receivedDateTime,from,body,internetMessageHeaders')
  url.searchParams.set('$filter', `receivedDateTime ge ${new Date(startsAt).toISOString()}`)
  url.searchParams.set('changeType', 'created')
  return url.toString()
}

export async function isIntakeDemo(admin: ReturnType<typeof intakeAdminClient>) {
  const { data, error } = await admin.rpc('mail_intake_is_demo')
  if (error) throw new Error('No se pudo verificar el ambiente')
  return data === true || process.env.APP_ENV?.trim().toLowerCase() === 'demo' || process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() === 'demo'
}
