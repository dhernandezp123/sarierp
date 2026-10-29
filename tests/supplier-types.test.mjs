import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

const types=[{id:'t1',code:'custom',label:'Servicios generales',active:true,sort_order:10,revision:1},{id:'t2',code:'old',label:'Anterior',active:false,sort_order:20,revision:2}]
const catalog={types,loading:false,error:null,label:code=>types.find(t=>t.code===code)?.label||code,reload(){}}

test('selector usa el catálogo dinámico, conserva el tipo inactivo asignado y permite filtrarlo',()=>{
 const app=mountPage('src/components/suppliers/SupplierTypeSelect.tsx',{}, {exported:'SupplierTypeSelect',props:{types,value:'old',onChange(){},loading:false,error:null}})
 app.render();let select=app.find(n=>n.type==='CompactSelect').props
 assert.equal(select.searchable,true);assert.equal(select.options.find(o=>o.value==='old').disabled,true)
 assert.equal(select.options.find(o=>o.value==='custom').label,'Servicios generales')
 const filter=mountPage('src/components/suppliers/SupplierTypeSelect.tsx',{}, {exported:'SupplierTypeSelect',props:{types,value:'',onChange(){},loading:false,error:null,filter:true}})
 filter.render();select=filter.find(n=>n.type==='CompactSelect').props
 assert.equal(select.options.find(o=>o.value==='old').disabled,false)
 const failed=mountPage('src/components/suppliers/SupplierTypeSelect.tsx',{}, {exported:'SupplierTypeSelect',props:{types:[],value:'',onChange(){},loading:false,error:'No disponible'}})
 failed.render();assert.equal(failed.find(n=>n.type==='CompactSelect').props.disabled,true)
})

test('pantalla de catálogo guarda código y etiqueta vía RPC con versión, y no escribe directamente la tabla',async()=>{
 const oldWindow=globalThis.window;globalThis.window={dispatchEvent(){}}
 const calls=[]
 const app=mountPage('src/app/(protected)/suppliers/types/page.tsx',{
  '@/src/hooks/useSupplierTypes':{useSupplierTypes:()=>catalog,SUPPLIER_TYPES_UPDATED:'test-types'},
  '@/src/hooks/useInvoiceMaster':{useInvoiceMaster:()=>({isMaster:true})},
  '@/src/lib/supabase/client':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {error:null}}}},
 })
 try{
  app.render();app.find(n=>n.type==='input'&&n.props.placeholder==='Ej. servicios_generales').props.onChange({target:{value:'new_type'}});app.render()
  app.find(n=>n.type==='input'&&n.props.placeholder==='Ej. Servicios generales').props.onChange({target:{value:'Tipo nuevo'}});app.render()
  app.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await app.tick();app.render()
  assert.equal(calls[0].name,'save_supplier_type');assert.equal(calls[0].args.p_code,'new_type');assert.equal(calls[0].args.p_revision,0)
  app.find(n=>n.type==='input'&&n.props.placeholder==='Ej. servicios_generales').props.onChange({target:{value:'borrador_sin_guardar'}});app.render()
  app.find(n=>n.type==='button'&&n.props['aria-label']==='Activar Anterior').props.onClick();await app.tick();app.render()
  assert.equal(calls[1].args.p_id,'t2');assert.equal(calls[1].args.p_revision,2);assert.equal(calls[1].args.p_active,true)
  assert.equal(app.find(n=>n.type==='input'&&n.props.placeholder==='Ej. servicios_generales').props.value,'borrador_sin_guardar')
 }finally{app.cleanup();globalThis.window=oldWindow}
})

test('Contabilidad sin designación consulta el catálogo sin controles de edición',()=>{
 const app=mountPage('src/app/(protected)/suppliers/types/page.tsx',{
  '@/src/hooks/useSupplierTypes':{useSupplierTypes:()=>catalog},
  '@/src/hooks/useInvoiceMaster':{useInvoiceMaster:()=>({isMaster:false})},
  '@/src/lib/supabase/client':{supabase:{}},
 })
 app.render();assert.equal(app.find(n=>n.type==='form'),undefined)
 assert.equal(app.find(n=>n.type==='button'&&n.props.role==='switch').props.disabled,true)
 assert.match(app.text(),/Servicios generales/)
})

test('listado muestra la etiqueta del catálogo y calcula sus indicadores sin tipos fijos',async()=>{
 const rows=[{id:'s1',nombre:'Proveedor ficticio',tipo:'custom',moneda:'HNL',terminos_pago:0,is_active:true}]
 const api={from(){const q={select:()=>q,order:()=>q,range:async(from)=>({data:from?[]:rows,error:null})};return q}}
 const app=mountPage('src/app/(protected)/suppliers/page.tsx',{'@/src/hooks/useSupplierTypes':{useSupplierTypes:()=>catalog},'@/src/lib/supabase/client':{supabase:api},'@/src/components/suppliers/SupplierTypeSelect':{SupplierTypeSelect:'SupplierTypeSelect'}})
 try{await app.ready();assert.match(app.text(),/Servicios generales/);assert.doesNotMatch(app.text(),/Aduanales|Carriers/);assert.ok(app.find(n=>n.type==='a'&&n.props.href==='/suppliers/types'))}finally{app.cleanup()}
})
