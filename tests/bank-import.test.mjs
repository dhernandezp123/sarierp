import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {parseDelimitedTable,mapBankImport,suggestBankMatch}=loadTs('src/lib/bank-import.ts')
const {readBankTable}=loadTs('src/lib/server/bank-import.ts')
const {createXlsx}=loadTs('src/lib/xlsx.ts')
const mapping={date:0,reference:1,description:2,amount:3,debit:-1,credit:-1,dateOrder:'DMY',decimal:'.',skip:1,invert:false}
test('importación valida separadores, fechas, signo y vista previa sin ejecutar texto',()=>{
 const table=parseDelimitedTable('Fecha;Ref;Descripción;Monto\r\n28/10/2026;F-1;"Cobro; prueba";"1.000,25"\r\n27/10/2026;F-2;=HYPERLINK("texto");(20,50)')
 const rows=mapBankImport(table,{...mapping,decimal:','},'HNL');assert.deepEqual(rows.map(r=>r.amount),[1000.25,-20.5]);assert.equal(rows[0].date,'2026-10-28');assert.equal(rows[1].description,'=HYPERLINK("texto")')
 assert.throws(()=>mapBankImport([['h'],['31/02/2026','','','10']],mapping,'HNL'),/Fila 2: Fecha inválida/)
 assert.throws(()=>mapBankImport([['h'],['28/10/2026','','','1,00.25']],mapping,'HNL'),/Separadores/)
 assert.throws(()=>parseDelimitedTable('"Sin cerrar'),/comillas/)
})
test('débitos bancarios son salidas y créditos entradas; inversión explícita',()=>{
 const rows=[['h'],['2026-10-28','R','Desc','','100','0'],['2026-10-28','R2','Desc','','','250']]
 assert.deepEqual(mapBankImport(rows,{...mapping,amount:-1,debit:4,credit:5},'USD').map(r=>r.amount),[-100,250])
 assert.deepEqual(mapBankImport(rows,{...mapping,amount:-1,debit:4,credit:5,invert:true},'USD').map(r=>r.amount),[100,-250])
})
test('XLSX extrae tipos y fecha serial; no acepta paquetes inválidos ni más de 2000 filas',()=>{
 const bytes=Buffer.from(createXlsx([['Fecha','Ref','Descripción','Monto'],[46323,'R','=texto',10.75]]))
 const [{rows}]=readBankTable(bytes,'xlsx');const [line]=mapBankImport(rows,mapping,'USD');assert.equal(line.date,'2026-10-28');assert.equal(line.amount,10.75)
 assert.throws(()=>readBankTable(Buffer.from('No ZIP'),'xlsx'),/XLSX/)
 assert.throws(()=>mapBankImport(Array.from({length:2002},()=>['x']),mapping,'HNL'),/2000/)
})
test('sugerencias requieren una coincidencia única y nunca vinculan importes ambiguos',()=>{
 const a={id:'a',date:'2026-10-28',reference:'CHEQUE-1',remaining:-100},b={...a,id:'b'}
 assert.equal(suggestBankMatch([a],[b]).length,2)
 assert.deepEqual(suggestBankMatch([a],[b,{...b,id:'c'}]),[])
 assert.deepEqual(suggestBankMatch([a,{...a,id:'c'}],[b]),[])
 assert.deepEqual(suggestBankMatch([a],[{...b,remaining:100}]),[])
})
