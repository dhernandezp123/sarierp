import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deliverEmail } from '@/src/lib/server/email-delivery'
import { readEmailEnvironment, EmailEnvironmentUnavailableError } from '@/src/lib/server/email-environment'
import { reportDiagnostic } from '@/src/lib/diagnostics'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUPPORTED_EVENTS = ['ticket_created', 'message_added', 'ticket_updated'] as const

type SupportEventType = typeof SUPPORTED_EVENTS[number]

type ProfileRow = {
  tenant_id?: string | null
  nombre: string | null
  apellido: string | null
  email: string | null
  rol?: string
  status?: string
  is_active?: boolean
  is_platform_admin?: boolean
}

type TicketRow = {
  id: string
  tenant_id: string
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: string
  created_by: string
  updated_at: string
  creator: ProfileRow | ProfileRow[] | null
}

function resolveJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function profileName(profile: ProfileRow | null) {
  const name = `${profile?.nombre ?? ''} ${profile?.apellido ?? ''}`.trim()
  return name || profile?.email || 'Usuario'
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export async function POST(request: Request) {
  const diagnostic: { tenantId?: string; entityId?: string } = {}
  try {
    const payload = await request.json() as {
      ticketId?: string
      eventType?: SupportEventType
      messageId?: string
    }

    if (!payload.ticketId || !payload.eventType || !SUPPORTED_EVENTS.includes(payload.eventType)) {
      return NextResponse.json({ ok: false, error: 'Evento de soporte inválido' }, { status: 400 })
    }

    if (payload.eventType === 'message_added' && !payload.messageId) {
      return NextResponse.json({ ok: false, error: 'El mensaje es requerido' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendApiKey = process.env.RESEND_API_KEY
    const outboundEmailEnabled = process.env.OUTBOUND_EMAIL_ENABLED === 'true'

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: 'Falta configuración segura del servidor' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: callerData, error: callerError } = await adminClient
      .from('profiles')
      .select('nombre, apellido, email, rol, status, is_active, is_platform_admin, tenant_id')
      .eq('id', authData.user.id)
      .single()

    const caller = callerData as ProfileRow | null
    if (
      callerError
      || !caller
      || caller.status !== 'Aprobado'
      || caller.is_active !== true
      || caller.rol === 'Cliente'
    ) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 })
    }

    if (await readEmailEnvironment(adminClient) === 'demo') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'demo' })
    }

    const { data: ticketData, error: ticketError } = await adminClient
      .from('support_tickets')
      .select(`
        id, tenant_id, ticket_number, subject, category, priority, status,
        created_by, updated_at,
        creator:profiles!support_tickets_created_by_fkey(nombre, apellido, email)
      `)
      .eq('id', payload.ticketId)
      .single()

    if (ticketError || !ticketData) {
      return NextResponse.json({ ok: false, error: 'Ticket no encontrado' }, { status: 404 })
    }

    const ticket = ticketData as unknown as TicketRow
    if (caller.is_platform_admin !== true && caller.tenant_id !== ticket.tenant_id) {
      return NextResponse.json({ ok: false, error: 'Ticket no encontrado' }, { status: 404 })
    }
    diagnostic.tenantId = ticket.tenant_id
    diagnostic.entityId = ticket.id

    const { data: tenantDomain } = await adminClient
      .from('tenant_domains')
      .select('hostname')
      .eq('tenant_id', ticket.tenant_id)
      .eq('is_primary', true)
      .eq('is_active', true)
      .single()
    if (!tenantDomain?.hostname) {
      return NextResponse.json(
        { ok: false, error: 'La empresa no tiene un dominio principal activo' },
        { status: 409 }
      )
    }
    let messageIsInternal = false
    if (payload.eventType === 'ticket_created') {
      if (ticket.created_by !== authData.user.id && caller.is_platform_admin !== true) {
        return NextResponse.json({ ok: false, error: 'No autorizado para notificar este ticket' }, { status: 403 })
      }
    } else if (payload.eventType === 'message_added') {
      const { data: message, error: messageError } = await adminClient
        .from('support_ticket_messages')
        .select('id, ticket_id, author_id, is_internal')
        .eq('id', payload.messageId!)
        .eq('ticket_id', ticket.id)
        .eq('tenant_id', ticket.tenant_id)
        .single()

      if (messageError || !message || message.author_id !== authData.user.id) {
        return NextResponse.json({ ok: false, error: 'No autorizado para notificar este mensaje' }, { status: 403 })
      }
      messageIsInternal = message.is_internal === true
      if (messageIsInternal) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'internal_note' })
      }
    } else if (caller.is_platform_admin !== true) {
      return NextResponse.json({ ok: false, error: 'Solo soporte puede notificar cambios administrativos' }, { status: 403 })
    }

    if (!outboundEmailEnabled) {
      return NextResponse.json({ ok: false, error: 'El correo transaccional no está habilitado' }, { status: 503 })
    }
    if (!resendApiKey) {
      return NextResponse.json({ ok: false, error: 'Falta configuración segura del servicio de correo' }, { status: 500 })
    }

    const { data: settings, error: settingsError } = await adminClient
      .from('support_settings')
      .select('enabled, support_email')
      .eq('singleton', true)
      .single()
    if (settingsError || !settings?.enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'support_disabled' })
    }

    const creator = resolveJoin(ticket.creator)
    const goesToSupport = payload.eventType === 'ticket_created'
      || (payload.eventType === 'message_added' && caller.is_platform_admin !== true)
    const recipientEmail = (goesToSupport ? settings.support_email : creator?.email)?.trim().toLowerCase() || ''
    if (!EMAIL_PATTERN.test(recipientEmail)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'invalid_recipient' })
    }

    const idempotencyKey = payload.eventType === 'message_added'
      ? `support/${payload.eventType}/${payload.messageId}`
      : payload.eventType === 'ticket_updated'
        ? `support/${payload.eventType}/${ticket.id}/${ticket.updated_at}`
        : `support/${payload.eventType}/${ticket.id}`

    const siteUrl = `https://${tenantDomain.hostname}`
    const ticketUrl = `${siteUrl}/support/${ticket.id}`
    const safeTicketNumber = escapeHtml(ticket.ticket_number)
    const safeSubject = escapeHtml(ticket.subject)
    const safeTicketUrl = escapeHtml(ticketUrl)
    const safeCallerName = escapeHtml(profileName(caller))
    const safeCreatorName = escapeHtml(profileName(creator))

    const subject = payload.eventType === 'ticket_created'
      ? `Nuevo ticket ${ticket.ticket_number} · ${ticket.subject}`
      : payload.eventType === 'message_added'
        ? `Nueva respuesta en ${ticket.ticket_number}`
        : `Actualización de ${ticket.ticket_number} · ${ticket.status}`
    const introduction = payload.eventType === 'ticket_created'
      ? `${safeCreatorName} registró un nuevo ticket de soporte.`
      : payload.eventType === 'message_added'
        ? `${safeCallerName} agregó una respuesta al ticket.`
        : `Soporte actualizó el estado o la prioridad del ticket.`

    const resendRequest = {
      from: process.env.RESEND_FROM_EMAIL || 'Forwarders ERP <no-reply@mail.forwarders.app>',
      to: [recipientEmail],
      reply_to: process.env.RESEND_REPLY_TO || settings.support_email,
      subject,
      text: `${introduction.replace(/<[^>]+>/g, '')} ${ticket.ticket_number}: ${ticket.subject}. Estado: ${ticket.status}. Ver: ${ticketUrl}`,
      html: `
        <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
          <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
            <div style="background:#07152b;padding:24px 28px;color:#ffffff">
              <div style="font-size:20px;font-weight:700">Forwarders ERP</div>
              <div style="margin-top:4px;color:#94a3b8;font-size:13px">Mesa de ayuda técnica</div>
            </div>
            <div style="padding:28px">
              <p style="margin:0 0 18px;line-height:1.6">${introduction}</p>
              <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:22px">
                <div style="font-size:12px;color:#64748b">Ticket</div>
                <div style="font-weight:700;margin-top:3px">${safeTicketNumber}</div>
                <div style="font-size:12px;color:#64748b;margin-top:12px">Asunto</div>
                <div style="font-weight:700;margin-top:3px">${safeSubject}</div>
                <div style="font-size:12px;color:#64748b;margin-top:12px">Estado · Prioridad</div>
                <div style="font-weight:700;margin-top:3px">${escapeHtml(ticket.status)} · ${escapeHtml(ticket.priority)}</div>
              </div>
              <a href="${safeTicketUrl}" style="display:inline-block;background:#155eef;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Ver ticket ${safeTicketNumber}</a>
              <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.5">Por seguridad, el enlace requiere iniciar sesión en la instalación correspondiente.</p>
            </div>
          </div>
        </div>
      `,
      tags: [
        { name: 'event', value: payload.eventType },
        { name: 'ticket', value: ticket.ticket_number },
        { name: 'tenant_id', value: ticket.tenant_id },
      ],
    }

    const result = await deliverEmail(adminClient, {
      table: 'support_notification_outbox', tenantId: ticket.tenant_id,
      identity: { idempotency_key: idempotencyKey },
      values: { ticket_id: ticket.id, message_id: payload.messageId || null, event_type: payload.eventType, recipient_email: recipientEmail },
      request: resendRequest, key: idempotencyKey, apiKey: resendApiKey,
    })
    if (result.status >= 500 || result.body.uncertain) {
      const reference = reportDiagnostic('support_email_failed', {
        ...diagnostic, code: result.body.uncertain ? 'DELIVERY_UNCONFIRMED' : 'DELIVERY_FAILED',
      })
      return NextResponse.json({ ...result.body, reference, error: `${result.body.error} Referencia: ${reference}.` },
        { status: result.status, headers: { 'X-Request-ID': reference } })
    }
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    const reference = reportDiagnostic('support_email_failed', {
      ...diagnostic, code: error instanceof EmailEnvironmentUnavailableError ? 'ENVIRONMENT_UNAVAILABLE' : 'UNEXPECTED',
    })
    if (error instanceof EmailEnvironmentUnavailableError) {
      return NextResponse.json({ ok: false, error: `${error.message} Referencia: ${reference}.`, reference }, { status: 503, headers: { 'X-Request-ID': reference } })
    }
    return NextResponse.json({ ok: false, error: `Error interno al notificar soporte. Referencia: ${reference}.`, reference }, { status: 500, headers: { 'X-Request-ID': reference } })
  }
}
