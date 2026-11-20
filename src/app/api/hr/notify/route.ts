import { requireHrSession } from '@/src/lib/server/hr-access'
import { dispatchHrEmail } from '@/src/lib/server/hr-email'
import { hrSameOrigin, isHrUuid } from '@/src/lib/hr-documents'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function POST(request: Request) {
  const session = await requireHrSession()
  if (!session.ok) return session.response
  if (!hrSameOrigin(request.headers.get('origin'), request.headers.get('host'))) return Response.json({ error: 'Origen no autorizado' }, { status: 403 })
  let id: unknown
  try { id = (await request.json()).request_id } catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  if (typeof id !== 'string' || !isHrUuid(id)) return Response.json({ error: 'Solicitud inválida' }, { status: 400 })
  const resource = await session.client.from('hr_leave_requests').select('id').eq('id', id).eq('tenant_id', session.profile.tenant_id).maybeSingle()
  if (resource.error) return Response.json({ error: 'No se pudo verificar la solicitud' }, { status: 503 })
  if (!resource.data) return Response.json({ error: 'Solicitud no disponible' }, { status: 404 })
  try { return Response.json(await dispatchHrEmail({ tenantId: session.profile.tenant_id, requestId: id }), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'El correo permanece pendiente. Consulta Avisos de RRHH.' }, { status: 503 }) }
}
