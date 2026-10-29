import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {parseAccountCsv,validateJournalLines,canParentAccount,canPostAccount,matchesAccountingPurpose}=loadTs('src/lib/accounting.ts')
test('catálogo CSV conserva códigos y acepta nombres entre comillas sin importar saldos',()=>{
 const rows=parseAccountCsv('\uFEFFcodigo,nombre,tipo,padre,movimiento\n001,"Activo, corriente",Activo,,No\n001.01,Bancos,Activo,001,Sí')
 assert.equal(rows[0].code,'001');assert.equal(rows[0].name,'Activo, corriente');assert.equal(rows[0].postable,false);assert.equal(rows[1].parent_code,'001');assert.equal(rows[1].postable,true)
 assert.throws(()=>parseAccountCsv('codigo,nombre,tipo,padre,movimiento\n1,Caja,Activo,,Sí\n1,Banco,Activo,,Sí'),/duplicado/)
 assert.throws(()=>parseAccountCsv('codigo,nombre,tipo,padre,movimiento,saldo\n1,Caja,Activo,,Sí,100'),/columnas/)
})
test('partida manual valida debe/haber con centavos, cuentas y valores finitos',()=>{
 assert.equal(validateJournalLines([{account_id:'1',debit:0.1,credit:0},{account_id:'1',debit:0.2,credit:0},{account_id:'2',debit:0,credit:0.3}]),null)
 assert.ok(validateJournalLines([{account_id:'1',debit:10,credit:0},{account_id:'2',debit:0,credit:9}]))
 assert.ok(validateJournalLines([{account_id:'1',debit:NaN,credit:0},{account_id:'2',debit:0,credit:10}]))
 assert.ok(validateJournalLines([{account_id:'1',debit:10,credit:10},{account_id:'2',debit:0,credit:0}]))
})
test('catálogo conserva niveles, ramas de resultado y cuentas de orden sin mezclar su naturaleza',()=>{
 const rows=parseAccountCsv('codigo;nombre;tipo;padre;movimiento;nivel\n4;Resultados;Resultado;;No;Tipo\n42;Costos;Costo;4;No;Grupo\n4210101;Costo ficticio;Costo;42;Sí;Auxiliar\n5;Orden;Orden;;No;Tipo')
 assert.equal(rows[2].account_level,'Auxiliar');assert.equal(rows[2].kind,'Costo');assert.equal(rows[2].postable,true)
 assert.equal(canParentAccount({kind:'Resultado',postable:false},'Ingreso'),true)
 assert.equal(canParentAccount({kind:'Resultado',postable:false},'Costo'),true)
 assert.equal(canParentAccount({kind:'Resultado',postable:false},'Orden'),false)
 assert.equal(canParentAccount({kind:'Activo',postable:false},'Pasivo'),false)
 assert.equal(canPostAccount('Resultado'),false);assert.equal(canPostAccount('Activo','Grupo'),false)
 assert.equal(matchesAccountingPurpose('purchases','Gasto','Costo'),true);assert.equal(matchesAccountingPurpose('exchange_loss','Gasto','Costo'),false)
 assert.throws(()=>parseAccountCsv('codigo,nombre,tipo,padre,movimiento,nivel\n4,Resultados,Resultado,,Sí,Tipo'),/agrupadora/)
 assert.throws(()=>parseAccountCsv('codigo,nombre,tipo,padre,movimiento,nivel\n1,Activos,Activo,,No,Desconocido'),/nivel/)
})
