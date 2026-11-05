import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {canAccessPath}=loadTs('src/lib/permissions.ts')
test('ruta de revisión no concede acceso a emitir facturas, clientes del portal ni contabilidad',()=>{
 for(const role of ['Ventas','Pricing','Operaciones']){
  assert.equal(canAccessPath(role,'/invoicing/courtesies'),true)
  assert.equal(canAccessPath(role,'/invoicing/new'),false)
  assert.equal(canAccessPath(role,'/invoicing/invoice-id'),false)
  assert.equal(canAccessPath(role,'/accounting/alerts'),false)
 }
 assert.equal(canAccessPath('Cliente','/invoicing/courtesies'),false)
})
