import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deliverEmail } from '@/src/lib/server/email-delivery'
import { formatMiamiDateTime } from '@/src/lib/format'
import { loadTenantEmailBranding } from '@/src/lib/company-settings'
import { readEmailEnvironment, EmailEnvironmentUnavailableError } from '@/src/lib/server/email-environment'
import { reportDiagnostic } from '@/src/lib/diagnostics'

const EVENT_TYPE = 'miami_package_assigned'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ClientRow = {
  nombre: string | null
  contacto: string | null
  email_1: string | null
}

type PackageRow = {
  id: string
  tenant_id: string
  tracking_number: string
  warehouse_number: string | null
  status: string
  assigned_at: string | null
  received_at: string
  cliente_id: string | null
  clientes: ClientRow | ClientRow[] | null
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
  const diagnostic: { tenantId?: string; entityId?: string } = {}
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
      .select('rol, status, is_active, tenant_id, is_platform_admin')
      .eq('id', authData.user.id)
      .single()

    if (
      profileError
      || !profile
      || !['Admin', 'Operaciones'].includes(profile.rol)
      || profile.status !== 'Aprobado'
      || profile.is_active !== true
      || profile.is_platform_admin === true
      || !profile.tenant_id
    ) {
      return NextResponse.json(
        { ok: false, error: 'Solo Administración u Operaciones pueden enviar este aviso' },
        { status: 403 }
      )
    }

    if (await readEmailEnvironment(supabaseAdmin) === 'demo') {
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
      .select('id, tenant_id, tracking_number, warehouse_number, status, assigned_at, received_at, cliente_id, clientes(nombre, contacto, email_1)')
      .eq('id', packageId)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (packageError || !packageData) {
      return NextResponse.json({ ok: false, error: 'Paquete no encontrado' }, { status: 404 })
    }

    const pkg = packageData as unknown as PackageRow
    diagnostic.tenantId = pkg.tenant_id
    diagnostic.entityId = pkg.id
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

    const [{ data: tenantDomain }, { data: companySettings }] = await Promise.all([
      supabaseAdmin
        .from('tenant_domains')
        .select('hostname')
        .eq('tenant_id', pkg.tenant_id)
        .eq('is_primary', true)
        .eq('is_active', true)
        .single(),
      loadTenantEmailBranding(supabaseAdmin, pkg.tenant_id),
    ])
    if (!tenantDomain?.hostname) {
      return NextResponse.json(
        { ok: false, error: 'La empresa no tiene un dominio principal activo' },
        { status: 409 }
      )
    }

    const siteUrl = `https://${tenantDomain.hostname}`
    const uploadUrl = `${siteUrl}/portal/paquetes/${pkg.id}?section=factura-comercial#factura-comercial`
    const contactName = client?.contacto?.trim() || 'cliente'
    const tracking = escapeHtml(pkg.tracking_number)
    const warehouseNumber = escapeHtml(pkg.warehouse_number)
    const receivedLabel = formatMiamiDateTime(pkg.received_at)
    const safeReceivedLabel = escapeHtml(receivedLabel)
    const safeContactName = escapeHtml(contactName)
    const safeUploadUrl = escapeHtml(uploadUrl)
    const companyName = companySettings?.trade_name?.trim()
      || companySettings?.legal_name?.trim()
      || 'Empresa logística'
    const safeCompanyName = escapeHtml(companyName)
    const sender = process.env.RESEND_FROM_EMAIL
      || 'Forwarders ERP <no-reply@mail.forwarders.app>'
    const replyTo = companySettings?.email?.trim()
      || process.env.RESEND_REPLY_TO
      || 'contacto@forwarders.app'

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
                <div style="font-size:20px;font-weight:700">${safeCompanyName}</div>
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
          { name: 'tenant_id', value: pkg.tenant_id },
        ],
      }

    const result = await deliverEmail(supabaseAdmin, {
      table: 'client_email_deliveries', tenantId: pkg.tenant_id,
      identity: { package_id: pkg.id, event_type: EVENT_TYPE },
      values: { recipient_email: recipientEmail }, request: resendRequest,
      key: EVENT_TYPE + '/' + pkg.id, apiKey: resendApiKey,
    })
    if (result.status >= 500 || result.body.uncertain) {
      const reference = reportDiagnostic('miami_email_failed', {
        ...diagnostic, code: result.body.uncertain ? 'DELIVERY_UNCONFIRMED' : 'DELIVERY_FAILED',
      })
      return NextResponse.json({ ...result.body, reference, error: `${result.body.error} Referencia: ${reference}.` },
        { status: result.status, headers: { 'X-Request-ID': reference } })
    }
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    const reference = reportDiagnostic('miami_email_failed', {
      ...diagnostic, code: error instanceof EmailEnvironmentUnavailableError ? 'ENVIRONMENT_UNAVAILABLE' : 'UNEXPECTED',
    })
    if (error instanceof EmailEnvironmentUnavailableError) {
      return NextResponse.json({ ok: false, error: `${error.message} Referencia: ${reference}.`, reference }, { status: 503, headers: { 'X-Request-ID': reference } })
    }
    return NextResponse.json(
      { ok: false, error: `Error interno al enviar el aviso. Referencia: ${reference}.`, reference },
      { status: 500, headers: { 'X-Request-ID': reference } }
    )
  }
}
