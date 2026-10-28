import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const {groupedFinancialReport,financialCsv,financialExcelRows}=loadTs('src/lib/financial-export.ts')
const {createStyledXlsx}=loadTs('src/lib/xlsx.ts')
const {readBankTable}=loadTs('src/lib/server/bank-import.ts')
const data={title:'Cartera',subtitle:'General',dateRange:'Corte de prueba',filters:[],metrics:[{label:'Saldo HNL',value:'HNL 40.00'}],columns:[{key:'party',label:'Cliente'},{key:'currency',label:'Moneda'},{key:'balance',label:'Por pagar',format:'money'}],rows:[{__party_id:'a',party:'Mismo nombre',currency:'HNL',balance:10},{__party_id:'b',party:'Mismo nombre',currency:'HNL',balance:30},{__party_id:'a',party:'Mismo nombre',currency:'USD',balance:5}]}
test('bloques usan identidad y moneda, una hoja, subtotales y totales sin duplicar saldos',()=>{
 const report=groupedFinancialReport(data)
 assert.equal(report.rows.filter(r=>r.__rowType==='group').length,3)
 assert.deepEqual(report.rows.filter(r=>r.__rowType==='total').map(r=>[r.currency,r.balance]),[['HNL',40],['USD',5]])
 const bytes=createStyledXlsx(financialExcelRows(report,{legal_name:'Empresa ficticia'}),'Cartera','#B3282D')
 const xml=Buffer.from(bytes).toString('utf8');assert.match(xml,/FFB3282D/);assert.match(xml,/numFmtId="164"/);assert.match(xml,/state="frozen"/)
 assert.equal((xml.match(/<sheet name=/g)||[]).length,1)
 assert.match(xml,/_xlnm.Print_Titles/);assert.doesNotMatch(xml,/<autoFilter/)
 const sheets=readBankTable(Buffer.from(bytes),'xlsx');assert.equal(sheets.length,1);assert.ok(sheets[0].rows.some(r=>r.includes('TOTAL GENERAL')))
 assert.match(Buffer.from(createStyledXlsx(financialExcelRows(data,{}))).toString('utf8'),/<autoFilter ref=/)
})
test('CSV incluye corte, métricas y firmas y neutraliza fórmulas de texto',()=>{
 const csv=financialCsv({...data,rows:[{party:'=HYPERLINK("x")',currency:'HNL',balance:10}],signatures:[{label:'Elaborado',name:'Nombre ficticio',role:'Contador'}]})
 assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/Corte de prueba/);assert.match(csv,/Saldo HNL/);assert.match(csv,/Nombre ficticio/);assert.match(csv,/'=HYPERLINK/)
})
test('exportación conserva más de 500 documentos y números como números',()=>{
 const report=groupedFinancialReport({...data,rows:Array.from({length:650},(_,i)=>({__party_id:'a',party:'Cliente',currency:'HNL',balance:i+0.25}))})
 assert.equal(report.rows.filter(r=>!r.__rowType).length,650)
 const sheets=readBankTable(Buffer.from(createStyledXlsx(financialExcelRows(report,{}))),'xlsx')
 assert.ok(sheets[0].rows.some(r=>r.includes('649.25')))
})
