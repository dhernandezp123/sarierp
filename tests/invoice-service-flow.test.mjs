import test from 'node:test'
import assert from 'node:assert/strict'
import {mountPage} from './page-harness.mjs'

async function mount({proforma=false,saved=null}={}) {
  const previous=globalThis.window;globalThis.window={setTimeout,clearTimeout}
  const writes=[]
  const client={id:'client',nombre:'Cliente ficticio',rtn:'00000000000000',condicion_pago:'Credito',dias_credito:30,billing_office:{name:'SPS',is_active:true}}
  const api={from(table){const result=()=>({data:table==='clientes'?[client]:[],error:null});const q={select:()=>q,order:()=>q,is:()=>q,eq:()=>q,then:resolve=>Promise.resolve(result()).then(resolve),single:async()=>({data:saved,error:null}),maybeSingle:async()=>({data:null,error:null})};return q},async rpc(name,args){
    if(name==='get_my_billing_office_access')return{data:[{name:'SPS',allowed:true}],error:null}
    if(name==='get_invoice_courtesies')return{data:{requests:[],total:0},error:null}
    if(name==='save_invoice_draft'){writes.push(args);return{data:{id:args.p_id,revision:1,status:'Borrador',editor_state:args.p_editor_state},error:null}}
    return{data:[],error:null}
  }}
  const app=mountPage('src/app/(protected)/invoicing/new/page.tsx',{
    'next/navigation':{useRouter:()=>({push(){},replace(){}}),useSearchParams:()=>new URLSearchParams(saved?'draft=draft':proforma?'doc_type=proforma':'')},
    '../../../../lib/supabase/client':{supabase:api},'@/src/lib/supabase/client':{supabase:api},
    '@/src/lib/company-settings':{loadCurrentCompanySettings:async()=>({data:{default_currency:'HNL'},error:null})},
    '@/src/components/ui/UnsavedChangesGuard':{UnsavedChangesGuard:'Guard',requestFormNavigation(){},markFormSaved(){}},
  })
  await app.ready();await app.tick();app.render()
  if(!saved){app.find(n=>n.props?.id==='invoice-client').props.onChange('client');app.render();await app.tick();app.render()}
  const date=index=>app.findAll(n=>n.type==='input'&&n.props.type==='date')[index]
  const change=(node,value)=>{node.props.onChange({target:{value}});app.render()}
  const settings=()=>app.find(n=>typeof n.type==='function'&&n.type.name==='InvoiceLineSettings')
  const checkbox=()=>app.find(n=>n.props?.['aria-label']==='Línea gravable')
  return{app,writes,date,change,settings,checkbox,cleanup(){app.cleanup();if(previous===undefined)delete globalThis.window;else globalThis.window=previous}}
}

for(const proforma of [false,true])test(`${proforma?'proforma':'factura'} conserva impuesto, tasa y cuenta al seleccionar servicio y oculta tasa en documento exento`,async()=>{
  const f=await mount({proforma})
  try{
    f.checkbox().props.onChange({target:{checked:false}});f.app.render()
    f.settings().props.onService({kind:'service',code:'one',label:'Servicio',taxable:true,income_account_id:'income'});f.app.render()
    assert.equal(f.checkbox().props.checked,false)
    assert.equal(f.app.find(n=>n.props?.['aria-label']==='Tasa ISV de línea'),undefined)
    assert.equal(f.settings().props.accountId,'income')
    f.checkbox().props.onChange({target:{checked:true}});f.app.render()
    f.change(f.app.find(n=>n.props?.['aria-label']==='Tasa ISV de línea'),'18')
    f.settings().props.onService({kind:'service',code:'two',label:'Otro',taxable:false,income_account_id:'income'});f.app.render()
    assert.equal(f.checkbox().props.checked,true)
    assert.equal(f.app.find(n=>n.props?.['aria-label']==='Tasa ISV de línea').props.value,18)
    assert.equal(f.settings().props.accountId,'income')
    for(const mode of ['Exenta','Exonerada']){
      const options=f.app.find(n=>typeof n.type==='function'&&n.type.name==='InvoiceFiscalOptions')
      options.props.onChange({...options.props.value,mode});f.app.render()
      assert.equal(f.checkbox().props.checked,false)
      assert.equal(f.app.find(n=>n.props?.['aria-label']==='Tasa ISV de línea'),undefined)
      assert.equal(f.app.find(n=>n.props?.['aria-label']==='Motivo sin ISV').props.value,mode)
    }
  }finally{f.cleanup()}
})

test('vencimiento manual cruza mes, se guarda en payload y editor de borrador y se conserva al reabrir',async()=>{
  const f=await mount();let saved
  try{
    f.change(f.date(0),'2026-11-13')
    assert.equal(f.date(1).props.value,'2026-12-13')
    assert.equal(f.date(1).props.readOnly,undefined)
    assert.equal(f.date(1).props.min,'2026-11-13')
    f.change(f.date(1),'2027-01-15')
    f.app.button('Guardar borrador').props.onClick();await f.app.tick();f.app.render()
    assert.equal(f.writes.at(-1).p_invoice.due_date,'2027-01-15')
    assert.equal(f.writes.at(-1).p_editor_state.dueDate,'2027-01-15')
    saved={id:'draft',revision:1,status:'Borrador',editor_state:f.writes.at(-1).p_editor_state}
  }finally{f.cleanup()}
  const reopened=await mount({saved})
  try{assert.equal(reopened.date(1).props.value,'2027-01-15')}finally{reopened.cleanup()}
})
