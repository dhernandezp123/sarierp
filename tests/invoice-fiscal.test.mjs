import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {calculateInvoiceFiscal,convertMoney}=loadTs('src/lib/invoice-fiscal.ts')
const {invoiceLineAmounts}=loadTs('src/lib/invoice-fiscal.ts')

test('descuento de línea reduce base e ISV y se convierte junto al precio',()=>{
  const source=invoiceLineAmounts(2,100,10)
  assert.deepEqual(source,{unitPrice:100,gross:200,discount:10,net:190})
  assert.equal(calculateInvoiceFiscal([{amount:source.net,isv_rate:15}],'Gravada').total,218.5)
  assert.deepEqual(invoiceLineAmounts(2,100,10,{currency:'HNL',rate:25,operation:'multiply'}),{unitPrice:2500,gross:5000,discount:250,net:4750})
  assert.deepEqual(invoiceLineAmounts(2,100,10,{currency:'USD',rate:25,operation:'divide'}),{unitPrice:4,gross:8,discount:0.4,net:7.6})
  for(const discount of [-1,200.01,1.001,NaN,Infinity])assert.throws(()=>invoiceLineAmounts(2,100,discount),/descuento/i)
})

test('exoneración elimina el ISV sin perder la base ni confundir exento',()=>{
  const lines=[{amount:100,isv_rate:15},{amount:50,isv_rate:18}]
  assert.deepEqual(calculateInvoiceFiscal(lines,'Exonerada'),{exempt:0,exonerated:150,taxable15:0,taxable18:0,tax15:0,tax18:0,subtotal:150,tax:0,total:150,classification:'Exonerada'})
  assert.equal(lines[0].isv_rate,15)
})
test('mixta conserva por separado gravado, exento y exonerado',()=>{
  const result=calculateInvoiceFiscal([{amount:100,isv_rate:15},{amount:50,isv_rate:0},{amount:30,isv_rate:0,tax_treatment:'Exonerada'}],'Mixta')
  assert.equal(result.total,195); assert.equal(result.exempt,50);assert.equal(result.exonerated,30);assert.equal(result.classification,'Mixta')
})
test('multiplicar y dividir no cambian el origen y rechazan tasa cero',()=>{
  assert.equal(convertMoney(100,{currency:'HNL',rate:25,operation:'multiply'}),2500)
  assert.equal(convertMoney(2500,{currency:'USD',rate:25,operation:'divide'}),100)
  assert.throws(()=>convertMoney(100,{currency:'USD',rate:0,operation:'divide'}))
  assert.throws(()=>convertMoney(100,{currency:'USD',rate:Infinity,operation:'multiply'}))
})
