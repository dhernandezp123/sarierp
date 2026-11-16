import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const {PurchaseWorkflowPdf}=loadTs('src/components/pdf/purchase-workflow-pdf.tsx')
const base={id:'fixture',kind:'Solicitud',document_number:'SC-FICTICIO',status:'Aprobada',issue_date:'2026-11-16',due_date:'2026-12-16',
  currency:'HNL',exchange_rate:1,fiscal_mode:'Mixta',payment_condition:'Credito',payment_method:'Cheque',payment_reference:'REFERENCIA-FICTICIA',
  supplier_reference:'COTIZACION-FICTICIA',supplier_cai:'CAI-PROVEEDOR-FICTICIO',internal_notes:'SECRETO INTERNO NO PUBLICAR',commercial_notes:'Entrega coordinada',
  issuer_snapshot:{legal_name:'Empresa ficticia',rtn:'00000000000000',address:'Oficina ficticia',fiscal_address:'Domicilio matriz ficticio'},
  supplier_snapshot:{name:'Proveedor ficticio',rtn:'00000000000000',address:'Direccion ficticia',email:'supplier@test.local'},
  items:[{id:'line',description:'Concepto sintetico',quantity:2,unit_price:200,discount_amount:10,tax_rate:15,tax_treatment:'Gravada',amount:390,tax:58.5}],total:448.5,
}
async function render(data) {
  let layout
  const blob=await renderer.pdf(React.cloneElement(PurchaseWorkflowPdf({data}),{onRender:r=>{layout=r._INTERNAL__LAYOUT__DATA_}})).toBlob()
  assert.ok(blob.size>1000)
  const collect=n=>[...(n.type==='TEXT'?(n.lines||[]).map(l=>l.string):[]),...(n.children||[]).flatMap(collect)]
  return {text:collect(layout).join(' ').replace(/\s+/g,' '),layout}
}
test('purchase request PDF uses Sari invoice layout and excludes private notes and fiscal numbering',async()=>{
  const {text,layout}=await render(base)
  for(const expected of ['SOLICITUD DE COMPRA','SC-FICTICIO','16/11/2026','16/12/2026','Proveedor ficticio','COTIZACION-FICTICIA','Cheque','CUATROCIENTOS CUARENTA Y OCHO CON 50/100','Entrega coordinada','Importe exonerado','Importe exento'])assert.ok(text.includes(expected),expected)
  assert.doesNotMatch(text,/SECRETO INTERNO|Rango autorizado|HUELLA DIGITAL/)
  const nodes=n=>[n,...(n.children||[]).flatMap(nodes)]
  assert.ok(nodes(layout).some(n=>Object.values(n.style||{}).includes('#B3282D')))
})
test('order PDF paginates long details without dropping lines or exposing internal notes',async()=>{
  const {text,layout}=await render({...base,kind:'Orden',status:'Cancelada',items:Array.from({length:40},(_,i)=>({...base.items[0],id:String(i),description:`COMPRA-${i} `+'Detalle de prueba '.repeat(8)})),total:17940})
  assert.ok(layout.children.length>1)
  for(let i=0;i<40;i++)assert.ok(text.includes(`COMPRA-${i} `))
  assert.match(text,/ORDEN DE COMPRA/);assert.match(text,/Estado: Cancelada/)
  assert.doesNotMatch(text,/SECRETO INTERNO/)
})
