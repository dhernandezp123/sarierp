import { renderToBuffer } from '@react-pdf/renderer'
import { requireHrSession } from '@/src/lib/server/hr-access'
import { HrCertificatePdf } from '@/src/components/pdf/hr-certificate-pdf'
import { isHrUuid, type HrCertificate } from '@/src/lib/hr-documents'

export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireHrSession()
  if (!session.ok) return session.response
  const { id } = await params
  if (!isHrUuid(id)) return Response.json({ error: 'Constancia no disponible.' }, { status: 404 })
  const record = await session.client.from('hr_certificates').select('*').eq('id', id).maybeSingle<HrCertificate>()
  if (record.error) return Response.json({ error: 'No se pudo consultar la constancia.' }, { status: 503 })
  if (!record.data) return Response.json({ error: 'Constancia no disponible.' }, { status: 404 })
  try {
    const pdf = await renderToBuffer(HrCertificatePdf({ certificate: record.data }))
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${record.data.certificate_number}.pdf"`, 'Cache-Control': 'private, no-store' } })
  } catch { return Response.json({ error: 'No se pudo generar el PDF.' }, { status: 503 }) }
}
