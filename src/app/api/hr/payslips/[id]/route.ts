import { renderToBuffer } from '@react-pdf/renderer'
import { requireHrSession } from '@/src/lib/server/hr-access'
import { isHrUuid } from '@/src/lib/hr-documents'
import { HrPayslipPdf } from '@/src/components/pdf/hr-payslip-pdf'
import type { HrPayslip } from '@/src/lib/hr-payroll'
export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const session = await requireHrSession()
 if (!session.ok) return session.response
 const { id } = await params
 if (!isHrUuid(id)) return new Response('Comprobante no disponible',{status:404})
 const r = await session.client.rpc('hr_payslips',{p_id:id})
 if (r.error) return new Response('No se pudo consultar el comprobante',{status:503})
 const slip = r.data?.[0] as HrPayslip | undefined
 if (!slip) return new Response('Comprobante no disponible',{status:404})
 const bytes = await renderToBuffer(HrPayslipPdf({slip}))
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="comprobante-${id}.pdf"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
}
