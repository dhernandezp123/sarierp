import { renderToBuffer } from '@react-pdf/renderer'
import { requireHrSession } from '@/src/lib/server/hr-access'
import { isHrUuid } from '@/src/lib/hr-documents'
import { HrBenefitPdf } from '@/src/components/pdf/hr-benefit-pdf'
import type { BenefitCalculation } from '@/src/lib/hr-benefits'
export const runtime='nodejs'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await requireHrSession()
 if(!session.ok)return session.response
 const {id}=await params
 if(!isHrUuid(id))return new Response('Cálculo no disponible',{status:404})
 const r=await session.client.from('hr_benefit_calculations').select('id,created_at,snapshot').eq('id',id).maybeSingle<Pick<BenefitCalculation,'id'|'created_at'|'snapshot'>>()
 if(r.error)return new Response('No se pudo consultar el cálculo',{status:503})
 if(!r.data)return new Response('Cálculo no disponible',{status:404})
 const bytes=await renderToBuffer(HrBenefitPdf({id:r.data.id,createdAt:r.data.created_at,snapshot:r.data.snapshot}))
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="calculo-${id}.pdf"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}})
}
