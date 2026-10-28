import { createClient } from '@/src/lib/supabase/server'
import { readTenantHeaders, profileMatchesTenant } from '@/src/lib/tenant-context'
import { MANUAL_INVOICE_ROLES } from '@/src/lib/manual-invoice'

export class ManualInvoiceError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export async function authorizeManualInvoices(request: Request) {
  const tenant = readTenantHeaders(request.headers)
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new ManualInvoiceError('Inicia sesión nuevamente.', 401)
  const { data: profile } = await supabase.from('profiles').select('rol,status,is_active,tenant_id,is_platform_admin').eq('id', user.id).maybeSingle()
  if (!profile || profile.status !== 'Aprobado' || profile.is_active !== true || profile.is_platform_admin === true
    || !MANUAL_INVOICE_ROLES.includes(profile.rol) || !profileMatchesTenant(profile.tenant_id, tenant)
    || tenant?.hostname !== 'sari.forwarders.app') throw new ManualInvoiceError('No tienes acceso al generador de SARI USA.', 403)
  return { supabase, user, tenant: tenant! }
}

export async function readLimitedInvoiceBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new ManualInvoiceError('El archivo o formulario supera el tamaño permitido.', 413)
  if (!request.body) throw new ManualInvoiceError('Falta el documento.', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new ManualInvoiceError('El archivo o formulario supera el tamaño permitido.', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks)
}

export function manualInvoiceErrorResponse(error: unknown) {
  const known = error instanceof ManualInvoiceError
  return Response.json({ error: known ? error.message : 'No se pudo completar la solicitud. Intenta nuevamente.' },
    { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } })
}
