import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {expenseMonthBounds,monthlyExpenses}=loadTs('src/lib/monthly-expenses.ts')
const line=(id,date,debit,credit=0,kind='Gasto',provider='Proveedor A')=>({id,account_id:id,account_code:id,account_name:id,kind,debit,credit,provider,entry:{entry_date:date,entry_number:1}})
test('mes contable usa calendario y cruza diciembre sin desfases horarios',()=>{
 assert.deepEqual(expenseMonthBounds('2028-02'),{from:'2028-02-01',to:'2028-02-29',previousFrom:'2028-01-01',previous:'2028-01'})
 assert.equal(expenseMonthBounds('2026-01').previous,'2025-12')
 for(const m of ['2026-13','2026-2','','0000-01'])assert.throws(()=>expenseMonthBounds(m))
})
test('ranking netea reversos, compara cuentas sin movimiento actual y separa costo/activo',()=>{
 const rows=[line('a','2026-11-01',100),line('a','2026-11-03',0,25),line('a','2026-10-02',50),line('b','2026-10-03',30),line('cost','2026-11-04',200,0,'Costo'),line('bank','2026-11-04',500,0,'Activo')]
 const report=monthlyExpenses(rows,'2026-11','Gasto')
 assert.equal(report.current,75);assert.equal(report.previous,80)
 assert.deepEqual(report.ranking.map(r=>[r.id,r.current,r.previous]),[['a',75,50],['b',0,30]])
 assert.equal(report.detail.length,2)
 assert.equal(monthlyExpenses(rows,'2026-11','Costo').current,200)
 assert.equal(monthlyExpenses(rows,'2026-11','Gasto','provider').ranking.length,1)
 assert.throws(()=>monthlyExpenses([line('x','2026-11-04',NaN)],'2026-11','Gasto'))
 assert.equal(monthlyExpenses([{...line('x','2026-11-04',10),provider_key:'supplier-a'},{...line('y','2026-11-04',20),provider_key:'supplier-b'}],'2026-11','Gasto','provider').ranking.length,2,'No fusiona proveedores distintos con el mismo nombre')
})
