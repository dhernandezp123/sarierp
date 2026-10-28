import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {treasuryReport,reconciliationReport}=loadTs('src/lib/treasury-report.ts')
const accounts=[{id:'a',name:'Banco A',currency:'HNL'},{id:'b',name:'Banco B',currency:'USD'}]
const row=(id,account_id,date,amount,category='Operación',extra={})=>({id,account_id,account_name:account_id,currency:account_id==='a'?'HNL':'USD',occurred_on:date,value_on:date,amount,category,exchange_rate:account_id==='a'?1:25,entry_id:'e',entry_date:date,entry_number:1,...extra})
test('acumulado lleva apertura al siguiente día y separa monedas; flujo excluye transferencias y apertura',()=>{
 const rows=[row('1','a','2026-09-30',1000,'Apertura'),row('2','a','2026-10-01',120),row('3','a','2026-10-02',-250,'Transferencia'),row('4','b','2026-10-02',10,'Transferencia'),row('5','a','2026-11-01',500)]
 const r=treasuryReport(accounts,rows,'2026-10-01','2026-10-28','daily');assert.deepEqual(r.rows.map(r=>[r.currency,r.opening,r.balance]),[['HNL',1000,1120],['HNL',1120,870],['USD',0,10]])
 assert.deepEqual(treasuryReport(accounts,rows,'2026-10-01','2026-10-28','flow').rows.map(r=>[r.currency,r.net]),[['HNL',120]])
 const pending=treasuryReport(accounts,[row('x','a','2026-10-01',20,'Operación',{entry_id:null,entry_date:null})],'2026-10-01','2026-10-28');assert.match(pending.filters.join(' '),/no certifica/)
})
test('conciliación exporta filas dinámicas, las dos firmas y diferencia sin ocultarla',()=>{
 const r=reconciliationReport({account:{...accounts[0],bank:'Banco ficticio',account_number:'FICTICIA',opening_rate:1},from:'2026-10-01',cutoff:'2026-10-28',opening:1000,debit:0,credit:100,book_closing:900,bank_closing:1005,initial_difference:-105,checks:100,deposits:0,other_out:0,reconciled_bank:905,difference:5,pending_postings:0,unmatched_statement:1,prepared_by:'Contador',reviewed_by:'Gerencia',items:Array.from({length:10},(_,i)=>({id:String(i),date:'2026-10-01',reference:String(i),description:'Cheque',method:'Cheque',amount:-10}))})
 assert.equal(r.rows.filter(r=>r.reference!==undefined).length,10);assert.equal(r.signatures.length,2);assert.match(r.metrics.at(-1).value,/5.00/)
})
