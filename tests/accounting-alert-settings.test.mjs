import test from 'node:test'
import assert from 'node:assert/strict'
import {mountPage} from './page-harness.mjs'
test('empresa sin configuración inicia con canales apagados y guardar exige motivo y confirmación',async()=>{
 const writes=[]
 const db={from:()=>({select:()=>({maybeSingle:async()=>({data:null,error:null})})}),rpc:async(name,args)=>{if(name==='is_invoice_master')return {data:true,error:null};writes.push({name,args});return {error:null}}}
 const page=mountPage('src/app/(protected)/accounting/alerts/page.tsx',{'@/src/lib/supabase/client':{supabase:db},'@/src/lib/report-query':{readAllReportRows:async()=>[]}},{unwrap:node=>node.type})
 try{
  await page.ready()
  assert.deepEqual(page.findAll(n=>n.type==='input'&&n.props.type==='checkbox').map(n=>n.props.checked),[false,false,false])
  assert.equal(page.button('Guardar calendario y canales').props.disabled,true)
  page.find(n=>n.type==='input'&&n.props.maxLength===1000).props.onChange({target:{value:'Cambio explícito de prueba'}});page.render()
  page.button('Guardar calendario y canales').props.onClick();page.render();assert.equal(writes.length,0)
  page.find(n=>n.type==='ConfirmDialog').props.onConfirm();await page.tick();page.render()
  assert.equal(writes.length,1);assert.equal(writes[0].args.p_revision,0);assert.equal(writes[0].args.p_settings.internal_enabled,false);assert.equal(writes[0].args.p_settings.email_enabled,false)
 }finally{page.cleanup()}
})
