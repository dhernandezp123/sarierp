import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SUPPORTED_EVENTS = ['ticket_created', 'message_added', 'ticket_updated'] as const

type SupportEventType = typeof SUPPORTED_EVENTS[number]

type ProfileRow = {
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
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: string
  created_by: string
  updated_at: string
  creator: ProfileRow | ProfileRow[] | null
}

type DeliveryRow = {
  id: string
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'skipped'
  attempts: number
  updated_at: string
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
      .select('nombre, apellido, email, rol, status, is_active, is_platform_admin')
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

    const { data: environmentData } = await adminClient
      .from('platform_environment')
      .select('environment')
      .eq('singleton', true)
      .maybeSingle()
    const isDemoEnvironment =
      process.env.APP_ENV?.trim().toLowerCase() === 'demo'
      || process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() === 'demo'
      || environmentData?.environment === 'demo'

    if (isDemoEnvironment) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'demo' })
    }

    const { data: ticketData, error: ticketError } = await adminClient
      .from('support_tickets')
      .select(`
        id, ticket_number, subject, category, priority, status,
        created_by, updated_at,
        creator:profiles!support_tickets_created_by_fkey(nombre, apellido, email)
      `)
      .eq('id', payload.ticketId)
      .single()

    if (ticketError || !ticketData) {
      return NextResponse.json({ ok: false, error: 'Ticket no encontrado' }, { status: 404 })
    }

    const ticket = ticketData as unknown as TicketRow
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

    const { data: existingData, error: existingError } = await adminClient
      .from('support_notification_outbox')
      .select('id, status, attempts, updated_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existingError) {
      return NextResponse.json({ ok: false, error: 'No se pudo validar la auditoría del correo' }, { status: 500 })
    }

    let delivery: DeliveryRow
    const existing = existingData as DeliveryRow | null
    if (existing?.status === 'sent' || existing?.status === 'processing') {
      return NextResponse.json({ ok: true, alreadySent: true })
    }
    if (existing && existing.attempts >= 5) {
      return NextResponse.json({ ok: false, error: 'El aviso alcanzó el máximo de intentos' }, { status: 429 })
    }

    if (existing) {
      const { data: claimed, error: claimError } = await adminClient
        .from('support_notification_outbox')
        .update({
          status: 'processing',
          attempts: existing.attempts + 1,
          recipient_email: recipientEmail,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .eq('status', 'failed')
        .eq('updated_at', existing.updated_at)
        .select('id, status, attempts, updated_at')
        .maybeSingle()
      if (claimError || !claimed) return NextResponse.json({ ok: true, alreadySent: true })
      delivery = claimed as DeliveryRow
    } else {
      const { data: created, error: createError } = await adminClient
        .from('support_notification_outbox')
        .insert({
          ticket_id: ticket.id,
          message_id: payload.messageId || null,
          event_type: payload.eventType,
          recipient_email: recipientEmail,
          idempotency_key: idempotencyKey,
          status: 'processing',
          attempts: 1,
        })
        .select('id, status, attempts, updated_at')
        .single()
      if (createError || !created) {
        if (createError?.code === '23505') return NextResponse.json({ ok: true, alreadySent: true })
        return NextResponse.json({ ok: false, error: 'No se pudo iniciar la auditoría del correo' }, { status: 500 })
      }
      delivery = created as DeliveryRow
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://forwarders.app').replace(/\/$/, '')
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
      ],
    }

    let resendResponse: Response
    try {
      resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(resendRequest),
      })
    } catch {
      await adminClient
        .from('support_notification_outbox')
        .update({ status: 'failed', error_message: 'No se pudo conectar con Resend', updated_at: new Date().toISOString() })
        .eq('id', delivery.id)
      return NextResponse.json({ ok: false, error: 'No se pudo conectar con Resend' }, { status: 502 })
    }

    const resendPayload = await resendResponse.json() as {
      id?: string
      message?: string
      error?: { message?: string }
    }
    if (!resendResponse.ok || !resendPayload.id) {
      const errorMessage = resendPayload.message || resendPayload.error?.message || `Resend respondió ${resendResponse.status}`
      await adminClient
        .from('support_notification_outbox')
        .update({ status: 'failed', error_message: errorMessage.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('id', delivery.id)
      return NextResponse.json({ ok: false, error: 'Resend no aceptó el correo' }, { status: 502 })
    }

    const sentAt = new Date().toISOString()
    const { error: updateError } = await adminClient
      .from('support_notification_outbox')
      .update({
        status: 'sent',
        resend_message_id: resendPayload.id,
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', delivery.id)

    if (updateError) {
      return NextResponse.json({ ok: false, error: 'El correo fue enviado, pero falta conciliar su auditoría' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sent: true })
  } catch {
    return NextResponse.json({ ok: false, error: 'Error interno al notificar soporte' }, { status: 500 })
  }
}
