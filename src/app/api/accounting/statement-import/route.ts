import { createHash } from 'node:crypto'
import { createClient } from '@/src/lib/supabase/server'
import { profileMatchesTenant, readTenantHeaders } from '@/src/lib/tenant-context'
import { readBankTable } from '@/src/lib/server/bank-import'
export const runtime='nodejs'
const headers={'Cache-Control':'no-store'}
export async function POST(request:Request){
 const supabase=await createClient(),tenant=readTenantHeaders(request.headers)
 const {data:{user},error}=await supabase.auth.getUser()
 if(error||!user)return Response.json({error:'Inicia sesión nuevamente.'},{status:401,headers})
 const {data:profile}=await supabase.from('profiles').select('rol,status,is_active,tenant_id,is_platform_admin').eq('id',user.id).maybeSingle()
 if(!profile||profile.status!=='Aprobado'||!profile.is_active||profile.is_platform_admin||!['Admin','Contabilidad','Finanzas'].includes(profile.rol)||!profileMatchesTenant(profile.tenant_id,tenant))return Response.json({error:'Sin acceso financiero.'},{status:403,headers})
 try{
  const limit=6*1024*1024;if(Number(request.headers.get('content-length'))>limit)return Response.json({error:'El extracto supera 6 MB.'},{status:413,headers})
  if(!request.body)return Response.json({error:'Falta el extracto.'},{status:400,headers})
  const chunks:Uint8Array[]=[],reader=request.body.getReader();let size=0
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();return Response.json({error:'El extracto supera 6 MB.'},{status:413,headers})}chunks.push(value)}}finally{reader.releaseLock()}
  const data=Buffer.concat(chunks),extension=request.headers.get('x-bank-file-type')||''
  return Response.json({sheets:readBankTable(data,extension),hash:createHash('sha256').update(data).digest('hex')},{headers})
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo leer el extracto.'},{status:400,headers})}
}
