import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {validAccountingCron,accountingReminderRequest}=loadTs('src/lib/server/accounting-reminders.ts',{'server-only':{}})
const secret='x'.repeat(48),row={id:'job',tenant_id:'tenant',invoice_id:'invoice',stage:'due',cliente_id:'client',recipient_email:'collect@example.invalid',invoice_number:'TEST-001',due_date:'2026-11-05',currency:'HNL',balance:100}
test('cron exige secreto largo exacto y el mensaje no incluye enlaces arbitrarios ni datos contables internos',()=>{
 assert.equal(validAccountingCron(`Bearer ${secret}`,secret),true)
 for(const header of [null,secret,`Bearer ${secret}x`,'Bearer incorrect'])assert.equal(validAccountingCron(header,secret),false)
 assert.equal(validAccountingCron('Bearer short','short'),false)
 const request=accountingReminderRequest(row,'sender@example.invalid')
 assert.match(request.text,/05\/11\/2026/);assert.match(request.text,/HNL 100.00/)
 assert.deepEqual(request.to,['collect@example.invalid'])
 assert.throws(()=>accountingReminderRequest({...row,balance:0},'sender'))
 assert.throws(()=>accountingReminderRequest({...row,recipient_email:'a@x\nBCC:a@b'},'sender'))
})
async function run({auth=`Bearer ${secret}`,environment='production',verified='production',enabled=false,jobs=[{id:'job'}],dispatch=row}={}){
 const names=['CRON_SECRET','VERCEL_ENV','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ACCOUNTING_ALERTS_EMAIL_ENABLED','OUTBOUND_EMAIL_ENABLED','RESEND_API_KEY','RESEND_FROM_EMAIL'],before=Object.fromEntries(names.map(n=>[n,process.env[n]])),calls=[],deliveries=[]
 Object.assign(process.env,{CRON_SECRET:secret,VERCEL_ENV:environment,NEXT_PUBLIC_SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake',ACCOUNTING_ALERTS_EMAIL_ENABLED:String(enabled),OUTBOUND_EMAIL_ENABLED:'true',RESEND_API_KEY:'fake',RESEND_FROM_EMAIL:'sender@example.invalid'})
 try{
  const db={async rpc(name){calls.push(name);return {data:name==='get_accounting_email_dispatch'?dispatch:{created:2},error:null}},from(){const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:jobs,error:null})};return q}}
  const {GET}=loadTs('src/app/api/cron/accounting-alerts/route.ts',{'server-only':{},'@/src/lib/company-settings':{loadTenantEmailBranding:async()=>({data:{trade_name:'Empresa ficticia'},error:null})},'@supabase/supabase-js':{createClient:()=>{calls.push('client');return db}},'@/src/lib/server/email-environment':{readEmailEnvironment:async()=>verified},'@/src/lib/server/email-delivery':{deliverEmail:async(_db,options)=>{deliveries.push(options);return {body:{sent:true}}}}})
  const response=await GET(new Request('https://scheduler.example.invalid/api/cron/accounting-alerts',{headers:auth?{authorization:auth}:{}}))
  return {response,body:await response.json(),calls,deliveries}
 }finally{for(const [name,value] of Object.entries(before))if(value===undefined)delete process.env[name];else process.env[name]=value}
}
test('sin secreto o fuera de Production el scheduler no accede a datos ni transporte',async()=>{
 for(const options of [{auth:null},{auth:'Bearer bad'},{environment:'preview'}]){const r=await run(options);assert.ok([401,403].includes(r.response.status));assert.equal(r.calls.length,0);assert.equal(r.deliveries.length,0)}
 const demo=await run({verified:'demo'});assert.equal(demo.response.status,403);assert.ok(!demo.calls.includes('process_accounting_alerts'))
})
test('avisos internos funcionan manteniendo correos desactivados',async()=>{
 const r=await run();assert.equal(r.body.ok,true);assert.equal(r.body.email,'disabled');assert.deepEqual(r.calls,['client','process_accounting_alerts']);assert.equal(r.deliveries.length,0)
})
test('se revalida cada destinatario y saldo justo antes del transporte idempotente',async()=>{
 const r=await run({enabled:true});assert.equal(r.deliveries.length,1);assert.ok(r.calls.includes('get_accounting_email_dispatch'));assert.equal(r.deliveries[0].table,'accounting_customer_reminders');assert.equal(r.deliveries[0].identity.invoice_id,'invoice')
 const obsolete=await run({enabled:true,dispatch:null});assert.equal(obsolete.deliveries.length,0);assert.equal(obsolete.body.email.held,1)
})
