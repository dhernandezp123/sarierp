import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import loadTs from './load-ts.mjs'
const products=loadTs('src/lib/quotation-products.ts')
const settings={default_tax_rate:15,insurance_cost_rate_percent:0.28,insurance_included_service_patterns:['Ocean Freight','Air Freight','origin_charge'],insurance_excluded_service_patterns:[]}

async function form({product='miami_lcl',clientPolicy=false,saleRate=1,company=settings,creationError=false}={}) {
  const previous=globalThis.window
  globalThis.window={location:{search:''},open(){}}
  const saves=[],previews=[],errors=[]
  const customer={id:'client',nombre:'Cliente de prueba',seguro_porcentaje:saleRate,asegura_carga:clientPolicy}
  const freight=id=>({quotation_id:id,rate_code:product==='miami_lcl'?'miami_lcl_freight':'miami_air_freight',description:product==='miami_lcl'?'Flete Miami LCL':'Flete Miami Aéreo Consolidado',item_type:'freight',quantity:1,cost_amount:0,sale_amount:500,total_amount:500,taxable:false,tax_amount:0,tax_rate:0})
  const client={from(table){const q=new Proxy({},{get(_t,key){if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='clientes'?[customer]:[],error:null}).then(resolve,reject);return()=>q}});return q}}
  const page=mountPage('src/app/(protected)/quotations/new/page.tsx',{
    '../../../../hooks/useUser':{useUser:()=>({profile:{id:'seller',rol:'Ventas'}})},
    '../../../../lib/supabase/client':{supabase:client},
    '@/src/lib/activity-logger':{createActivityLog:async()=>({ok:true})},
    '@/src/lib/notifications':{createNotification:async()=>({ok:true})},
    '../../../../components/pdf/quotation-pdf':{default:'QuotationPDF'},
    '@/src/lib/company-settings':{loadCurrentCompanySettings:async()=>({data:company,error:null})},
    '@/src/lib/quotation-products':{...products,fetchActiveServiceProducts:async()=>products.serviceProducts},
    '@/src/lib/quotation-create':{createQuotation:async(_client,input)=>{saves.push(input);if(creationError)throw Error('RPC rechazó la creación');return{id:input.quotation.id,quotation_number:'TEST'}}},
    '@/src/components/quotations/MiamiQuotationSection':{MiamiQuotationSection:'MiamiQuotationSection'},
    '@/src/components/ui/ClienteCombobox':{ClienteCombobox:'ClienteCombobox'},
    '@/src/components/ui/UnsavedChangesGuard':{UnsavedChangesGuard:'Guard',markFormSaved(){}},
    '@/src/hooks/useMiamiQuotation':{useMiamiQuotation:()=>({isMiamiFlow:true,lclEstimated:500,airEstimated:500,canUseMiamiCalculator:true,buildMiamiPricingItems:id=>[freight(id)],buildMiamiPreviewItems:()=>[freight('preview')]})},
    '@react-pdf/renderer':{pdf:element=>{previews.push(element.props);return{toBlob:async()=>new Blob(['demo'])}}},
    sonner:{toast:{error:message=>errors.push(message),success(){},info(){}}},
  })
  await page.ready()
  const change=(name,value,type='text')=>{const node=page.find(n=>n.props?.name===name);assert.ok(node,name);node.props.onChange({target:{name,value,type,checked:value}});page.render()}
  page.find(n=>n.type==='ClienteCombobox').props.onChange('client');page.render()
  change('service_product',product);change('incoterm','FOB','select-one')
  return {page,saves,previews,errors,change,cleanup:()=>{page.cleanup();globalThis.window=previous}}
}

test('Miami aprobado y PDF reciben el mismo seguro con FOB visible, para LCL y aéreo',async()=>{
  for(const product of ['miami_lcl','miami_air']) {
    const f=await form({product})
    try {
      f.change('requires_insurance',true,'checkbox');f.change('commercial_value','1000')
      await f.page.button('Previsualizar PDF').props.onClick()
      const preview=f.previews.at(-1).pricingItems.find(item=>item.item_type==='Seguro')
      assert.ok(preview)
      await f.page.button('Crear cotización aprobada').props.onClick()
      assert.equal(f.saves.length,1)
      const saved=f.saves[0].pricing.find(item=>item.item_type==='Seguro')
      assert.equal(f.saves[0].quotation.status,'Pricing Aprobado')
      assert.equal(f.saves[0].quotation.commercial_value,1000)
      assert.equal(f.saves[0].quotation.fob_value,1000)
      assert.equal(saved.sale_amount,75);assert.equal(saved.total_amount,86.25)
      assert.equal(saved.sale_amount,preview.sale_amount);assert.equal(saved.tax_amount,preview.tax_amount)
      assert.equal(saved.quotation_id,f.saves[0].quotation.id)
    } finally {f.cleanup()}
  }
})

test('seguro obligatorio del cliente se aplica sin marcar; faltan datos impide aprobar pero permite borrador',async()=>{
  const f=await form({clientPolicy:true})
  try {
    assert.equal(f.page.find(n=>n.props?.name==='requires_insurance').props.checked,true)
    await f.page.button('Crear cotización aprobada').props.onClick()
    assert.equal(f.saves.length,0);assert.ok(f.errors.some(e=>e.includes('FOB')))
    await f.page.button('Guardar cotización').props.onClick()
    assert.equal(f.saves[0].quotation.status,'Borrador')
    assert.equal(f.saves[0].quotation.requires_insurance,true)
    assert.ok(!f.saves[0].pricing.some(item=>item.item_type==='Seguro'))
  } finally {f.cleanup()}
})

test('sin tasa o configuración no se aprueba ni se genera PDF incompleto; error RPC conserva formulario',async()=>{
  for(const options of [{saleRate:0},{company:null},{creationError:true}]) {
    const f=await form(options)
    try {
      f.change('requires_insurance',true,'checkbox');f.change('commercial_value','1000')
      if(!options.creationError){await f.page.button('Previsualizar PDF').props.onClick();assert.equal(f.previews.length,0)}
      await f.page.button('Crear cotización aprobada').props.onClick()
      assert.ok(f.errors.length>0)
      assert.equal(f.page.find(n=>n.props?.name==='commercial_value').props.value,'1000')
      if(options.creationError)assert.ok(f.errors.includes('RPC rechazó la creación'))
      else assert.equal(f.saves.length,0)
    } finally {f.cleanup()}
  }
})
