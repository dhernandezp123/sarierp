import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { readTenantHeaders } from '@/src/lib/tenant-context'
import { RECOVERY_REQUEST_MESSAGE } from '@/src/lib/password-recovery'
import { recoveryAdminClient, recoveryEnvironmentAllowed, sendRecoveryEmail } from '@/src/lib/server/password-recovery'

const responseHeaders = { 'Cache-Control': 'no-store' }

export async function POST(request: Request) {
  try {
    const tenant = readTenantHeaders(await headers())
    if (!tenant) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404, headers: responseHeaders })
    const payload: unknown = await request.json().catch(() => null)
    const email = payload && typeof payload === 'object' && 'email' in payload && typeof payload.email === 'string'
      ? payload.email.trim().toLowerCase() : ''
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Ingresa un correo electrónico válido' }, { status: 400, headers: responseHeaders })
    }
    const admin = recoveryAdminClient()
    if (!await recoveryEnvironmentAllowed(admin)) {
      return NextResponse.json({ error: 'La recuperación por correo no está disponible en este ambiente' }, { status: 403, headers: responseHeaders })
    }
    const { data: profile, error } = await admin.from('profiles').select('id')
      .eq('tenant_id', tenant.id).eq('email', email).eq('is_platform_admin', false).maybeSingle()
    if (error) throw new Error('Recovery unavailable')
    if (profile) {
      const { data, error: userError } = await admin.auth.admin.getUserById(profile.id)
      if (userError) throw new Error('Recovery unavailable')
      if (data.user?.email?.toLowerCase() === email) {
        // Always return the same public response, including provider rate limiting.
        await sendRecoveryEmail(email, tenant.hostname).catch(() => undefined)
      }
    }
    return NextResponse.json({ message: RECOVERY_REQUEST_MESSAGE }, { status: 202, headers: responseHeaders })
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la solicitud. Intenta nuevamente más tarde.' }, { status: 503, headers: responseHeaders })
  }
}
