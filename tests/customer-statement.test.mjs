import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {customerStatement}=loadTs('src/lib/customer-statement.ts')
const movement=(id,date,kind,debit,credit,currency='HNL')=>({id,movement_date:date,created_at:date+'T12:00:00Z',kind,debit,credit,currency,reference:id,description:'',reconstructed:false})
test('estado histórico concilia NC, ND, pago, anticipo y reverso sin mezclar monedas',()=>{
  const rows=[movement('1','2026-09-01','Factura',100,0),movement('2','2026-10-01','Nota de Débito',40,0),movement('3','2026-10-02','Nota de Crédito',0,20),
    movement('4','2026-10-03','Pago',0,150),movement('5','2026-11-01','Reverso',150,0),movement('6','2026-10-01','Factura',500,0,'USD')]
  const s=customerStatement(rows,'2026-10-01','2026-10-31','HNL')
  assert.equal(s.opening,100);assert.equal(s.debit,40);assert.equal(s.credit,170);assert.equal(s.closing,-30)
  assert.deepEqual(s.rows.map(r=>r.balance),[140,120,-30])
  const filtered=customerStatement(rows,'2026-10-01','2026-10-31','HNL',['Nota de Crédito'])
  assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0].balance,120);assert.equal(filtered.closing,-30)
  assert.equal(customerStatement(rows,'2026-10-01','2026-11-01','HNL').closing,120)
})
