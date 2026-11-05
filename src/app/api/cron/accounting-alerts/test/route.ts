import {NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {validAccountingCron,loadAccountingEmailBranding,accountingReminderRequest} from '@/src/lib/server/accounting-reminders'
import {readEmailEnvironment} from '@/src/lib/server/email-environment'
import {deliverEmail} from '@/src/lib/server/email-delivery'
import {readTenantHeaders} from '@/src/lib/tenant-context'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const runtime='nodejs'
export const maxDuration=60
async function context(request:Request){
 if(!validAccountingCron(request.headers.get('authorization'),process.env.CRON_SECRET))return {error:NextResponse.json({error:'No autorizado'},{status:401})}
 if(process.env.VERCEL_ENV!=='production'||process.env.OUTBOUND_EMAIL_ENABLED!=='true')return {error:NextResponse.json({error:'Prueba bloqueada en este ambiente'},{status:403})}
 const tenant=readTenantHeaders(request.headers),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,apiKey=process.env.RESEND_API_KEY,sender=process.env.RESEND_FROM_EMAIL
 if(!tenant||!url||!key||!apiKey||!sender)return {error:NextResponse.json({error:'Configuración segura incompleta'},{status:503})}
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
 if(await readEmailEnvironment(admin)!=='production')return {error:NextResponse.json({error:'Prueba bloqueada en Demo'},{status:403})}
 return {admin,tenantId:tenant.id,apiKey,sender}
}
// Prueba manual de operador, autenticada por secreto; nunca llamada por el cron.
// No habilita contactos/canales y utiliza un outbox separado sin documentos fiscales.
export async function POST(request:Request){
 try{
  const c=await context(request);if(c.error)return c.error
  const raw=await request.text();if(raw.length>3000)return NextResponse.json({error:'Solicitud demasiado grande'},{status:413})
  let input:{requestId?:string;clientId?:string;recipientEmail?:string;reason?:string;confirmNotAccepted?:boolean}
  try{input=JSON.parse(raw)}catch{return NextResponse.json({error:'Solicitud inválida'},{status:400})}
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.recipientEmail!=='string'||typeof input.reason!=='string'||typeof input.requestId!=='string'||typeof input.clientId!=='string')return NextResponse.json({error:'Solicitud inválida'},{status:400})
  const recipient=input.recipientEmail?.trim().toLowerCase(),reason=input.reason?.trim()
  if(!uuid.test(input.requestId||'')||!uuid.test(input.clientId||'')||!recipient||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||!reason||reason.length<5||reason.length>1000)return NextResponse.json({error:'Cliente, correo registrado, motivo y solicitud requeridos'},{status:400})
  const [client,settings,previous]=await Promise.all([
   c.admin.from('clientes').select('id,nombre,email_1,email_2').eq('tenant_id',c.tenantId).eq('id',input.clientId!).is('deleted_at',null).single(),
   c.admin.from('accounting_alert_settings').select('internal_enabled').eq('tenant_id',c.tenantId).single(),
   c.admin.from('accounting_email_tests').select('id,cliente_id,recipient_email,status,resend_message_id,updated_at').eq('tenant_id',c.tenantId).eq('request_id',input.requestId!).maybeSingle()
  ])
  if(client.error||settings.error||previous.error||!settings.data?.internal_enabled||![client.data?.email_1,client.data?.email_2].some(e=>e?.trim().toLowerCase()===recipient))return NextResponse.json({error:'Cliente o destinatario no autorizado para la prueba'},{status:403})
  if(previous.data&&(previous.data.cliente_id!==input.clientId||previous.data.recipient_email!==recipient))return NextResponse.json({error:'La solicitud ya pertenece a otros datos'},{status:409})
  if(previous.data&&['processing','uncertain','skipped'].includes(previous.data.status))return NextResponse.json({error:'La prueba requiere conciliación antes de cualquier reintento'},{status:409})
  if(previous.data?.status==='failed'){
   if(input.confirmNotAccepted!==true||previous.data.resend_message_id)return NextResponse.json({error:'Confirma la no aceptación del proveedor antes de reintentar'},{status:409})
   const claimed=await c.admin.from('accounting_email_tests').update({retry_authorized:true,authorization_reason:reason,updated_at:new Date().toISOString()}).eq('id',previous.data.id).eq('tenant_id',c.tenantId).eq('status','failed').eq('updated_at',previous.data.updated_at).select('id').maybeSingle()
   if(claimed.error||!claimed.data)return NextResponse.json({error:'La auditoría cambió. Revisa su estado.'},{status:409})
  }
  const branding=await loadAccountingEmailBranding(c.admin,c.tenantId)
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tegucigalpa',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]))
  const mail=accountingReminderRequest({recipient_email:recipient,invoice_number:'PRUEBA-SIN-VALIDEZ',currency:'HNL',balance:1234.56,due_date:`${parts.year}-${parts.month}-${parts.day}`},c.sender,branding,{test:true,clientName:client.data!.nombre})
  const result=await deliverEmail(c.admin,{table:'accounting_email_tests',tenantId:c.tenantId,identity:{request_id:input.requestId!,cliente_id:input.clientId!,recipient_email:recipient},values:{recipient_email:recipient,authorization_reason:reason},request:{...mail,...(branding.email?.trim()?{reply_to:branding.email.trim()}:{})},key:`accounting-controlled-test/${input.requestId}`,apiKey:c.apiKey})
  return NextResponse.json(result.body,{status:result.status})
 }catch{return NextResponse.json({error:'No se pudo completar la prueba. Consulta la auditoría antes de reenviar.'},{status:503})}
}
export async function GET(request:Request){
 try{
  const c=await context(request);if(c.error)return c.error
  const requestId=new URL(request.url).searchParams.get('requestId');if(!uuid.test(requestId||''))return NextResponse.json({error:'Solicitud requerida'},{status:400})
  const record=await c.admin.from('accounting_email_tests').select('id,status,attempts,resend_message_id,request_body,recipient_email').eq('tenant_id',c.tenantId).eq('request_id',requestId!).maybeSingle()
  if(record.error||!record.data)return NextResponse.json({error:'Prueba no disponible'},{status:404})
  const row=record.data
  if(!row.resend_message_id||!uuid.test(row.resend_message_id))return NextResponse.json({status:row.status,attempts:row.attempts,accepted:false})
  const response=await fetch(`https://api.resend.com/emails/${row.resend_message_id}`,{headers:{Authorization:`Bearer ${c.apiKey}`},signal:AbortSignal.timeout(10000),cache:'no-store'})
  if(!response.ok)return NextResponse.json({status:row.status,accepted:row.status==='sent',providerInspectionUnavailable:true})
  const payload=await response.json(),original=JSON.parse(row.request_body||'{}'),logo=typeof original.html==='string'?original.html.match(/<img src="([^"]+)"/)?.[1]:null
  if(!Array.isArray(payload.to)||payload.to.length!==1||payload.to[0]?.toLowerCase()!==row.recipient_email.toLowerCase())return NextResponse.json({error:'La evidencia de destinatario requiere revisión'},{status:409})
  return NextResponse.json({status:row.status,accepted:true,lastEvent:typeof payload.last_event==='string'&&/^[a-z_]{1,40}$/.test(payload.last_event)?payload.last_event:'unknown',brandingConfirmed:Boolean(logo&&typeof payload.html==='string'&&payload.html.includes(logo)&&payload.html.includes('SIN COBRO REAL')),recipient:row.recipient_email})
 }catch{return NextResponse.json({error:'No se pudo verificar la entrega; no se reenvió el correo.'},{status:503})}
}
