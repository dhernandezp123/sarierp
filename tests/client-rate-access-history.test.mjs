import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import {mountPage} from './page-harness.mjs'

const {canManageClientRates}=loadTs('src/lib/permissions.ts')
const {getClientRateChanges}=loadTs('src/lib/client-rate-history.ts')

test('solo Contabilidad con permiso individual se suma a los roles autorizados de tarifas',()=>{
 for(const role of ['Admin','Pricing','Ventas']) assert.equal(canManageClientRates(role),true)
 assert.equal(canManageClientRates('Contabilidad'),false)
 assert.equal(canManageClientRates('Contabilidad',true),true)
 for(const role of ['Operaciones','Finanzas','Cliente',null,'']) assert.equal(canManageClientRates(role,true),false)
})

test('permiso individual descarta respuestas anteriores al cambiar de usuario',async()=>{
 let profile={id:'first',tenant_id:'tenant',rol:'Contabilidad',status:'Aprobado',is_active:true}
 const pending=[]
 const app=mountPage('src/hooks/useClientRateAccess.ts',{
  '@/src/hooks/useUser':{useUser:()=>({profile})},
  '@/src/lib/supabase/client':{supabase:{rpc:()=>new Promise(resolve=>pending.push(resolve))}},
 },{exported:'useClientRateAccess',props:'client'})
 try{
  assert.equal(app.render().hasIndividualAccess,false)
  profile={...profile,id:'second'};assert.equal(app.render().hasIndividualAccess,false)
  pending[0]({data:true,error:null});await app.tick();assert.equal(app.render().hasIndividualAccess,false)
  pending[1]({data:true,error:null});await app.tick();assert.equal(app.render().hasIndividualAccess,true)
  profile={...profile,is_active:false};assert.equal(app.render().hasIndividualAccess,false)
 }finally{app.cleanup()}
})

test('historial distingue cero de ausencia y presenta cambios fiscales y vigencias legibles',()=>{
 const changes=getClientRateChanges({amount:15,currency:'USD',is_active:true,valid_to:'2026-11-02'},
   {amount:0,currency:'USD',is_active:false,valid_to:'2026-11-30'})
 assert.deepEqual(changes.map(c=>c.field),['amount','is_active','valid_to'])
 assert.equal(changes[0].after,'USD 0.00')
 assert.equal(changes[1].after,'Inactiva')
 assert.equal(changes[2].after,'30/11/2026')
 assert.equal(getClientRateChanges(null,{amount:0,currency:'USD'})[0].before,'—')
 assert.deepEqual(getClientRateChanges({amount:0},{amount:0}),[])
})

const event={event_id:'e1',changed_at:'2026-11-02T18:00:00Z',actor_id:'master',actor_name:'Zonia Prueba',rate_code:'freight',destination:'SPS',
 before_values:{rate_label:'Flete',amount:15,currency:'USD'},after_values:{rate_label:'Flete',amount:0,currency:'USD'},total_count:26}

test('la ficha real habilita guardar solo para Contabilidad con permiso individual',async()=>{
 for(const master of [false,true]) {
  const calls=[]
  const client={from(table){let single=false;const q=new Proxy({},{get(_t,key){
   if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='clientes'?(single?{id:'client',nombre:'Cliente ficticio'}:[{id:'client',nombre:'Cliente ficticio'}]):[],error:null}).then(resolve,reject)
   if(key==='single')return()=>{single=true;return q}
   return()=>q}});return q},rpc:async(name,args)=>{calls.push({name,args});return{data:1,error:null}}}
  const app=mountPage('src/app/(protected)/clientes/[id]/page.tsx',{
   '../../../../hooks/useUser':{useUser:()=>({profile:{id:'master',tenant_id:'tenant',rol:'Contabilidad',status:'Aprobado',is_active:true}})},
   '../../../../lib/supabase/client':{supabase:client},
   '@/src/lib/supabase/client':{supabase:client},
   '@/src/lib/activity-logger':{createActivityLog:async()=>({ok:true})},
   '@/src/hooks/useClientRateAccess':{useClientRateAccess:()=>({hasIndividualAccess:master})},
   '@/src/components/clientes/ClientRateHistory':{ClientRateHistory:'ClientRateHistory'},
   'next/navigation':{useParams:()=>({id:'client'}),useRouter:()=>({push(){}}),usePathname:()=>'/clientes/client'},
  })
  try{
   await app.ready();app.button('Tarifas').props.onClick();app.render()
   assert.equal(app.find(n=>n.type==='fieldset').props.disabled,!master)
   assert.equal(!!app.button('Guardar tarifas'),master)
   if(master){await app.button('Guardar tarifas').props.onClick();assert.equal(calls[0].name,'replace_client_rates')}
  }finally{app.cleanup()}
 }
})

test('historial real pagina en servidor, conserva autor y admite recuperar errores',async()=>{
 const calls=[];let fail=true
 const app=mountPage('src/components/clientes/ClientRateHistory.tsx',{
  '@/src/hooks/useUser':{useUser:()=>({profile:{id:'master',tenant_id:'tenant',rol:'Contabilidad',status:'Aprobado',is_active:true}})},
  '@/src/lib/supabase/client':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return{data:fail?null:[event],error:fail?{message:'offline'}:null}}}},
 },{exported:'ClientRateHistory',props:{clienteId:'client',refreshKey:0}})
 try{
  await app.ready();assert.match(app.text(),/No se pudo cargar/)
  fail=false;app.button('Reintentar').props.onClick();await app.ready()
  assert.match(app.text(),/Zonia Prueba/);assert.match(app.text(),/USD 0\.00/)
  const pagination=app.find(n=>n.type==='Pagination');assert.equal(pagination.props.total,26)
  pagination.props.onPageChange(2);await app.ready()
  assert.deepEqual(calls.at(-1),{name:'get_client_rate_history',args:{p_cliente_id:'client',p_limit:25,p_offset:25}})
 }finally{app.cleanup()}
})

test('cambiar cliente oculta el historial anterior y descarta su respuesta tardia',async()=>{
 const props={clienteId:'first',refreshKey:0};const pending=[]
 const app=mountPage('src/components/clientes/ClientRateHistory.tsx',{
  '@/src/hooks/useUser':{useUser:()=>({profile:{id:'master',tenant_id:'tenant',rol:'Contabilidad',status:'Aprobado',is_active:true}})},
  '@/src/lib/supabase/client':{supabase:{rpc:()=>new Promise(resolve=>pending.push(resolve))}},
 },{exported:'ClientRateHistory',props})
 try{
  app.render();props.clienteId='second';app.render()
  pending[0]({data:[event],error:null});await app.tick();app.render()
  assert.doesNotMatch(app.text(),/Zonia Prueba/)
  pending[1]({data:[{...event,actor_name:'Otro autor'}],error:null});await app.tick();app.render()
  assert.match(app.text(),/Otro autor/);assert.doesNotMatch(app.text(),/Zonia Prueba/)
 }finally{app.cleanup()}
})
