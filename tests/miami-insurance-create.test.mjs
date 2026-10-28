import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import loadTs from './load-ts.mjs'
const products=loadTs('src/lib/quotation-products.ts')
const settings={default_tax_rate:15,insurance_cost_rate_percent:0.28,insurance_included_service_patterns:['Ocean Freight','Air Freight','origin_charge'],insurance_excluded_service_patterns:[]}

async function form({product='miami_lcl',clientPolicy=false,saleRate=1,company=settings,creationError=false,sourceQuote=null,sourceItems=[]}={}) {
  const previous=globalThis.window
  globalThis.window={location:{search:sourceQuote?'?duplicateFrom=source':''},open(){}}
  const saves=[],previews=[],errors=[]
  const customer={id:'client',nombre:'Cliente de prueba',seguro_porcentaje:saleRate,asegura_carga:clientPolicy}
  const otherCustomer={...customer,id:'other-client',asegura_carga:false}
  const freight=id=>({quotation_id:id,rate_code:product==='miami_lcl'?'miami_lcl_freight':'miami_air_freight',description:product==='miami_lcl'?'Flete Miami LCL':'Flete Miami Aéreo Consolidado',item_type:'freight',quantity:1,cost_amount:0,sale_amount:500,total_amount:500,taxable:false,tax_amount:0,tax_rate:0})
  const client={from(table){const q=new Proxy({},{get(_t,key){if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='clientes'?[customer,otherCustomer]:table==='quotations'?sourceQuote:table==='pricing_items'?sourceItems:[],error:null}).then(resolve,reject);return()=>q}});return q}}
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
  const selectClient=id=>{page.find(n=>n.type==='ClienteCombobox').props.onChange(id);page.render()}
  if(!sourceQuote){selectClient('client');change('service_product',product);change('incoterm','FOB','select-one')}
  return {page,saves,previews,errors,change,selectClient,cleanup:()=>{page.cleanup();globalThis.window=previous}}
}

test('Miami aprobado y PDF reciben el mismo seguro e ISV opcional, para LCL y aéreo',async()=>{
  for(const product of ['miami_lcl','miami_air']) {
    for(const taxable of [false,true]) {
      const f=await form({product})
      try {
        f.change('requires_insurance',true,'checkbox');f.change('commercial_value','1000')
        assert.equal(f.page.find(n=>n.props?.name==='insurance_taxable').props.checked,false)
        if(taxable)f.change('insurance_taxable',true,'checkbox')
        await f.page.button('Previsualizar PDF').props.onClick()
        const preview=f.previews.at(-1).pricingItems.find(item=>item.item_type==='Seguro')
        assert.ok(preview)
        await f.page.button('Crear cotización aprobada').props.onClick()
        assert.equal(f.saves.length,1)
        const saved=f.saves[0].pricing.find(item=>item.item_type==='Seguro')
        assert.equal(f.saves[0].quotation.status,'Pricing Aprobado')
        assert.equal(f.saves[0].quotation.commercial_value,1000)
        assert.equal(f.saves[0].quotation.fob_value,1000)
        assert.equal(saved.sale_amount,75);assert.equal(saved.total_amount,taxable?86.25:75)
        assert.equal(saved.taxable,taxable)
        assert.equal(saved.tax_rate,taxable?15:0)
        assert.equal(saved.tax_amount,taxable?11.25:0)
        assert.equal(saved.sale_amount,preview.sale_amount);assert.equal(saved.tax_amount,preview.tax_amount)
        assert.equal(saved.quotation_id,f.saves[0].quotation.id)
      } finally {f.cleanup()}
    }
  }
})

test('desmarcar ISV después de aplicarlo vuelve a cero en PDF y borrador',async()=>{
  const f=await form({clientPolicy:true})
  try {
    f.change('commercial_value','1000')
    f.change('insurance_taxable',true,'checkbox')
    f.change('insurance_taxable',false,'checkbox')
    await f.page.button('Previsualizar PDF').props.onClick()
    const preview=f.previews.at(-1).pricingItems.find(item=>item.item_type==='Seguro')
    assert.equal(preview.tax_amount,0)
    assert.equal(preview.total_amount,75)
    await f.page.button('Guardar cotización').props.onClick()
    assert.equal(f.saves[0].quotation.status,'Borrador')
    const saved=f.saves[0].pricing.find(item=>item.item_type==='Seguro')
    assert.equal(saved.taxable,false)
    assert.equal(saved.tax_amount,0)
    assert.equal(saved.total_amount,75)
  } finally {f.cleanup()}
})

