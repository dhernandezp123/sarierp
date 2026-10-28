import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/src/lib/supabase/server'
import { profileMatchesTenant, readTenantHeaders } from '@/src/lib/tenant-context'
import { recoveryAdminClient, recoveryEnvironmentAllowed, sendRecoveryEmail } from '@/src/lib/server/password-recovery'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: responseHeaders })
    const { data: actor, error: profileError } = await supabase.from('profiles')
      .select('rol, status, is_active, tenant_id, is_platform_admin').eq('id', user.id).single()
    const tenant = readTenantHeaders(await headers())
    if (profileError || actor?.rol !== 'Admin' || actor.status !== 'Aprobado' || actor.is_active !== true
      || actor.is_platform_admin === true || !profileMatchesTenant(actor.tenant_id, tenant)) {
      return NextResponse.json({ error: 'Solo Admin de esta empresa puede enviar la recuperación' }, { status: 403, headers: responseHeaders })
    }
    const payload: unknown = await request.json().catch(() => null)
    const userId = payload && typeof payload === 'object' && 'userId' in payload ? payload.userId : null
    if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'Usuario inválido' }, { status: 400, headers: responseHeaders })
    }
    const admin = recoveryAdminClient()
    const { data: target, error: targetError } = await admin.from('profiles').select('id, email')
      .eq('id', userId).eq('tenant_id', actor.tenant_id).eq('is_platform_admin', false).maybeSingle()
    if (targetError) throw new Error('Recovery unavailable')
    if (!target) return NextResponse.json({ error: 'Usuario no encontrado en esta empresa' }, { status: 404, headers: responseHeaders })
    if (!await recoveryEnvironmentAllowed(admin)) {
      return NextResponse.json({ error: 'La recuperación por correo no está disponible en este ambiente' }, { status: 403, headers: responseHeaders })
    }
    const { data, error: targetAuthError } = await admin.auth.admin.getUserById(target.id)
    if (targetAuthError || !data.user?.email || data.user.email.toLowerCase() !== target.email?.toLowerCase()) {
      return NextResponse.json({ error: 'El correo de la cuenta necesita revisión antes de enviar la recuperación' }, { status: 409, headers: responseHeaders })
    }
    const { error } = await sendRecoveryEmail(data.user.email, tenant!.hostname)
    if (error) return NextResponse.json({ error: 'No se pudo enviar el enlace. Espera un minuto antes de reintentar.' }, { status: error.status === 429 ? 429 : 502, headers: responseHeaders })
    let auditWarning = false
    try {
      const { error: auditError } = await admin.from('activity_logs').insert({
        tenant_id: actor.tenant_id, user_id: user.id, module: 'Admin', action: 'request_password_recovery',
        entity_type: 'profiles', entity_id: target.id,
        description: 'Solicitud administrativa de recuperación de contraseña', metadata: {},
      })
      auditWarning = Boolean(auditError)
    } catch { auditWarning = true }
    return NextResponse.json({ message: 'Solicitud de recuperación enviada al correo de la cuenta', auditWarning }, { headers: responseHeaders })
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la recuperación. Intenta nuevamente más tarde.' }, { status: 503, headers: responseHeaders })
  }
}
