import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatMiamiDateTime } from '@/src/lib/format'

const EVENT_TYPE = 'miami_package_assigned'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ClientRow = {
  nombre: string | null
  contacto: string | null
  email_1: string | null
}

type PackageRow = {
  id: string
  tracking_number: string
  warehouse_number: string | null
  status: string
  assigned_at: string | null
  received_at: string
  cliente_id: string | null
  clientes: ClientRow | ClientRow[] | null
}

type DeliveryRow = {
  id: string
  status: 'processing' | 'sent' | 'failed'
  attempts: number
  updated_at: string
}

function resolveJoin<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
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
    const { packageId } = await request.json() as { packageId?: string }
    if (!packageId) {
      return NextResponse.json({ ok: false, error: 'El paquete es requerido' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const resendApiKey = process.env.RESEND_API_KEY
    const outboundEmailEnabled = process.env.OUTBOUND_EMAIL_ENABLED === 'true'
    let isDemoEnvironment =
      process.env.APP_ENV?.trim().toLowerCase() === 'demo'
      || process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() === 'demo'

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { ok: false, error: 'Falta configuración segura del servidor' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('rol, status, is_active')
      .eq('id', authData.user.id)
      .single()

    if (
      profileError
      || !profile
      || !['Admin', 'Operaciones'].includes(profile.rol)
      || profile.status !== 'Aprobado'
      || profile.is_active === false
    ) {
      return NextResponse.json(
        { ok: false, error: 'Solo Administración u Operaciones pueden enviar este aviso' },
        { status: 403 }
      )
    }

    const { data: environmentData } = await supabaseAdmin
      .from('platform_environment')
      .select('environment')
      .eq('singleton', true)
      .maybeSingle()
    isDemoEnvironment = isDemoEnvironment || environmentData?.environment === 'demo'

    if (isDemoEnvironment) {
      return NextResponse.json(
        { ok: false, error: 'Los correos están bloqueados en el ambiente demo' },
        { status: 403 }
      )
    }

    if (!outboundEmailEnabled) {
      return NextResponse.json(
        { ok: false, error: 'El correo transaccional no está habilitado en este ambiente' },
        { status: 503 }
      )
    }

    if (!resendApiKey) {
      return NextResponse.json(
        { ok: false, error: 'Falta configuración segura del servicio de correo' },
        { status: 500 }
      )
    }

    const { data: packageData, error: packageError } = await supabaseAdmin
      .from('miami_packages')
      .select('id, tracking_number, warehouse_number, status, assigned_at, received_at, cliente_id, clientes(nombre, contacto, email_1)')
      .eq('id', packageId)
      .single()

    if (packageError || !packageData) {
      return NextResponse.json({ ok: false, error: 'Paquete no encontrado' }, { status: 404 })
    }

    const pkg = packageData as unknown as PackageRow
    if (pkg.status !== 'Asignado' || !pkg.cliente_id || !pkg.warehouse_number) {
      return NextResponse.json(
        { ok: false, error: 'El paquete todavía no está asignado a un cliente' },
        { status: 409 }
      )
    }

    const client = resolveJoin(pkg.clientes)
    const recipientEmail = client?.email_1?.trim().toLowerCase() || ''
    if (!EMAIL_PATTERN.test(recipientEmail)) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const { data: existingData, error: existingError } = await supabaseAdmin
      .from('client_email_deliveries')
      .select('id, status, attempts, updated_at')
      .eq('package_id', pkg.id)
      .eq('event_type', EVENT_TYPE)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo validar la auditoría del correo' },
        { status: 500 }
      )
    }

    let delivery: DeliveryRow
    const existing = existingData as DeliveryRow | null
    if (existing?.status === 'sent') {
      return NextResponse.json({ ok: true, alreadySent: true })
    }
    if (existing?.status === 'processing') {
      return NextResponse.json({ ok: true, alreadySent: true })
    }
    if (existing && existing.attempts >= 5) {
      return NextResponse.json(
        { ok: false, error: 'El aviso alcanzó el máximo de intentos' },
        { status: 429 }
      )
    }

    if (existing) {
      const now = new Date().toISOString()
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('client_email_deliveries')
        .update({
          status: 'processing',
          attempts: existing.attempts + 1,
          recipient_email: recipientEmail,
          error_message: null,
          updated_at: now,
        })
        .eq('id', existing.id)
        .eq('status', 'failed')
        .eq('updated_at', existing.updated_at)
        .select('id, status, attempts, updated_at')
        .maybeSingle()

      if (claimError || !claimed) {
        return NextResponse.json({ ok: true, alreadySent: true })
      }
      delivery = claimed as DeliveryRow
    } else {
      const { data: created, error: createError } = await supabaseAdmin
        .from('client_email_deliveries')
        .insert({
          package_id: pkg.id,
          event_type: EVENT_TYPE,
          recipient_email: recipientEmail,
          status: 'processing',
          attempts: 1,
        })
        .select('id, status, attempts, updated_at')
        .single()

      if (createError || !created) {
        if (createError?.code === '23505') {
          return NextResponse.json({ ok: true, alreadySent: true })
        }
        return NextResponse.json(
          { ok: false, error: 'No se pudo iniciar la auditoría del correo' },
          { status: 500 }
        )
      }
      delivery = created as DeliveryRow
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://forwarders.app').replace(/\/$/, '')
    const uploadUrl = `${siteUrl}/portal/paquetes/${pkg.id}?section=factura-comercial#factura-comercial`
    const contactName = client?.contacto?.trim() || 'cliente'
    const tracking = escapeHtml(pkg.tracking_number)
    const warehouseNumber = escapeHtml(pkg.warehouse_number)
    const receivedLabel = formatMiamiDateTime(pkg.received_at)
    const safeReceivedLabel = escapeHtml(receivedLabel)
    const safeContactName = escapeHtml(contactName)
    const safeUploadUrl = escapeHtml(uploadUrl)
    const sender = process.env.RESEND_FROM_EMAIL
      || 'Forwarders ERP <no-reply@mail.forwarders.app>'
    const replyTo = process.env.RESEND_REPLY_TO || 'contacto@forwarders.app'

    const resendRequest = {
        from: sender,
        to: [recipientEmail],
        reply_to: replyTo,
        subject: `Carga recibida en Miami · ${pkg.warehouse_number}`,
        text:
          `Hola ${contactName}, recibimos tu carga ${pkg.tracking_number} en Miami. `
          + `Número de bodega: ${pkg.warehouse_number}. Recibida: ${receivedLabel}. `
          + `Adjunta tu factura comercial aquí: ${uploadUrl}`,
        html: `
          <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a">
            <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
              <div style="background:#07152b;padding:24px 28px;color:#ffffff">
                <div style="font-size:20px;font-weight:700">Forwarders ERP</div>
                <div style="margin-top:4px;color:#94a3b8;font-size:13px">Notificación de bodega Miami</div>
              </div>
              <div style="padding:28px">
                <p style="margin:0 0 16px">Hola ${safeContactName},</p>
                <p style="margin:0 0 20px;line-height:1.6">Recibimos tu carga en nuestra bodega de Miami y ya fue asignada a tu perfil.</p>
                <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:22px">
                  <div style="font-size:12px;color:#64748b">Tracking</div>
                  <div style="font-weight:700;margin-top:3px">${tracking}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:12px">Número de bodega</div>
                  <div style="font-weight:700;margin-top:3px">${warehouseNumber}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:12px">Recibida</div>
                  <div style="font-weight:700;margin-top:3px">${safeReceivedLabel}</div>
                </div>
                <p style="margin:0 0 20px;line-height:1.6">Adjunta la factura comercial de tu compra para evitar retrasos durante la consolidación y el tránsito.</p>
                <a href="${safeUploadUrl}" style="display:inline-block;background:#155eef;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Adjuntar factura comercial</a>
                <p style="margin:18px 0 0;color:#64748b;font-size:12px;line-height:1.5">Por seguridad, deberás iniciar sesión en el portal. El enlace no permite acceso público a tu información.</p>
              </div>
            </div>
          </div>
        `,
        tags: [
          { name: 'event', value: EVENT_TYPE },
          { name: 'package_id', value: pkg.id },
        ],
      }

    let resendResponse: Response
    try {
      resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `${EVENT_TYPE}/${pkg.id}`,
        },
        body: JSON.stringify(resendRequest),
      })
    } catch {
      await supabaseAdmin
        .from('client_email_deliveries')
        .update({
          status: 'failed',
          error_message: 'No se pudo conectar con Resend',
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id)

      return NextResponse.json(
        { ok: false, error: 'No se pudo conectar con Resend' },
        { status: 502 }
      )
    }

    const resendPayload = await resendResponse.json() as {
      id?: string
      message?: string
      error?: { message?: string }
    }

    if (!resendResponse.ok || !resendPayload.id) {
      const errorMessage = resendPayload.message
        || resendPayload.error?.message
        || `Resend respondió ${resendResponse.status}`
      await supabaseAdmin
        .from('client_email_deliveries')
        .update({
          status: 'failed',
          error_message: errorMessage.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', delivery.id)

      return NextResponse.json(
        { ok: false, error: 'Resend no aceptó el correo' },
        { status: 502 }
      )
    }

    const sentAt = new Date().toISOString()
    const { error: deliveryUpdateError } = await supabaseAdmin
      .from('client_email_deliveries')
      .update({
        status: 'sent',
        resend_message_id: resendPayload.id,
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq('id', delivery.id)

    if (deliveryUpdateError) {
      return NextResponse.json(
        { ok: false, error: 'El correo fue enviado, pero falta conciliar su auditoría' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, sent: true })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Error interno al enviar el aviso' },
      { status: 500 }
    )
  }
}
