import {NextResponse} from 'next/server'
import {createClient} from '@supabase/supabase-js'
import {validAccountingCron,accountingReminderRequest,loadAccountingEmailBranding} from '@/src/lib/server/accounting-reminders'
import {readEmailEnvironment} from '@/src/lib/server/email-environment'
import {deliverEmail} from '@/src/lib/server/email-delivery'
export const runtime='nodejs'
export const maxDuration=300
export async function GET(request:Request){
 if(!validAccountingCron(request.headers.get('authorization'),process.env.CRON_SECRET))return NextResponse.json({error:'No autorizado'},{status:401})
 if(process.env.VERCEL_ENV!=='production')return NextResponse.json({error:'Scheduler disponible solo en Production'},{status:403})
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!url||!key)return NextResponse.json({error:'Configuración del scheduler incompleta'},{status:503})
 try{
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  if(await readEmailEnvironment(admin)!=='production')return NextResponse.json({error:'Avisos bloqueados en este ambiente'},{status:403})
  const result=await admin.rpc('process_accounting_alerts')
  if(result.error)throw new Error('SCHEDULER_FAILED')
  if(result.data?.busy)return NextResponse.json({ok:true,busy:true})
  const emailEnabled=process.env.ACCOUNTING_ALERTS_EMAIL_ENABLED==='true'&&process.env.OUTBOUND_EMAIL_ENABLED==='true'
  if(!emailEnabled)return NextResponse.json({ok:true,internal:result.data,email:'disabled'})
  const apiKey=process.env.RESEND_API_KEY,sender=process.env.RESEND_FROM_EMAIL
  if(!apiKey||!sender)return NextResponse.json({error:'Transporte de correo incompleto; avisos internos procesados'},{status:503})
  // Solo primer intento. Un resultado incierto requiere conciliacion, nunca reenvio diario.
  const jobs=await admin.from('accounting_customer_reminders').select('id').eq('status','pending').eq('attempts',0).order('created_at').order('id').limit(20)
  if(jobs.error)throw new Error('OUTBOX_READ_FAILED')
  let sent=0,held=0
  for(let i=0;i<(jobs.data||[]).length;i+=4){
   await Promise.all((jobs.data||[]).slice(i,i+4).map(async job=>{
    const check=await admin.rpc('get_accounting_email_dispatch',{p_id:job.id})
    if(check.error||!check.data){held++;return}
    const row=check.data
    let branding
    try{branding=await loadAccountingEmailBranding(admin,row.tenant_id)}catch{held++;return}
    const delivery=await deliverEmail(admin,{table:'accounting_customer_reminders',tenantId:row.tenant_id,identity:{invoice_id:row.invoice_id,stage:row.stage,recipient_email:row.recipient_email},values:{recipient_email:row.recipient_email,cliente_id:row.cliente_id||null},request:{...accountingReminderRequest(row,sender,branding),...(branding.email?.trim()?{reply_to:branding.email.trim()}:{})},key:`accounting/${job.id}`,apiKey})
    if(delivery.body.sent)sent++;else if(!delivery.body.alreadySent)held++
   }))
  }
  return NextResponse.json({ok:true,internal:result.data,email:{sent,held}})
 }catch{return NextResponse.json({error:'No se pudo completar el procesamiento de alertas. Revisa la auditoría antes de reintentar correos.'},{status:503})}
}
