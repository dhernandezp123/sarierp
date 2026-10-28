import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readEmailProviderResponse } from '@/src/lib/email-provider-response'

export const EMAIL_LEASE_MS = 2 * 60_000
export const EMAIL_REPLAY_MS = 23 * 60 * 60_000
export const EMAIL_TIMEOUT_MS = 20_000
const FIELDS = 'id,status,attempts,updated_at,recipient_email,resend_message_id,request_body,provider_key,provider_credential_hash,first_attempt_at,lease_token,retry_authorized'

type Delivery = {
  id: string
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped' | 'uncertain'
  attempts: number
  updated_at: string
  recipient_email: string
  resend_message_id: string | null
  request_body: string | null
  provider_key: string | null
  provider_credential_hash: string | null
  first_attempt_at: string | null
  lease_token: string | null
  retry_authorized: boolean
}
type Result = { status: number; body: { ok: boolean; sent?: boolean; alreadySent?: boolean; inProgress?: boolean; uncertain?: boolean; error?: string } }
type Options = {
  table: 'client_email_deliveries' | 'support_notification_outbox'
  tenantId: string
  identity: Record<string, string>
  values: Record<string, string | null>
  request: Record<string, unknown>
  key: string
  apiKey: string
}
const pending = (): Result => ({ status: 409, body: { ok: false, inProgress: true, error: 'El aviso sigue en curso. Espera antes de consultar de nuevo.' } })
const uncertain = (): Result => ({ status: 409, body: { ok: false, uncertain: true, error: 'El resultado del correo necesita conciliación. No se reenviará sin verificarlo.' } })
const auditError = (): Result => ({ status: 503, body: { ok: false, uncertain: true, error: 'No se pudo confirmar la auditoría del correo. Consulta su estado antes de reintentar.' } })

// Caller must authenticate, authorize resource/tenant and verify environment/opt-in first.
export async function deliverEmail(admin: Pick<SupabaseClient, 'from'>, options: Options): Promise<Result> {
  const { table, tenantId } = options
  let lookup = admin.from(table).select(FIELDS).eq('tenant_id', tenantId)
  for (const [field, value] of Object.entries(options.identity)) lookup = lookup.eq(field, value)
  const { data, error } = await lookup.maybeSingle()
  if (error) return auditError()
  const existing = data as Delivery | null
  const now = Date.now()
  const quarantine = async (): Promise<Result> => {
    if (!existing) return uncertain()
    try {
      const result = await admin.from(table).update({ status: 'uncertain', error_message: 'Sin evidencia o replay seguro; requiere conciliación', updated_at: new Date(now).toISOString() })
        .eq('id', existing.id).eq('tenant_id', tenantId).eq('status', existing.status).eq('updated_at', existing.updated_at)
      return result.error ? auditError() : uncertain()
    } catch { return auditError() }
  }
  if (existing?.status === 'sent') {
    return existing.resend_message_id?.trim() ? { status: 200, body: { ok: true, alreadySent: true } } : quarantine()
  }
  if (existing?.status === 'skipped') return uncertain()
  if (existing?.status === 'processing' && now - Date.parse(existing.updated_at) < EMAIL_LEASE_MS) return pending()

  const first = existing?.first_attempt_at ? Date.parse(existing.first_attempt_at) : NaN
  // An API key rotation might point to another account, where the same key has no history.
  const credentialHash = createHash('sha256').update(options.apiKey).digest('hex')
  const replay = !!existing?.request_body && !!existing.provider_key && Number.isFinite(first)
    && existing.provider_credential_hash === credentialHash
    && now >= first && now - first < EMAIL_REPLAY_MS - EMAIL_TIMEOUT_MS
  const fresh = !existing || (existing.retry_authorized === true && existing.status === 'failed')
    || (existing.status === 'pending' && existing.attempts === 0 && !existing.first_attempt_at)
  if (existing && !replay && !fresh) {
    // Legacy rows lack a frozen request. Even a legacy 'failed' might have been accepted.
    return quarantine()
  }
  if (existing && existing.attempts >= 5) return { status: 429, body: { ok: false, uncertain: existing.status !== 'failed', error: 'El aviso alcanzó el máximo de intentos. Requiere revisión.' } }
  const token = randomUUID()
  const claim = {
    status: 'processing', attempts: (existing?.attempts ?? 0) + 1,
    updated_at: new Date(now).toISOString(), lease_token: token, retry_authorized: false,
    error_message: null,
    recipient_email: replay ? existing!.recipient_email : options.values.recipient_email,
    // Replay uses exactly the persisted bytes and key, including the original recipient.
    request_body: replay ? existing!.request_body! : JSON.stringify(options.request),
    provider_key: replay ? existing!.provider_key! : `${options.key}/${randomUUID()}`,
    provider_credential_hash: credentialHash,
    first_attempt_at: replay ? existing!.first_attempt_at! : new Date(now).toISOString(),
  }
  let query
  if (existing) {
    query = admin.from(table).update(claim).eq('id', existing.id).eq('tenant_id', tenantId)
      .eq('status', existing.status).eq('updated_at', existing.updated_at)
  } else {
    query = admin.from(table).insert({ ...options.values, tenant_id: tenantId, ...options.identity, ...claim })
  }
  const { data: claimed, error: claimError } = await query.select(FIELDS).maybeSingle()
  if (claimError) return claimError.code === '23505' ? pending() : auditError()
  if (!claimed) return pending()
  const delivery = claimed as Delivery
  const finish = async (values: Record<string, unknown>) => {
    try {
      const result = await admin.from(table).update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', delivery.id).eq('tenant_id', tenantId).eq('status', 'processing').eq('lease_token', token)
        .select('id').maybeSingle()
      return !result.error && !!result.data
    } catch { return false }
  }
  // Database latency must not let a replay cross the provider's retention window.
  if (Date.now() - Date.parse(claim.first_attempt_at) >= EMAIL_REPLAY_MS - EMAIL_TIMEOUT_MS) {
    await finish({ status: 'uncertain', error_message: 'Ventana de replay agotada antes del envío' })
    return uncertain()
  }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      (async () => {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': claim.provider_key },
          body: claim.request_body, signal: controller.signal,
        })
        return { response, payload: await readEmailProviderResponse(response) }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Email timeout')) }, EMAIL_TIMEOUT_MS)
      }),
    ])
    if (result.response.ok && result.payload.id) {
      const saved = await finish({ status: 'sent', resend_message_id: result.payload.id, sent_at: new Date().toISOString(), error_message: null })
      return saved ? { status: 200, body: { ok: true, sent: true } } : auditError()
    }
    const rejected = [400, 401, 403, 404, 422].includes(result.response.status)
    const saved = await finish({ status: rejected ? 'failed' : 'uncertain', error_message: result.payload.message.slice(0, 500) })
    if (!saved) return auditError()
    return { status: 502, body: { ok: false, uncertain: !rejected, error: rejected ? 'Resend rechazó el correo' : 'No se pudo confirmar la aceptación del correo. Consulta su estado antes de reintentar.' } }
  } catch {
    const saved = await finish({ status: 'uncertain', error_message: 'Conexión interrumpida o timeout; aceptación no confirmada' })
    if (!saved) return auditError()
    return { status: 502, body: { ok: false, uncertain: true, error: 'Se perdió la confirmación del correo. Consulta su estado antes de reintentar.' } }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
