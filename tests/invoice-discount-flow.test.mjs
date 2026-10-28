import test from 'node:test'
import assert from 'node:assert/strict'
import {mountPage} from './page-harness.mjs'
test('formulario real envía descuento de línea y presenta total neto con ISV',async()=>{
 const previous=globalThis.window;globalThis.window={setTimeout,clearTimeout};const writes=[]
 const client={from(table){const q={select:()=>q,order:()=>q,is:()=>q,eq:()=>q,then:resolve=>Promise.resolve({data:table==='clientes'?[{id:'cliente',nombre:'Cliente SPS',rtn:'00000000000000',condicion_pago:'Contado',dias_credito:0,billing_office:{name:'San Pedro Sula',is_active:true}}]:[],error:null}).then(resolve),maybeSingle:async()=>({data:{id:'cai',cai:'TEST-CAI',point_of_sale:'San Pedro Sula',document_type:'Factura',fecha_limite_emision:'2099-12-31'},error:null})};return q},async rpc(name,args){if(name==='get_my_billing_office_access')return{data:[{name:'San Pedro Sula',allowed:true}],error:null};if(name==='save_invoice_draft'){writes.push(args);return{data:{id:args.p_id,revision:1,editor_state:args.p_editor_state,status:'Borrador'},error:null}}if(name==='issue_invoice_draft')return{data:[{invoice_id:'created',invoice_number:'TEST-1'}],error:null};return{data:['San Pedro Sula'],error:null}}}
 const app=mountPage('src/app/(protected)/invoicing/new/page.tsx',{'../../../../lib/supabase/client':{supabase:client},'@/src/lib/supabase/client':{supabase:client},'@/src/lib/company-settings':{loadCurrentCompanySettings:async()=>({data:{currency:'HNL',default_currency:'HNL'},error:null})},'@/src/components/ui/UnsavedChangesGuard':{UnsavedChangesGuard:'Guard',requestFormNavigation(){},markFormSaved(){}}})
 try{
  await app.ready();await app.tick();app.render()
  app.find(n=>n.type==='select'&&app.text(n).includes('Cliente SPS')).props.onChange({target:{value:'cliente'}});app.render();await app.tick();app.render()
  app.find(n=>n.type==='input'&&n.props.placeholder==='Descripción del servicio...').props.onChange({target:{value:'Flete con descuento'}});app.render()
  app.find(n=>n.type==='input'&&n.props.type==='number'&&n.props.step==='0.01'&&!n.props['aria-label']&&n.props.value==='0').props.onChange({target:{value:'150'}});app.render()
  app.find(n=>n.props?.['aria-label']==='Descuento de línea').props.onChange({target:{value:''}});app.render()
  assert.equal(app.find(n=>n.props?.['aria-label']==='Descuento de línea').props.value,'')
  assert.match(app.text(),/172\.50/)
  app.find(n=>n.props?.['aria-label']==='Descuento de línea').props.onChange({target:{value:'10'}});app.render()
  assert.match(app.text(),/161\.00/)
  const save=app.button('Emitir factura')
  assert.ok(save,'botón de emisión disponible');save.props.onClick();app.render();app.find(n=>n.type==='ConfirmDialog'&&n.props.title==='Emitir factura').props.onConfirm();await app.tick()
  assert.equal(writes.length,1);assert.equal(writes[0].p_items[0].discount_amount,10);assert.equal(writes[0].p_items[0].unit_price,150);assert.equal(writes[0].p_invoice.currency,'HNL')
 }finally{app.cleanup();if(previous===undefined)delete globalThis.window;else globalThis.window=previous}
})
