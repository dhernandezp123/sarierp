import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {agingBucket,financeAging,filterFinanceDocuments,financeStatement,financeDocumentReport}=loadTs('src/lib/finance-report.ts')
const base={id:'i',root_id:'i',party_id:'c',party_name:'Cliente',currency:'HNL',document_type:'Factura',document_number:'F-1',created_on:'2026-10-01',issue_date:'2026-10-01',due_date:'2026-10-30',original_amount:1000,credit_adjustment:200,paid_amount:300,withholding_amount:0,balance:500,days_overdue:0,status:'Pendiente',reconstructed:false,needs_review:false}
const filters={party:'',currency:'Todos',status:'Todos',cutoff:'2026-10-28',from:'',to:'',dateField:'issue_date',includeDebit:true}
test('mora usa límites exactos y Actual es cero días desde vencimiento',()=>{
 assert.deepEqual([0,1,30,31,60,61,90,91].map(agingBucket),['current','d30','d30','d60','d60','d90','d90','older'])
 const rows=[0,1,30,31,60,61,90,91].map((days,i)=>({...base,id:String(i),issue_date:'2026-01-01',days_overdue:days,balance:10}))
 const [r]=financeAging(rows);assert.deepEqual([r.current,r.d30,r.d60,r.d90,r.older,r.total],[10,20,20,20,10,80])
})
test('pagadas llegan al filtro, pendientes incluyen parciales y vencidos y no se mezclan monedas',()=>{
 const rows=[base,{...base,id:'paid',balance:0,status:'Pagada'},{...base,id:'overdue',days_overdue:10},{...base,id:'usd',currency:'USD'}]
 assert.deepEqual(filterFinanceDocuments(rows,{...filters,status:'Pagados'}).map(r=>r.id),['paid'])
 assert.equal(filterFinanceDocuments(rows,{...filters,status:'Pendientes'}).length,3)
 assert.deepEqual(filterFinanceDocuments(rows,{...filters,status:'Vencidos'}).map(r=>r.id),['overdue'])
 assert.equal(financeAging(rows).length,2)
 assert.equal(financeAging([{...base,due_date:null}])[0].unclassified,500)
})
test('fecha opcional acota documentos, ND no se duplican y exporta NC separada de efectivo',()=>{
 const rows=[base,{...base,id:'nd',document_type:'Nota de Débito',original_amount:50,credit_adjustment:0,paid_amount:0,balance:50}]
 assert.equal(filterFinanceDocuments(rows,{...filters,includeDebit:false}).length,1)
 assert.equal(filterFinanceDocuments(rows,{...filters,dateField:'due_date',from:'2026-10-31'}).length,0)
 const report=financeDocumentReport(rows,filters,'receivable')
 assert.deepEqual([report.rows[0].original,report.rows[0].credit,report.rows[0].paid,report.rows[0].balance],[1000,200,300,500])
 assert.throws(()=>financeDocumentReport(rows,{...filters,cutoff:'2026-02-30'},'receivable'),/fechas/)
})
test('estado conserva apertura, saldo corrido por tercero/moneda y filtro de detalle no altera saldo',()=>{
 const m=(id,date,debit,credit,currency='HNL')=>({id,party_id:'c',party_name:'Cliente',currency,movement_date:date,kind:debit?'Factura':'Pago',reference:id,description:'',debit,credit,reconstructed:false})
 const data=[m('1','2026-09-01',1000,0),m('2','2026-10-01',0,300),m('3','2026-11-01',0,200),m('4','2026-10-01',50,0,'USD')]
 const r=financeStatement(data,'2026-10-01','2026-10-31',['Factura'])
 assert.deepEqual(r.groups.map(g=>[g.currency,g.opening,g.closing]),[['HNL',1000,700],['USD',0,50]])
 assert.equal(r.rows.length,1)
})
