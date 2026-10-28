import { timingSafeEqual, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { classifyIntakeMessage, intakeAcknowledgement, SARI_MAILBOX, SARI_MAIL_HOST, OUTLOOK_INTAKE_STANDBY, type IntakeMessage } from '@/src/lib/mail-intake'
import { intakeAdminClient, outlookToken, graphRequest, inboxDeltaUrl, isIntakeDemo } from '@/src/lib/server/outlook-intake'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  if (OUTLOOK_INTAKE_STANDBY) return NextResponse.json({ error: 'Integración de Outlook en espera' }, { status: 503 })
  const expected = process.env.SARI_OUTLOOK_RUN_SECRET
  const authorization = request.headers.get('authorization') || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expected || expected.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(expected)
    || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  let admin: ReturnType<typeof intakeAdminClient> | undefined
  let tenantId: string | undefined
  const lockToken = randomUUID()
  try {
    admin = intakeAdminClient()
    if (await isIntakeDemo(admin) || process.env.OUTBOUND_EMAIL_ENABLED !== 'true') {
      return NextResponse.json({ skipped: true, reason: 'Correo bloqueado en este ambiente' })
    }
    const { data: domain, error: domainError } = await admin.from('tenant_domains')
      .select('tenant_id, tenants!inner(status)').eq('hostname', SARI_MAIL_HOST).eq('is_active', true).eq('tenants.status', 'Activo').single()
    if (domainError || !domain) throw new Error('Empresa Sari no disponible')
    tenantId = domain.tenant_id
    const { data: cfg, error: cfgError } = await admin.from('mail_intake_settings').select('*').eq('tenant_id', tenantId).single()
    if (cfgError) throw new Error('Falta aplicar la migración de correo')
    if (!cfg.enabled || cfg.mailbox !== SARI_MAILBOX || !cfg.starts_at) return NextResponse.json({ skipped: true, reason: 'Integración desactivada' })
    const { data: lease, error: leaseError } = await admin.from('mail_intake_runtime')
      .update({ lock_token: lockToken, locked_until: new Date(Date.now() + 120000).toISOString() })
      .eq('tenant_id', tenantId).or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`).select('cursor').maybeSingle()
    if (leaseError) throw new Error('No se pudo bloquear la sincronización')
    if (!lease) return NextResponse.json({ skipped: true, reason: 'Sincronización en curso' })
    const token = await outlookToken()
    // A previous send may have reached Microsoft despite a timeout/crash. Never resend it automatically.
    const { error: recoverError } = await admin.from('mail_intake_messages').update({ status: 'uncertain' }).eq('tenant_id', tenantId).eq('status', 'sending')
    if (recoverError) throw new Error('No se pudo recuperar el estado de envíos')
    const response = await graphRequest(token, inboxDeltaUrl(cfg.starts_at, lease.cursor))
    if (!response.ok) throw new Error(`No se pudo leer Outlook (${response.status}); no se avanzó el cursor`)
    const batch = await response.json() as { value: IntakeMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }
    if (!Array.isArray(batch.value)) throw new Error('Respuesta de Outlook inválida')
    for (const message of batch.value) {
      if (message['@removed'] || !message.receivedDateTime || new Date(message.receivedDateTime) < new Date(cfg.starts_at)) continue
      const sender = message.from?.emailAddress?.address || ''
      if (!sender) continue
      const { error } = await admin.rpc('register_mail_intake_message', { p_tenant_id: tenantId,
        p_decision: classifyIntakeMessage(message, SARI_MAILBOX), p_message: {
          message_id: message.id, conversation_id: message.conversationId, sender,
          sender_name: message.from?.emailAddress?.name, subject: message.subject,
          received_at: message.receivedDateTime, body: message.body?.content,
        } })
      if (error) throw new Error('No se pudo registrar una solicitud; se reintentará sin duplicarla')
    }
    const cursor = batch['@odata.nextLink'] || batch['@odata.deltaLink']
    if (!cursor) throw new Error('Outlook no devolvió un cursor')
    // Validate before persisting any provider-controlled URL.
    inboxDeltaUrl(cfg.starts_at, cursor)
    const { error: cursorError } = await admin.from('mail_intake_runtime').update({ cursor, last_run_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('lock_token', lockToken)
    if (cursorError) throw new Error('No se pudo guardar el avance')
    const { data: pending, error: pendingError } = await admin.from('mail_intake_messages')
      .select('id,message_id,quotation_id,quotations(quotation_number)').eq('tenant_id', tenantId).eq('status', 'ready').gte('received_at', cfg.starts_at).limit(2)
    if (pendingError) throw new Error('No se pudieron consultar los acuses pendientes')
    let accepted = 0
    for (const item of pending || []) {
      // Recheck the opt-in immediately before each external action.
      const { data: current, error: currentError } = await admin.from('mail_intake_settings').select('enabled,starts_at').eq('tenant_id', tenantId).single()
      if (currentError || !current?.enabled || current.starts_at !== cfg.starts_at) break
      const quote = (Array.isArray(item.quotations) ? item.quotations[0] : item.quotations) as { quotation_number: string } | null
      if (!quote?.quotation_number) throw new Error('Cotización sin referencia; acuse bloqueado')
      const { data: claimed, error: claimError } = await admin.from('mail_intake_messages').update({ status: 'sending' }).eq('id', item.id).eq('tenant_id', tenantId).eq('status', 'ready').select('id').maybeSingle()
      if (claimError) throw new Error('No se pudo reservar el acuse')
      if (!claimed) continue
      let status = 'uncertain'
      try {
        const reply = await graphRequest(token, `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SARI_MAILBOX)}/messages/${encodeURIComponent(item.message_id)}/reply`, {
          method: 'POST', body: JSON.stringify({ comment: intakeAcknowledgement(quote.quotation_number) }),
        })
        if (reply.status === 202) { status = 'accepted'; accepted++ }
      } finally {
        const { error: updateError } = await admin.from('mail_intake_messages').update({ status }).eq('id', item.id).eq('tenant_id', tenantId)
        if (updateError) throw new Error('Acuse pendiente de conciliación; no se reenviará automáticamente')
      }
    }
    return NextResponse.json({ ok: true, checked: batch.value.length, accepted })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falló la sincronización' }, { status: 503 })
  } finally {
    if (tenantId && admin) await admin.from('mail_intake_runtime').update({ lock_token: null, locked_until: null }).eq('tenant_id', tenantId).eq('lock_token', lockToken)
  }
}
