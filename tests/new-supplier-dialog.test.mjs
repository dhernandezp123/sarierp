import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

const catalog={types:[{code:'custom',label:'Servicios generales',active:true}],loading:false,error:null}
const guard={UnsavedChangesGuard:'UnsavedChangesGuard',markFormSaved(){},requestFormNavigation:fn=>fn()}
function setup({single=async()=>({data:{id:'created'},error:null}),onCreated=()=>{},onSavingChange=()=>{}}={}){
 const writes=[],errors=[]
 const api={from(table){if(table==='agents')return {select:()=>({order:()=>Promise.resolve({data:[]})})};return {insert:payload=>{writes.push(payload);return {select:()=>({single})}}}}}
 const app=mountPage('src/components/suppliers/SupplierForm.tsx',{
  '@/src/hooks/useAccounting':{useAccounting:()=>({data:{accounts:[]},loading:false,error:''})},
  '@/src/components/suppliers/SupplierExpenseAccountSelect':{SupplierExpenseAccountSelect:'SupplierExpenseAccountSelect'},
  '@/src/hooks/useSupplierTypes':{useSupplierTypes:()=>catalog},
  '@/src/components/suppliers/SupplierTypeSelect':{SupplierTypeSelect:'SupplierTypeSelect'},
  '@/src/components/ui/UnsavedChangesGuard':guard,
  '@/src/lib/supabase/client':{supabase:api},
  sonner:{toast:{success(){},error:m=>errors.push(m)}},
 },{exported:'SupplierForm',props:{onCreated,onCancel(){},onSavingChange}})
 const fill=()=>{app.find(n=>n.type==='input'&&n.props.placeholder==='Nombre del proveedor').props.onChange({target:{value:'Proveedor ficticio'}});app.render();app.find(n=>n.type==='SupplierTypeSelect').props.onChange('custom');app.render()}
 const submit=()=>app.find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
 return {app,writes,errors,fill,submit}
}

test('formulario compartido guarda desde el modal sin navegar y bloquea envíos repetidos',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r}),created=[],busy=[]
 const {app,fill,submit,writes}=setup({single:()=>pending,onCreated:id=>created.push(id),onSavingChange:v=>busy.push(v)})
 try{await app.ready();fill();submit();submit();app.render();assert.equal(writes.length,1);assert.equal(writes[0].tipo,'custom');assert.equal(app.find(n=>n.type==='fieldset').props.disabled,true)
  resolve({data:{id:'created'},error:null});await app.tick();app.render();assert.deepEqual(created,['created']);assert.deepEqual(busy,[true,false])
 }finally{app.cleanup()}
})

test('error al guardar mantiene los datos y permite reintentar sin cerrar',async()=>{
 const created=[];const {app,fill,submit,errors}=setup({single:async()=>({data:null,error:{message:'Sin conexión'}}),onCreated:id=>created.push(id)})
 try{await app.ready();fill();submit();await app.tick();app.render();assert.deepEqual(created,[]);assert.deepEqual(errors,['Sin conexión']);assert.equal(app.find(n=>n.type==='input'&&n.props.placeholder==='Nombre del proveedor').props.value,'Proveedor ficticio');assert.equal(app.find(n=>n.type==='fieldset').props.disabled,false)}finally{app.cleanup()}
})

test('respuesta tardía después de desmontar no ejecuta navegación ni callbacks de creación',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r}),created=[]
 const {app,fill,submit}=setup({single:()=>pending,onCreated:id=>created.push(id)})
 await app.ready();fill();submit();app.cleanup();resolve({data:{id:'late'},error:null});await app.tick();assert.deepEqual(created,[])
})

test('modal bloquea cierre mientras guarda y solicita protección de cambios al cancelar',()=>{
 const states=[],created=[],requests=[]
 const app=mountPage('src/components/suppliers/NewSupplierDialog.tsx',{
  '@/src/components/ui/dialog':{Dialog:'Dialog',DialogContent:'DialogContent',DialogHeader:'DialogHeader',DialogTitle:'DialogTitle',DialogDescription:'DialogDescription'},
  './SupplierForm':{SupplierForm:'SupplierForm'},
  '@/src/components/ui/UnsavedChangesGuard':{requestFormNavigation:fn=>requests.push(fn)},
 },{exported:'NewSupplierDialog',props:{open:true,onOpenChange:v=>states.push(v),onCreated:id=>created.push(id)}})
 app.render();app.find(n=>n.type==='SupplierForm').props.onSavingChange(true);app.render()
 app.find(n=>n.type==='Dialog').props.onOpenChange(false);assert.equal(requests.length,0)
 app.find(n=>n.type==='SupplierForm').props.onSavingChange(false);app.render()
 app.find(n=>n.type==='SupplierForm').props.onCancel();assert.equal(requests.length,1);assert.deepEqual(states,[])
 requests[0]();assert.deepEqual(states,[false])
 app.find(n=>n.type==='SupplierForm').props.onCreated('new-id');assert.deepEqual(created,['new-id'])
})

test('listado abre modal desde el encabezado y el estado vacío; guarda y recarga el catálogo',async()=>{
 let loads=0;const api={from(){const q={select:()=>q,order:()=>q,range:async()=>{loads++;return {data:[],error:null}}};return q}}
 const app=mountPage('src/app/(protected)/suppliers/page.tsx',{
  '@/src/hooks/useSupplierTypes':{useSupplierTypes:()=>({...catalog,label:c=>c})},
  '@/src/lib/supabase/client':{supabase:api},
  '@/src/components/suppliers/NewSupplierDialog':{NewSupplierDialog:'NewSupplierDialog'},
 })
 try{await app.ready();assert.equal(app.find(n=>n.type==='NewSupplierDialog').props.open,false)
  app.button('Nuevo proveedor').props.onClick();app.render();assert.equal(app.find(n=>n.type==='NewSupplierDialog').props.open,true)
  app.find(n=>n.type==='NewSupplierDialog').props.onOpenChange(false);app.render();app.find(n=>n.type==='EmptyState').props.action.onClick();app.render();assert.equal(app.find(n=>n.type==='NewSupplierDialog').props.open,true)
  app.find(n=>n.type==='NewSupplierDialog').props.onCreated('created');await app.tick();assert.equal(loads,2)
 }finally{app.cleanup()}
})
