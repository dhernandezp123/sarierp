import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { readEmailEnvironment } from './email-environment'
import { deliverEmail } from './email-delivery'
import { hrEmailRequest } from '@/src/lib/hr-email'

export async function dispatchHrEmail(scope?: { tenantId: string; requestId: string }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Servicio de correo no configurado')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  if (await readEmailEnvironment(admin) !== 'production' || process.env.OUTBOUND_EMAIL_ENABLED !== 'true') return { blocked: true, sent: 0, held: 0 }
  const apiKey = process.env.RESEND_API_KEY, sender = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !sender) throw new Error('Transporte de correo no configurado')
  // Solo primeros intentos: resultados inciertos requieren conciliación del proveedor.
  let query = admin.from('hr_email_outbox').select('id').eq('status', 'pending').eq('attempts', 0).order('created_at').order('id').limit(20)
  if (scope) query = query.eq('tenant_id', scope.tenantId).eq('request_id', scope.requestId)
  const jobs = await query
  if (jobs.error) throw new Error('No se pudo consultar la cola')
  let sent = 0, held = 0
  const rows = jobs.data || []
  for (let index = 0; index < rows.length; index += 4) {
   await Promise.all(rows.slice(index, index + 4).map(async job => {
    const result = await admin.rpc('get_hr_email_dispatch', { p_id: job.id })
    if (result.error || !result.data) { held++; return }
    const row = result.data as { tenant_id: string; recipient_email: string; origin: string }
    const delivery = await deliverEmail(admin, { table: 'hr_email_outbox', tenantId: row.tenant_id, identity: { id: job.id }, values: { recipient_email: row.recipient_email }, request: hrEmailRequest(row.recipient_email, sender, row.origin), key: `hr/${job.id}`, apiKey })
    if (delivery.body.sent) sent++; else if (!delivery.body.alreadySent) held++
   }))
  }
  return { blocked: false, sent, held }
}
