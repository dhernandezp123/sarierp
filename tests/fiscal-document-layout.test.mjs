import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'
const {InvoicePdf}=loadTs('src/components/pdf/invoice-pdf.tsx')
const logo='data:image/png;base64,'+fs.readFileSync('public/logo/sari-logo.png').toString('base64')
const base={invoice_number:'001-001-01-00000001',invoice_type:'Factura',status:'Aprobada',issue_date:'2026-10-27',due_date:'2026-11-26',payment_condition:'Crédito',credit_days:30,currency:'HNL',exchange_rate:1,company_legal_name:'Sari Express S. de R.L. de C.V.',company_rtn:'00000000000000',company_address:'Domicilio de la oficina de ejemplo',company_fiscal_address:'Domicilio fiscal de la casa matriz',company_phone:'+504 0000-0000',company_email:'facturacion@example.invalid',point_of_sale:'San Pedro Sula',cliente_nombre:'Cliente de ejemplo',cliente_rtn:'00000000000000',cliente_direccion:'Dirección ficticia',notes:'Referencia operativa de prueba.',subtotal:190,discount_amount:10,tax_amount:28.5,total:218.5,importe_exento:0,importe_exonerado:0,gravado_15:190,gravado_18:0,isv_15_amount:28.5,isv_18_amount:0,items:[{description:'Servicio con descuento',quantity:2,unit_price:100,discount_amount:10,amount:190,isv_rate:15}],cai:'CAI-PROPIO-TEST',rango_desde:'001-001-01-00000001',rango_hasta:'001-001-01-00000100',fecha_limite_emision:'2026-12-31',reference_equivalence:{currency:'USD',rate:25,operation:'divide',amount:8.74}}
const walk=node=>[node,...(node.children||[]).flatMap(walk)]
async function render(data){let layout;await renderer.pdf(React.cloneElement(InvoicePdf({data,logo}),{onRender:r=>{layout=r._INTERNAL__LAYOUT__DATA_}})).toBlob();const nodes=walk(layout),text=nodes.flatMap(n=>n.type==='TEXT'?(n.lines||[]).map(l=>l.string):[]).join('\n');return{layout,nodes,text}}
test('plantilla Sari real usa Carta, logo, rojo y descuento neto, con equivalencia antes del total',async()=>{
 const {layout,nodes,text}=await render(base)
 assert.equal(layout.children.length,1);assert.equal(layout.children[0].box.width,612);assert.equal(layout.children[0].box.height,792)
 assert.ok(nodes.some(n=>n.type==='IMAGE'));assert.ok(nodes.some(n=>n.style?.backgroundColor==='#B3282D'))
 for(const value of ['HNL 200.00','HNL 10.00','HNL 190.00','HNL 218.50','Generado con Forwarders','Domicilio fiscal de la casa matriz','facturacion@example.invalid'])assert.ok(text.includes(value),value)
 assert.ok(text.indexOf('Equivalencia informativa')<text.indexOf('TOTAL'))
})
test('anulación se imprime con leyenda, motivo y fecha sin perder el CAI ni el importe original',async()=>{
 const {text}=await render({...base,status:'Anulada',cancellation_reason:'Error de identificación confirmado',cancelled_at:'2026-10-27T18:00:00Z'})
 for(const value of ['ANULADA','Error de identificación confirmado','27/10/2026','CAI-PROPIO-TEST','HNL 218.50'])assert.ok(text.includes(value),value)
 const proforma=await render({...base,invoice_type:'Proforma'})
 assert.match(proforma.text,/sin validez fiscal/)
})

test('nota conserva ambos CAI, motivo y fecha original sin usar el CAI de la nota como referencia',async()=>{
 const {text}=await render({...base,invoice_type:'Nota de Débito',invoice_number:'001-001-07-00000001',parent_fiscal_snapshot:{invoice_number:'001-001-01-00000099',cai:'CAI-ORIGEN-TEST',issue_date:'2026-10-20'},motivo:'Almacenaje adicional'})
 for(const value of ['NOTA DE DÉBITO','CAI-PROPIO-TEST','CAI-ORIGEN-TEST','001-001-01-00000099','20/10/2026','Almacenaje adicional'])assert.ok(text.includes(value),value)
})
test('cuarenta líneas y descripción larga se imprimen completas, con encabezado/footer sin superponer filas',async()=>{
 const rows=Array.from({length:40},(_,i)=>({...base.items[0],description:`CONCEPTO-${String(i).padStart(2,'0')} `+'Servicio de prueba '.repeat(i===20?25:1)}))
 const {layout,text}=await render({...base,items:rows})
 assert.ok(layout.children.length>1)
 for(let i=0;i<40;i++)assert.ok(text.includes(`CONCEPTO-${String(i).padStart(2,'0')}`))
 for(const page of layout.children){
  const header=page.children.find(n=>n.props?.fixed&&n.style?.borderBottomColor==='#B3282D')
  assert.ok(header)
  const footer=page.children.find(n=>n.props?.fixed&&n.style?.bottom===16)
  assert.ok(footer&&footer.box.top>=740&&footer.box.top+footer.box.height<=792,'pie visible dentro de la página')
  for(const row of page.children.filter(n=>n.style?.borderBottomColor==='#E2E4E7')){
   assert.ok(row.box.top>=header.box.top+header.box.height-1,'fila debe empezar debajo del encabezado')
   assert.ok(row.box.top+row.box.height<746,'fila debe terminar antes del pie')
  }
 }
 assert.equal(text.match(/CAI-PROPIO-TEST/g).length,1)
})
