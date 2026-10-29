import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {accountingBook}=loadTs('src/lib/accounting-books.ts')
const line=(id,date,account,kind,debit,credit)=>({id,entry_id:id,entry_number:Number(id),entry_date:date,account_id:account,account_code:account,account_name:account,kind,debit,credit,description:'',entry_description:'Movimiento de prueba',source_type:'Manual'})
const lines=[line('1','2026-09-01','Caja','Activo',100,0),line('2','2026-09-01','Capital','Patrimonio',0,100),line('3','2026-10-01','Caja','Activo',50,0),line('4','2026-10-01','Flete','Ingreso',0,50),line('5','2026-10-02','Jardín','Gasto',20,0),line('6','2026-10-02','Caja','Activo',0,20)]
test('mayor conserva saldo inicial y movimiento por cuenta sin sumar otras cuentas',()=>{
 const report=accountingBook(lines,'ledger','2026-10-01','2026-10-31','Caja')
 assert.equal(report.rows.length,2);assert.deepEqual(report.rows.map(r=>r.balance),[150,130]);assert.match(report.metrics[0].value,/100.00/)
 assert.throws(()=>accountingBook(lines,'ledger','2026-10-01','2026-10-31'),/Selecciona/)
})
test('diario, comprobación, balance y resultados concilian fechas y partida doble',()=>{
 const journal=accountingBook(lines,'journal','2026-10-01','2026-10-31');assert.equal(journal.rows.length,4);assert.match(journal.metrics[2].value,/0.00/)
 const trial=accountingBook(lines,'trial','2026-10-01','2026-10-31');assert.equal(trial.rows.find(r=>r.code==='Caja').closing,130)
 const income=accountingBook(lines,'income','2026-10-01','2026-10-31');assert.match(income.metrics.find(m=>m.label==='Resultado del período').value,/30.00/)
 const balance=accountingBook(lines,'balance','2026-10-01','2026-10-31');assert.match(balance.metrics[0].value,/130.00/);assert.match(balance.metrics[2].value,/130.00/);assert.match(balance.metrics[3].value,/0.00/)
})
test('costos reducen resultado y orden queda en diario/mayor/comprobación sin afectar estados financieros',()=>{
 const added=[...lines,line('7','2026-10-03','Flete comprado','Costo',10,0),line('8','2026-10-03','Caja','Activo',0,10),line('9','2026-10-04','Orden deudora','Orden',500,0),line('10','2026-10-04','Orden acreedora','Orden',0,500)]
 const income=accountingBook(added,'income','2026-10-01','2026-10-31');assert.match(income.metrics.find(m=>m.label==='Costos').value,/10.00/);assert.match(income.metrics.find(m=>m.label==='Resultado del período').value,/20.00/);assert.equal(income.rows.some(r=>r.kind==='Orden'),false)
 const balance=accountingBook(added,'balance','2026-10-01','2026-10-31');assert.equal(balance.rows.some(r=>['Orden','Resultado'].includes(r.kind)),false);assert.match(balance.metrics[0].value,/120.00/);assert.match(balance.metrics[3].value,/0.00/)
 assert.equal(accountingBook(added,'journal','2026-10-01','2026-10-31').rows.length,8)
 assert.ok(accountingBook(added,'trial','2026-10-01','2026-10-31').rows.some(r=>r.code==='Orden deudora'))
 assert.equal(accountingBook(added,'ledger','2026-10-01','2026-10-31','Orden deudora').rows[0].balance,500)
})
