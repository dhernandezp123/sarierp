import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'
const {PurchaseFiscalPdf}=loadTs('src/components/pdf/purchase-fiscal-pdf.tsx')
const {amountInWords}=loadTs('src/lib/amount-in-words.ts')
const issuer={legal_name:'Empresa de prueba',rtn:'08019999123456',office_name:'Tegucigalpa',address:'Oficina TGU',fiscal_address:'Domicilio fiscal prueba',phone:'22223333',email:'facturas@test.local'}
const base={id:'test',document_type:'Boleta de Compra',document_number:'002-001-11-00000001',issue_date:'2026-10-27',currency:'HNL',exchange_rate:1,subtotal:101,tax_amount:0,total:101,status:'Emitida',issuer_snapshot:issuer,supplier_snapshot:{name:'Proveedor de prueba',rtn:'0801199900000',phone:'99998888',email:'',address:'Domicilio proveedor'},fiscal_snapshot:{cai:'CAI-BOLETA-TEST',rango_desde:'002-001-11-00000001',rango_hasta:'002-001-11-00000100',fecha_limite_emision:'2026-12-31',point_of_sale:'TGU'},items:[{description:'Aseo jardín',quantity:1,unit_price:101,amount:101,tax_rate:0,tax:0,tax_credit:false}]}
async function render(data){let layout;const blob=await renderer.pdf(React.cloneElement(PurchaseFiscalPdf({data}),{onRender:r=>{layout=r._INTERNAL__LAYOUT__DATA_}})).toBlob();assert.ok(blob.size>1000);const collect=n=>[...(n.type==='TEXT'?(n.lines||[]).map(l=>l.string):[]),...(n.children||[]).flatMap(collect)];return {text:collect(layout).join('\n'),layout}}
test('boleta PDF incluye emisor histórico, identidad, domicilio, total literal, CAI y firma/huella',async()=>{
 const {text}=await render(base)
 for(const value of ['Tegucigalpa','22223333','facturas@test.local','Domicilio proveedor','RTN / Identidad','CAI-BOLETA-TEST','CIENTO UN CON 00/100 LEMPIRAS','FIRMA DEL PROVEEDOR','HUELLA DIGITAL'])assert.ok(text.replace(/\s+/g,' ').includes(value),value)
 assert.match(text,/27\/10\/2026/)
})
test('retención multipágina conserva cada concepto, respaldo fiscal y total una vez',async()=>{
 const {text,layout}=await render({...base,document_type:undefined,document_number:'002-001-05-00000001',total:40,items:Array.from({length:40},(_,i)=>({description:`TRIBUTO-${i} `+'Concepto '.repeat(15),base:100,rate:1,amount:1})),source_document_snapshot:{number:'FACT-PROVEEDOR-TEST',issue_date:'2026-10-26',cai:'CAI-ORIGEN-TEST'}})
 assert.ok(layout.children.length>1)
 for(let i=0;i<40;i++)assert.ok(text.includes(`TRIBUTO-${i} `))
 assert.match(text,/CAI-ORIGEN-TEST/);assert.match(text,/FACT-PROVEEDOR-TEST/);assert.equal(text.match(/TOTAL RETENIDO/g).length,1)
 assert.match(text,/Página 1 de/)
})
test('importe literal redondea antes de separar centavos y resuelve centenas/millones',()=>{
 assert.equal(amountInWords(101),'CIENTO UN CON 00/100')
 assert.equal(amountInWords(1.999),'DOS CON 00/100')
 assert.equal(amountInWords(0.5),'CERO CON 50/100')
 assert.equal(amountInWords(1000000000),'MIL MILLONES CON 00/100')
 assert.equal(amountInWords(Infinity),'IMPORTE FUERA DE RANGO')
})
