import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {applyPurchaseAccountDefault,supplierExpenseAccounts}=loadTs('src/lib/supplier-accounting.ts')
test('cambiar cuenta general respeta overrides manuales y servicios, incluso vacios explicitos',()=>{
 const lines=[{account_id:'A',account_source:'default'},{account_id:'B',account_source:'manual'},{account_id:'',account_source:'service'},{account_id:'',account_source:'manual'}]
 assert.deepEqual(applyPurchaseAccountDefault(lines,'C').map(x=>x.account_id),['C','B','',''])
 assert.deepEqual(applyPurchaseAccountDefault(lines,'').map(x=>x.account_id),['','B','',''])
 assert.equal(lines[0].account_id,'A')
})
test('predeterminadas solo incluyen auxiliares activas de costo o gasto',()=>{
 const base={id:'A',code:'A',name:'A',kind:'Gasto',active:true,postable:true,account_level:'Auxiliar'}
 const rows=[base,{...base,id:'B',kind:'Costo'},{...base,id:'C',kind:'Activo'},{...base,id:'D',active:false},{...base,id:'E',postable:false},{...base,id:'F',account_level:'SubCuenta'}]
 assert.deepEqual(supplierExpenseAccounts(rows).map(x=>x.id),['A','B'])
})
