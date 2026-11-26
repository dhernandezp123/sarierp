import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

async function mount() {
  const saves=[]
  const suppliers=[{id:'supplier',nombre:'Proveedor ficticio',default_expense_account_id:'default-account'}]
  const accounting={context:'fixture',data:{accounts:[],periods:[],mappings:{}},loading:false,error:'',isCurrent:()=>true}
  const client={from(table){let offset=0;const q=new Proxy({},{get(_t,key){if(key==='range')return from=>{offset=from;return q};if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='proveedores'?suppliers.slice(offset):[],error:null}).then(resolve,reject);return()=>q}});return q},async rpc(name,args){saves.push({name,args});return {error:{message:'Fixture: no emitir'}}}}
  const page=mountPage('src/app/(protected)/accounting/purchases/page.tsx',{
    '@/src/hooks/useAccounting':{useAccounting:()=>accounting},
    '@/src/lib/supabase/client':{supabase:client},
    '@/src/components/invoicing/InvoiceLineSettings':{InvoiceLineSettingsProvider:'Settings',ServiceCatalogSelect:'ServiceCatalogSelect',ServiceLineAccountSelect:'ServiceLineAccountSelect'},
    '@/src/components/pdf/purchase-fiscal-pdf':{PurchaseFiscalPdf:'PDF'},
  })
  await page.ready();page.button('Registrar documento').props.onClick();page.render()
  const field=label=>page.find(n=>n.props?.label===label).props.children
  const change=(label,value)=>{field(label).props.onChange({target:{value}});page.render()}
  const service=()=>page.find(n=>n.type==='ServiceCatalogSelect')
  const account=()=>page.find(n=>n.type==='ServiceLineAccountSelect')
  const select=choice=>{service().props.onSelect(choice);page.render()}
  const toggle=checked=>{page.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked}});page.render()}
  const save=async()=>{page.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await page.tick();page.render();return saves.at(-1).args}
  change('Proveedor','supplier')
  return {page,field,change,service,account,select,toggle,save}
}

test('compra sin asignación conserva cuenta predeterminada/manual al cambiar ISV y restablece default al limpiar servicio',async()=>{
  const f=await mount()
  try {
    f.select({kind:'service',code:'unmapped',label:'Servicio único'})
    assert.equal(f.account().props.accountId,'default-account')
    f.account().props.onAccount('manual-account');f.page.render()
    f.select({kind:'service',code:'other-unmapped',label:'Otro servicio'})
    assert.equal(f.account().props.accountId,'manual-account')
    f.toggle(true);f.change('Tasa de ISV','18')
    assert.equal(f.account().props.accountId,'manual-account')
    f.toggle(false);assert.equal(f.account().props.accountId,'manual-account')
    f.service().props.onClear();f.page.render()
    assert.equal(f.account().props.accountId,'default-account');assert.equal(f.account().props.reference,undefined)
  }finally{f.page.cleanup()}
})

test('boleta envía una sola referencia y cuenta fija del servicio a 0/15/18%, sin crédito fiscal',async()=>{
  const f=await mount()
  try {
    f.change('Tipo de documento','Boleta de Compra')
    f.select({kind:'service',code:'mapped',label:'Servicio único',expense_account_id:'service-account'})
    f.change('Cantidad','1');f.change('Precio unitario HNL','100')
    for(const rate of [0,15,18]){
      if(rate===15)f.toggle(true)
      if(rate===18)f.change('Tasa de ISV','18')
      assert.equal(f.account().props.accountId,'service-account')
      const payload=await f.save(),item=payload.p_items[0]
      assert.equal(item.account_id,'service-account');assert.equal(item.service_catalog_code,'mapped')
      assert.equal(item.tax_rate,rate);assert.equal(item.tax_credit,false)
      assert.equal(payload.p_document.document_type,'Boleta de Compra')
    }
    f.service().props.onClear();f.page.render();assert.equal(f.account().props.accountId,'default-account')
  }finally{f.page.cleanup()}
})
