import test from 'node:test'
import assert from 'node:assert/strict'
import {mountPage} from './page-harness.mjs'
import loadTs from './load-ts.mjs'
const {getClientRateBatchSummary}=loadTs('src/lib/client-rate-history.ts')
const catalog=Array.from({length:116},(_,n)=>({code:`rate_${n}`,label:`Tarifa ${n}`,category:'Flete',unit:'Unidad',isDestinationRate:n<2}))
function fixture(initial=[]){
 let rates=initial.map(r=>({...r})),fail=false;const calls=[],messages=[]
 const client={from(table){let single=false;const q=new Proxy({},{get(_t,key){
  if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='clientes'?(single?{id:'client',nombre:'Cliente ficticio'}:[]):table==='client_rates'?rates:[],error:null}).then(resolve,reject)
  if(key==='single')return()=>{single=true;return q};return()=>q}});return q},rpc:async(name,args)=>{calls.push({name,args});if(fail)throw Error('offline');const changed=new Set([...args.p_destination_rate_codes,...args.p_global_rate_codes]);rates=[...rates.filter(r=>!changed.has(r.rate_code)),...args.p_rows];return{data:args.p_rows.length,error:null}}}
 const app=mountPage('src/app/(protected)/clientes/[id]/page.tsx',{
  '../../../../hooks/useUser':{useUser:()=>({profile:{id:'admin',tenant_id:'tenant',rol:'Admin',status:'Aprobado',is_active:true}})},
  '../../../../lib/supabase/client':{supabase:client},'@/src/lib/supabase/client':{supabase:client},
  '@/src/hooks/useClientRateAccess':{useClientRateAccess:()=>({hasIndividualAccess:false})},
  '@/src/components/clientes/ClientRateHistory':{ClientRateHistory:'ClientRateHistory'},
  '@/src/lib/pricing-catalogs':{defaultClientRateCatalog:catalog,fetchActiveClientRateCatalog:async()=>catalog},
  'next/navigation':{useParams:()=>({id:'client'}),useRouter:()=>({push(){}}),usePathname:()=>'/clientes/client'},
  sonner:{toast:{success:m=>messages.push(m),error:m=>messages.push(m),info:m=>messages.push(m)}},
 })
 return{app,calls,messages,setFail:v=>{fail=v},rates:()=>rates,async ready(){await app.ready();app.button('Tarifas').props.onClick();app.render()},edit(n,value){app.find(e=>e.type==='input'&&e.props['aria-label']===`Tarifa Tarifa ${n}`).props.onChange({target:{value}});app.render()},async save(){await app.button('Guardar tarifas').props.onClick();await app.ready()}}
}
const baseline={id:'preserve-id',cliente_id:'client',rate_code:'rate_2',rate_label:'Concepto guardado',category:'Guardada',unit:'Especial',currency:'USD',amount:10,is_active:true,valid_from:'2026-01-01',valid_to:'2027-01-01',notes:'Conservar notas',miami_rate_destination:null}

test('116 casillas: primer guardado envia solo cinco editadas; sin cambios no llama RPC',async()=>{
 const f=fixture();try{await f.ready();await f.save();assert.equal(f.calls.length,0)
 for(const n of [0,1,2,3,4])f.edit(n,String(n+1));await f.save()
 assert.equal(f.calls.length,1);const args=f.calls[0].args;assert.equal(args.p_rows.length,5);assert.deepEqual(args.p_destination_rate_codes,['rate_0','rate_1']);assert.deepEqual(args.p_global_rate_codes,['rate_2','rate_3','rate_4']);assert.equal(f.rates().length,5)
 await f.save();assert.equal(f.calls.length,1)
 }finally{f.app.cleanup()}
})
test('cero explicito se guarda; vaciar una celda nueva no crea tarifa',async()=>{
 const f=fixture();try{await f.ready();f.edit(0,'0');f.edit(1,'12');f.edit(1,'');await f.save();assert.equal(f.calls[0].args.p_rows.length,1);assert.equal(f.calls[0].args.p_rows[0].amount,0);assert.equal(f.calls[0].args.p_rows[0].rate_code,'rate_0')}finally{f.app.cleanup()}
})
test('editar y volver al importe original no guarda; otra tarifa conserva ID y metadatos',async()=>{
 const f=fixture([baseline]);try{await f.ready();f.edit(2,'25');f.edit(2,'10');await f.save();assert.equal(f.calls.length,0)
 f.edit(0,'5');await f.save();assert.deepEqual(f.rates().find(r=>r.rate_code==='rate_2'),baseline)
 f.edit(2,'0');await f.save();const changed=f.calls.at(-1).args.p_rows[0];assert.equal(changed.amount,0);for(const k of ['rate_label','unit','currency','notes','valid_from','valid_to'])assert.equal(changed[k],baseline[k]);assert.deepEqual(f.calls.at(-1).args.p_global_rate_codes,['rate_2'])
 }finally{f.app.cleanup()}
})
test('fallo de red conserva las ediciones para reintentar sin incluir el catalogo',async()=>{
 const f=fixture();try{await f.ready();f.edit(0,'5');f.setFail(true);await f.save();assert.equal(f.app.find(n=>n.type==='fieldset').props.disabled,false);f.setFail(false);await f.save();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[0].args,f.calls[1].args);assert.equal(f.calls[1].args.p_rows.length,1)}finally{f.app.cleanup()}
})
test('historial IMEXPO: 116 altas (5 con importe y 111 cero) no son 116 modificaciones',()=>{
 const changes=Array.from({length:116},(_,n)=>({event_id:String(n),rate_code:String(n),before_values:null,after_values:{amount:n<5?10:0}}))
 const summary=getClientRateBatchSummary({changes});assert.equal(summary,'116 altas (5 con importe, 111 en cero)');assert.doesNotMatch(summary,/modificad/)
 assert.match(getClientRateBatchSummary({changes:[{before_values:{amount:1},after_values:{amount:0}}]}),/1 tarifa modificada/)
 assert.match(getClientRateBatchSummary({changes:[{before_values:{amount:1},after_values:null}]}),/1 baja/)
})
