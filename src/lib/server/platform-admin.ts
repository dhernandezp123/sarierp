import 'server-only'
import { headers } from 'next/headers'
import { createClient } from '@/src/lib/supabase/server'
import { canManagePlatform, PlatformInputError } from '@/src/lib/platform-admin'
import { resolveTenantHost } from '@/src/lib/tenant-host'
import { readTenantHeaders } from '@/src/lib/tenant-context'

export class PlatformAccessError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function authorizePlatformAdmin(request?: Request) {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  if (resolveTenantHost(host).kind !== 'platform' || readTenantHeaders(requestHeaders)) {
    throw new PlatformAccessError('Ruta no disponible en este dominio.', 404)
  }
  if (request && request.method !== 'GET') {
    let origin: URL
    try { origin = new URL(request.headers.get('origin') || '') }
    catch { throw new PlatformAccessError('Origen de solicitud inválido.', 403) }
    if (origin.host !== host || (origin.protocol !== 'https:' && process.env.NODE_ENV === 'production')) {
      throw new PlatformAccessError('Origen de solicitud inválido.', 403)
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PlatformAccessError('Formato de solicitud inválido.', 415)
  }
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new PlatformAccessError('Inicia sesión para continuar.', 401)
  const { data: profile, error } = await supabase.from('profiles')
    .select('rol,status,is_active,is_platform_admin,tenant_id').eq('id', user.id).maybeSingle()
  if (error || !canManagePlatform(profile)) throw new PlatformAccessError('Acceso exclusivo para administradores de plataforma.', 403)
  return supabase
}

export function platformApiError(error: unknown) {
  const headers = { 'Cache-Control': 'no-store' }
  if (error instanceof PlatformAccessError) return Response.json({ error: error.message }, { status: error.status, headers })
  if (error instanceof PlatformInputError || error instanceof SyntaxError) {
    return Response.json({ error: error instanceof SyntaxError ? 'Solicitud inválida.' : error.message }, { status: 400, headers })
  }
  const code = (error as { code?: string } | null)?.code
  const messages: Record<string, [number, string]> = {
    '42501': [403, 'No tienes autorización para realizar esta acción.'],
    '23505': [409, 'La empresa o el subdominio ya están registrados.'],
    '40001': [409, 'El registro cambió. Actualiza la lista y vuelve a intentarlo.'],
    'P0002': [404, 'El registro ya no está disponible.'],
    'PGRST202': [503, 'La administración de plataforma aún no está habilitada en este entorno.'],
    '42883': [503, 'La administración de plataforma aún no está habilitada en este entorno.'],
    '22023': [400, (error as { message?: string }).message || 'Revisa los datos de la solicitud.'],
  }
  const [status, message] = messages[code || ''] || [500, 'No se pudo completar la operación. Intenta nuevamente.']
  return Response.json({ error: message }, { status, headers })
}
