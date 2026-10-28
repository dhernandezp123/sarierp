import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
function fixture({user=true,role='Contabilidad',active=true,tenant=true}={}){
 const supabase={auth:{getUser:async()=>({data:{user:user?{id:'u'}:null},error:null})},from(){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{rol:role,status:'Aprobado',is_active:active,tenant_id:'tenant',is_platform_admin:false}})};return q}}
 return loadTs('src/app/api/accounting/statement-import/route.ts',{'@/src/lib/supabase/server':{createClient:async()=>supabase},'@/src/lib/tenant-context':{readTenantHeaders:()=>({id:'tenant'}),profileMatchesTenant:()=>tenant}}).POST
}
test('importador rechaza anónimos, roles comerciales, perfiles inactivos y otro tenant',async()=>{
 for(const [options,status]of [[{user:false},401],[{role:'Ventas'},403],[{active:false},403],[{tenant:false},403]]){
  const response=await fixture(options)(new Request('https://tenant.test/api/accounting/statement-import',{method:'POST',body:'cualquier archivo'}));assert.equal(response.status,status)
 }
})
test('importador financiero solo devuelve vista previa privada y limita el archivo antes de procesarlo',async()=>{
 const handler=fixture(),base='https://tenant.test/api/accounting/statement-import'
 const tooLarge=await handler(new Request(base,{method:'POST',headers:{'content-length':String(7*1024*1024),'x-bank-file-type':'csv'},body:'x'}));assert.equal(tooLarge.status,413)
 const response=await handler(new Request(base,{method:'POST',headers:{'x-bank-file-type':'csv'},body:'Fecha,Ref,Monto\n2026-10-28,FICTICIA,10'}));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store')
 const result=await response.json();assert.equal(result.sheets[0].rows.length,2);assert.match(result.hash,/^[0-9a-f]{64}$/)
 const invalid=await handler(new Request(base,{method:'POST',headers:{'x-bank-file-type':'xlsx'},body:'No es un ZIP'}));assert.equal(invalid.status,400)
})
