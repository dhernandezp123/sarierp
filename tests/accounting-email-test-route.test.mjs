import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const secret='x'.repeat(48),requestId='11111111-1111-4111-8111-111111111111',clientId='22222222-2222-4222-8222-222222222222',providerId='33333333-3333-4333-8333-333333333333',recipient='test@example.invalid'
const helper=loadTs('src/lib/server/accounting-reminders.ts',{'server-only':{}})
async function run({method='POST',auth=`Bearer ${secret}`,verified='production',env='production',body={requestId,clientId,recipientEmail:recipient,reason:'Prueba controlada autorizada'},previous=null,casLost=false,providerRecipient=recipient,providerStatus=200}={}){
 const names=['CRON_SECRET','VERCEL_ENV','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','RESEND_FROM_EMAIL','OUTBOUND_EMAIL_ENABLED'],before=Object.fromEntries(names.map(n=>[n,process.env[n]])),deliveries=[],writes=[],reads=[]
 Object.assign(process.env,{CRON_SECRET:secret,VERCEL_ENV:env,NEXT_PUBLIC_SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'mock',RESEND_API_KEY:'mock',RESEND_FROM_EMAIL:'sender@example.invalid',OUTBOUND_EMAIL_ENABLED:'true'})
 const originalFetch=globalThis.fetch;let providerCalls=0
 globalThis.fetch=async()=>{providerCalls++;return new Response(JSON.stringify({to:[providerRecipient],last_event:'delivered',html:'<img src="https://fixture.forwarders.app/logo.png">SIN COBRO REAL'}),{status:providerStatus})}
 const db={from(table){const filters=[];let update=null;const q={select:()=>q,eq:(k,v)=>{filters.push([k,v]);return q},is:()=>q,update:values=>{update=values;writes.push({table,values});return q},single:async()=>{reads.push({table,filters});return {data:table==='clientes'?{id:clientId,nombre:'Cliente ficticio',email_1:recipient}: {internal_enabled:true},error:null}},maybeSingle:async()=>{reads.push({table,filters});return {data:update?(casLost?null:{id:'test'}):previous,error:null}}};return q}}
 try{
  const routes=loadTs('src/app/api/cron/accounting-alerts/test/route.ts',{'server-only':{},'@supabase/supabase-js':{createClient:()=>db},'@/src/lib/tenant-context':{readTenantHeaders:()=>({id:'tenant'})},'@/src/lib/server/email-environment':{readEmailEnvironment:async()=>verified},'@/src/lib/server/accounting-reminders':{...helper,loadAccountingEmailBranding:async()=>({trade_name:'Empresa ficticia',origin:'https://fixture.forwarders.app',logo_url:'/logo.png'})},'@/src/lib/server/email-delivery':{deliverEmail:async(_db,options)=>{deliveries.push(options);return {status:200,body:{ok:true,sent:true}}}}})
  const request=new Request(`https://fixture.forwarders.app/api/cron/accounting-alerts/test?requestId=${requestId}`,{method,headers:auth?{authorization:auth}:{},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})
  const response=await routes[method](request)
  return {response,body:await response.json(),deliveries,writes,reads,providerCalls}
 }finally{globalThis.fetch=originalFetch;for(const [n,v]of Object.entries(before))if(v===undefined)delete process.env[n];else process.env[n]=v}
}
test('prueba de correo exige secreto, Production verificado y datos válidos antes de entregar',async()=>{
 for(const options of [{auth:null},{env:'preview'},{verified:'demo'},{body:'null'},{body:{}},{body:'not json'}]){const r=await run(options);assert.ok([400,401,403].includes(r.response.status));assert.equal(r.deliveries.length,0);assert.equal(r.writes.length,0)}
})
test('único destinatario registrado, empresa explícita y outbox de prueba sin activar cobranza',async()=>{
 const r=await run();assert.equal(r.body.sent,true);assert.equal(r.deliveries.length,1)
 assert.equal(r.deliveries[0].table,'accounting_email_tests');assert.deepEqual(r.deliveries[0].request.to,[recipient]);assert.match(r.deliveries[0].request.html,/SIN COBRO REAL/);assert.match(r.deliveries[0].request.from,/Empresa ficticia/)
 assert.ok(r.reads.every(r=>r.filters.some(([k,v])=>k==='tenant_id'&&v==='tenant')));assert.equal(r.writes.length,0)
 const changed=await run({body:{requestId,clientId,recipientEmail:'other@example.invalid',reason:'Prueba de otro destinatario'}});assert.equal(changed.response.status,403);assert.equal(changed.deliveries.length,0)
})
test('no reintenta resultados inciertos ni fallos sin confirmación; CAS perdido impide transporte',async()=>{
 const base={id:'test',cliente_id:clientId,recipient_email:recipient,updated_at:'2026-11-05T12:00:00Z',resend_message_id:null}
 for(const status of ['processing','uncertain','failed']){const r=await run({previous:{...base,status}});assert.equal(r.response.status,409);assert.equal(r.deliveries.length,0)}
 const retryBody={requestId,clientId,recipientEmail:recipient,reason:'No aceptado, reintento autorizado',confirmNotAccepted:true}
 const denied=await run({previous:{...base,status:'failed'},body:retryBody,casLost:true});assert.equal(denied.response.status,409);assert.equal(denied.deliveries.length,0)
 const accepted=await run({previous:{...base,status:'failed'},body:retryBody});assert.equal(accepted.deliveries.length,1);assert.equal(accepted.writes[0].values.retry_authorized,true)
})
test('consulta entrega y branding sin reenviar; distingue aceptación de entrega y rechaza destinatario distinto',async()=>{
 const previous={id:'test',status:'sent',resend_message_id:providerId,recipient_email:recipient,request_body:'{"html":"<img src=\\\"https://fixture.forwarders.app/logo.png\\\">SIN COBRO REAL"}'}
 previous.request_body=JSON.stringify({html:'<img src="https://fixture.forwarders.app/logo.png">SIN COBRO REAL'})
 const delivered=await run({method:'GET',previous});assert.equal(delivered.body.lastEvent,'delivered');assert.equal(delivered.body.brandingConfirmed,true);assert.equal(delivered.deliveries.length,0)
 const readDenied=await run({method:'GET',previous,providerStatus:403});assert.equal(readDenied.body.accepted,true);assert.equal(readDenied.body.providerInspectionUnavailable,true)
 const mismatch=await run({method:'GET',previous,providerRecipient:'other@example.invalid'});assert.equal(mismatch.response.status,409);assert.equal(mismatch.deliveries.length,0)
})
