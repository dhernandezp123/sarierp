import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {courtesyExclusions,courtesyStatus,courtesyLineKey}=loadTs('src/lib/invoice-courtesies.ts')
const approved={line_key:'bl',draft_revision:3,status:'Aprobada',is_current:true,approval_effective:true}
test('solo se excluyen cortesias aprobadas vigentes de la revision guardada',()=>{
 assert.deepEqual([...courtesyExclusions([approved],3)],['bl'])
 for(const changed of [{status:'Pendiente'},{approval_effective:false},{is_current:false},{draft_revision:2}])assert.equal(courtesyExclusions([{...approved,...changed}],3).size,0)
 assert.equal(courtesyExclusions([approved],3,true).size,0)
 assert.equal(courtesyLineKey({id:'editor',source_pricing_item_id:'source'}),'source')
})
test('la auditoria aplicada se conserva al cambiar permisos o revision',()=>{
 assert.equal(courtesyStatus({...approved,status:'Aplicada',is_current:false,approval_effective:false}),'Aplicada')
 assert.equal(courtesyStatus({...approved,approval_effective:false}),'Requiere nueva autorización')
})
