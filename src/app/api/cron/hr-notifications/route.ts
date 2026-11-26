import { validAccountingCron } from '@/src/lib/server/accounting-reminders'
import { dispatchHrEmail } from '@/src/lib/server/hr-email'
export const runtime = 'nodejs'
export const maxDuration = 300
export async function GET(request: Request) {
  if (!validAccountingCron(request.headers.get('authorization'), process.env.CRON_SECRET)) return Response.json({ error: 'No autorizado' }, { status: 401 })
  if (process.env.VERCEL_ENV !== 'production') return Response.json({ error: 'Scheduler disponible solo en Production' }, { status: 403 })
  try { return Response.json(await dispatchHrEmail(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'No se pudo procesar la cola de RRHH' }, { status: 503 }) }
}
