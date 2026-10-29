import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'
const {workspaceBreadcrumbs}=loadTs('src/lib/workspace-breadcrumbs.ts')
const {filterInvoiceList}=loadTs('src/lib/invoice-list-filters.ts')
const {filterFinanceDocuments,financeDocumentReport,financeMovementReport}=loadTs('src/lib/finance-report.ts')
const {multiAccountLedger}=loadTs('src/lib/multi-account-ledger.ts')
const operations=loadTs('src/lib/client-operations-report.ts',{'@/src/lib/supabase/client':{supabase:{}}})
const {treasuryReport}=loadTs('src/lib/treasury-report.ts')
test('breadcrumbs usan ancestros existentes, ocultan UUID y no convierten filtros en niveles',()=>{
 const route=workspaceBreadcrumbs('/operations/shipping-instructions/uuid/bookings/bid/bl/blid?status=Pagada')
 assert.deepEqual(route.map(c=>c.label),['Inicio','Operaciones','Instrucciones de embarque','Instrucción de embarque','Booking','Conocimiento de embarque'])
 assert.equal(route[4].href,'/operations/shipping-instructions/uuid/bookings/bid');assert.equal(route.at(-1).href,undefined)
 const accounts=workspaceBreadcrumbs('/accounting/books');assert.equal(accounts[1].href,undefined)
 assert.deepEqual(workspaceBreadcrumbs('/platform/users'),[]);assert.deepEqual(workspaceBreadcrumbs('/unknown/path'),[])
 assert.equal(workspaceBreadcrumbs('/clientes/nuevo').at(-1).label,'Nuevo cliente')
})
test('facturación combina tipos, estados y oficinas como conjuntos sin multiplicar filas',()=>{
 const rows=[{id:'a',invoice_type:'Factura',status:'Aprobada',point_of_sale:'SPS',cliente_nombre:'José',invoice_number:'F-1',cliente_rtn:'001'},
 {id:'b',invoice_type:'Nota de Débito',status:'Aprobada',point_of_sale:'TGU',cliente_nombre:'José',invoice_number:'D-1',cliente_rtn:'001'},
 {id:'c',invoice_type:'Factura',status:'Pagada',point_of_sale:'SPS',cliente_nombre:'Otro',invoice_number:'F-2',cliente_rtn:'002'}]
 assert.deepEqual(filterInvoiceList(rows,{types:['Factura','Nota de Débito'],statuses:['Aprobada'],offices:['SPS','TGU'],search:' JOSE '}).map(r=>r.id),['a','b'])
 assert.deepEqual(filterInvoiceList(rows,{types:[],statuses:[],offices:['TGU'],search:'001'}).map(r=>r.id),['b'])
})
test('listado real de facturas aplica oficina a filas y saldos visibles sin mezclar monedas',async()=>{
 const previous=globalThis.window;globalThis.window={setTimeout,clearTimeout,location:{search:'?view=documents'},history:{replaceState(){}}}
 const invoices=[{id:'i1',invoice_number:'SPS-FACTURA',invoice_type:'Factura',point_of_sale:'SPS',status:'Aprobada',cliente_id:'A',cliente_nombre:'Cliente A',cliente_rtn:'001',currency:'HNL',total:100,issue_date:'2026-10-01'},
 {id:'i2',invoice_number:'TGU-FACTURA',invoice_type:'Factura',point_of_sale:'TGU',status:'Aprobada',cliente_id:'B',cliente_nombre:'Cliente B',cliente_rtn:'002',currency:'USD',total:20,issue_date:'2026-10-01'}]
 const balances=invoices.map(i=>({invoice_id:i.id,currency:i.currency,original_total:i.total,credit_notes:0,debit_notes:0,adjusted_total:i.total,balance:i.total,paid_total:0,stored_status:'Aprobada',receivable_status:'Pendiente',days_overdue:0}))
 function query(table){const q={select:()=>q,is:()=>q,order:()=>q,in:()=>q,range:async(a,b)=>({data:(table==='invoices'?invoices:table==='invoice_receivables'?balances:[]).slice(a,b+1),error:null})};return q}
 const api={from:query,rpc:()=>query('empty')}
 const app=mountPage('src/app/(protected)/invoicing/page.tsx',{'@/src/lib/supabase/client':{supabase:api},'../../../lib/supabase/client':{supabase:api},'@/src/components/ui/MultiSelect':{MultiSelect:'MultiSelect'}})
 try{await app.ready();await app.tick();app.render();assert.match(app.text(),/SPS-FACTURA/);assert.match(app.text(),/TGU-FACTURA/)
  app.find(n=>n.type==='MultiSelect'&&n.props['aria-label']==='Oficinas').props.onValueChange(['TGU']);app.render()
  assert.doesNotMatch(app.text(),/SPS-FACTURA/);assert.match(app.text(),/TGU-FACTURA/)
  // The shallow harness retains closed-modal children; the last card belongs to the visible list.
  const card=app.findAll(n=>n.type==='div'&&Array.isArray(n.props.children)&&n.props.children[0]?.type==='p'&&app.text(n.props.children[0])==='Por cobrar').at(-1)
  assert.match(app.text(card),/USD 20\.00/);assert.doesNotMatch(app.text(card),/HNL/)
 }finally{app.cleanup();globalThis.window=previous}
})
const document=(id,party_id,currency,balance,days_overdue=0,document_type='Factura')=>({id,root_id:id,party_id,party_name:party_id,currency,document_type,document_number:id,created_on:'2026-10-01',issue_date:'2026-10-01',due_date:'2026-10-20',original_amount:balance||20,credit_adjustment:0,paid_amount:balance?0:20,withholding_amount:0,balance,days_overdue,status:balance?'Pendiente':'Pagada',reconstructed:false,needs_review:false})
const filters={party:'',parties:['A','B'],partyNames:['Cliente A','Cliente B'],currency:'Todos',status:'Todos',statuses:['Pendientes','Vencidos'],cutoff:'2026-10-29',from:'',to:'',dateField:'issue_date',includeDebit:true}
test('pendientes y vencidos hacen unión; filas y totales exportados conservan clientes, tipos y moneda',()=>{
 const docs=[document('a','A','HNL',100),document('b','B','USD',20,10,'Nota de Débito'),document('c','C','HNL',500),document('d','A','HNL',0)]
 assert.deepEqual(filterFinanceDocuments(docs,filters).map(d=>d.id),['a','b'])
 const report=financeDocumentReport(docs,filters,'receivable');assert.equal(report.rows.length,2);assert.equal(report.metrics.length,2)
 assert.match(report.metrics.find(m=>m.label==='Saldo HNL').value,/100/);assert.match(report.metrics.find(m=>m.label==='Saldo USD').value,/20/)
 assert.deepEqual(financeDocumentReport(docs,{...filters,documentTypes:['Nota de Débito']},'receivable').rows.map(r=>r.document),['b'])
 assert.equal(filterFinanceDocuments(docs,{...filters,statuses:['Pagados']}).length,1)
})
test('filtrar tipos de movimiento conserva apertura y saldo completo de los terceros seleccionados',()=>{
 const row=(id,kind,debit,credit,party_id='A')=>({id,party_id,party_name:party_id,currency:'HNL',movement_date:'2026-10-10',kind,reference:id,description:kind,debit,credit,reconstructed:false})
 const report=financeMovementReport([row('1','Factura',100,0),row('2','Nota de Crédito',0,20),row('3','Recibo',0,10),row('4','Factura',1000,0,'C')],filters,'receivable',['Nota de Crédito'])
 assert.equal(report.rows.length,1);assert.equal(report.rows[0].balance,80);assert.match(report.metrics.find(m=>m.label==='Saldo HNL').value,/70/)
 assert.ok(report.filters.some(f=>f.includes('solo ocultan detalle')))
})
test('mayor múltiple separa apertura, movimientos y saldo por cuenta y elimina selecciones repetidas',()=>{
 const line=(id,account_id,date,debit,credit)=>({id,account_id,account_code:account_id,account_name:account_id,kind:'Activo',entry_id:id,entry_number:Number(id),entry_date:date,entry_description:'Prueba',description:'Prueba',source_type:'Diario',debit,credit})
 const a={id:'A',code:'1',name:'Banco A'},b={id:'B',code:'2',name:'Banco B'}
 const report=multiAccountLedger([line('1','A','2026-09-30',100,0),line('2','B','2026-09-30',0,10),line('3','A','2026-10-01',20,0),line('4','B','2026-10-01',0,2)],'2026-10-01','2026-10-31',[a,a,b])
 assert.deepEqual(report.rows.map(r=>r.balance),[100,120,-10,-12]);assert.equal(report.metrics.length,8)
 assert.throws(()=>multiAccountLedger([],'2026-10-01','2026-10-31',[]),/al menos una cuenta/)
})
test('operaciones consolidadas mantienen clientes identificados y allowlist comercial, con exportación interna',()=>{
 const rows=[{id:'1',clientId:'A',clientName:'Cliente A',phase:'active',modality:'FCL',status:'En Tránsito',quotation:'Q1',operation:'OP1',origin:'Origen',consignee:'Consignatario',cost:999},
 {id:'2',clientId:'B',clientName:'Cliente B',phase:'approved',modality:'LCL',status:'Aprobada',quotation:'Q2',operation:'Por crear',origin:'Origen',consignee:'Consignatario'}]
 const filtered=operations.filterClientOperations(rows,['active','approved'],['FCL','LCL'],[]);assert.equal(filtered.length,2)
 const clients=[{id:'A',nombre:'Cliente A'},{id:'B',nombre:'Cliente B'}]
 const report=operations.clientOperationsReport(clients[0],filtered,[],[],'2026-10-29T12:00:00Z',clients)
 assert.equal(report.audience,undefined);assert.deepEqual(report.rows.map(r=>r.client),['Cliente A','Cliente B']);assert.equal(report.rows[0].cost,undefined);assert.equal(report.rows[0].clientId,undefined)
 assert.equal(operations.filterClientOperations(rows,[],[],['En Tránsito']).length,1)
})
test('flujo bancario mantiene cuentas y monedas separadas y sigue excluyendo transferencias propias',()=>{
 const movement=(id,account_id,currency,amount,category='Operación')=>({id,account_id,account_name:account_id,currency,occurred_on:'2026-10-01',value_on:'2026-10-01',amount,exchange_rate:1,buy_rate:null,sell_rate:null,reference:id,description:'Prueba',method:'Transferencia',category,source_kind:'Manual',source_id:null,reverse_of:null,entry_id:'entry',entry_date:'2026-10-01',entry_number:1})
 const report=treasuryReport([{id:'A',name:'Banco A'},{id:'B',name:'Banco B'}],[movement('1','A','HNL',100),movement('2','B','HNL',20),movement('3','B','USD',5),movement('4','A','HNL',999,'Transferencia')],'2026-10-01','2026-10-31','flow')
 assert.equal(report.rows.length,3);assert.deepEqual(report.rows.map(r=>r.account),['A','B','B']);assert.equal(report.rows.reduce((n,r)=>n+Number(r.in),0),125)
})