test('duplicar conserva el ISV explícito de la línea de seguro sin deducirlo de la tasa de empresa',async()=>{
  for(const taxable of [false,true]) {
    const f=await form({clientPolicy:true,sourceQuote:{id:'source',quotation_number:'SOURCE',cliente_id:'client',service_product:'miami_lcl',quote_type:'LCL',tipo_transporte:'Marítima',incoterm:'FOB',requires_insurance:true,commercial_value:1000},sourceItems:[{item_type:'Seguro',taxable,tax_rate:taxable?15:0}]})
    try {
      assert.equal(f.page.find(n=>n.props?.name==='insurance_taxable').props.checked,taxable)
      await f.page.button('Crear cotización aprobada').props.onClick()
      assert.equal(f.saves[0].pricing.find(item=>item.item_type==='Seguro').taxable,taxable)
    } finally {f.cleanup()}
  }
})

test('seguro predeterminado del cliente se aplica sin marcar; faltan datos impide aprobar pero permite borrador',async()=>{
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

test('cliente que asegura puede desmarcar por cotización: sin FOB, cargo ni seguro en el PDF y guardado',async()=>{
  for(const product of ['miami_lcl','miami_air']) {
    const f=await form({product,clientPolicy:true})
    try {
      assert.equal(f.page.find(n=>n.props?.name==='requires_insurance').props.checked,true)
      assert.ok(!f.page.find(n=>n.props?.name==='requires_insurance').props.disabled)
      f.change('requires_insurance',false,'checkbox')
      f.change('contact_name','Contacto actualizado')
      assert.equal(f.page.find(n=>n.props?.name==='requires_insurance').props.checked,false)
      await f.page.button('Previsualizar PDF').props.onClick()
      assert.equal(f.previews.length,1)
      assert.equal(f.previews[0].quotation.requires_insurance,false)
      assert.ok(!f.previews[0].pricingItems.some(item=>item.item_type==='Seguro'))
      await f.page.button('Crear cotización aprobada').props.onClick()
      assert.deepEqual(f.errors,[])
      assert.equal(f.saves.length,1)
      assert.equal(f.saves[0].quotation.requires_insurance,false)
      assert.equal(f.saves[0].quotation.insurance_cost,0)
      assert.ok(!f.saves[0].pricing.some(item=>item.item_type==='Seguro'))
    } finally {f.cleanup()}
  }
})

test('la decisión de seguro se puede volver a activar y el cambio de cliente usa su propio valor inicial',async()=>{
  const f=await form({clientPolicy:true})
  try {
    f.change('requires_insurance',false,'checkbox')
    f.change('requires_insurance',true,'checkbox');f.change('commercial_value','1000')
    await f.page.button('Previsualizar PDF').props.onClick()
    assert.ok(f.previews.at(-1).pricingItems.some(item=>item.item_type==='Seguro'))
    f.selectClient('other-client')
    assert.equal(f.page.find(n=>n.props?.name==='requires_insurance').props.checked,false)
    f.selectClient('client')
    assert.equal(f.page.find(n=>n.props?.name==='requires_insurance').props.checked,true)
  } finally {f.cleanup()}
})

test('duplicar conserva la decisión de no asegurar aunque el cliente tenga seguro por defecto',async()=>{
  const f=await form({clientPolicy:true,sourceQuote:{id:'source',quotation_number:'SOURCE',cliente_id:'client',service_product:'miami_lcl',quote_type:'LCL',tipo_transporte:'Marítima',incoterm:'FOB',requires_insurance:false,insurance_cost:123}})
  try {
    assert.equal(f.page.find(n=>n.props?.name==='requires_insurance').props.checked,false)
    await f.page.button('Crear cotización aprobada').props.onClick()
    assert.deepEqual(f.errors,[])
    assert.equal(f.saves[0].quotation.requires_insurance,false)
    assert.equal(f.saves[0].quotation.insurance_cost,0)
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
