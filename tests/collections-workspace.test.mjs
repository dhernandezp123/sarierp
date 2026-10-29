import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

const clients = [{ id: 'a', nombre: 'Cliente Horizonte', codigo_cliente: 'RT0039', rtn: '00000000000001' }, { id: 'b', nombre: 'Cliente Norte', codigo_cliente: 'RT0040', rtn: '00000000000002' }]
const debt = { id: 'doc-a', root_id: 'doc-a', cliente_id: 'a', currency: 'HNL', invoice_type: 'Factura', invoice_number: 'TEST-001', issue_date: '2026-10-01', due_date: '2026-10-10', payment_condition: 'Credito', credit_days: 9, days_elapsed: 26, days_overdue: 17, balance: 100, status: 'Aprobada' }
const receipt = { id: 'advance', cliente_id: 'a', currency: 'HNL', receipt_number: 'RC-ADV', amount: 40, applied_amount: 0, unapplied_amount: 40, payment_date: '2026-10-01', payment_method: 'Transferencia', reference: 'TEST', notes: '', status: 'Aplicado' }
function fixture({ failClients = false } = {}) {
  let clientFailure = failClients
  const debts = [{ ...debt }], receipts = [{ ...receipt }], writes = [], selections = []
  const client = { from(table) { let filters = [], selection = ''; const q = { select: value => { selection = value; selections.push([table, value]); return q }, order: () => q, eq: (...args) => { filters.push(args); return q }, gt: () => q, lte: () => q,
    range: async from => {
      if (table === 'clientes' && clientFailure) return { data: null, error: { message: 'Offline' } }
      const rows = table === 'clientes' ? clients : table === 'customer_document_balances' ? debts : table === 'customer_receipt_balances' ? receipts : []
      assert.ok(selection); return { data: rows.filter(row => filters.every(([key, value]) => row[key] === value)).slice(from, from + 1), error: null }
    } }; return q }, async rpc(name, args) { writes.push([name, args]); if (name === 'register_customer_receipt') {
    const applied = args.p_allocations.reduce((sum, a) => sum + a.amount, 0)
    receipts.push({ ...receipt, id: 'saved', receipt_number: 'RC-NEW', amount: args.p_amount, applied_amount: applied, unapplied_amount: args.p_amount - applied })
    for (const row of args.p_allocations) debts.find(d => d.id === row.document_id).balance -= row.amount
  } return { data: 'saved', error: null } } }
  const app = mountPage('src/app/(protected)/invoicing/collections/page.tsx', {
    '@/src/lib/supabase/client': { supabase: client },
    '@/src/components/ui/ClienteCombobox': { ClienteCombobox: 'ClienteCombobox' },
    '@/src/components/invoicing/FinancialReportExport': { downloadFinancialReport: async () => {} },
  })
  const ready = async () => { await app.ready(); await app.tick(); app.render() }
  const choose = async id => { app.find(n => n.type === 'ClienteCombobox').props.onChange(id); app.render(); await app.tick(); app.render() }
  const input = (id, value) => { app.find(n => n.props?.id === id).props.onChange({ target: { value } }); app.render() }
  return { app, client, writes, selections, ready, choose, input, recover() { clientFailure = false } }
}

test('Cobranza carga código/RTN en todas las páginas y muestra saldos solo para cliente y moneda actuales', async () => {
  const f = fixture()
  try {
    await f.ready(); const combo = f.app.find(n => n.type === 'ClienteCombobox')
    assert.equal(combo.props.clientes.length, 2); assert.equal(combo.props.clientes[0].codigo_cliente, 'RT0039')
    assert.ok(f.selections.some(([table, select]) => table === 'clientes' && select.includes('codigo_cliente,rtn')))
    assert.equal(f.app.find(n => n.props?.label === 'Saldo pendiente'), undefined)
    await f.choose('a'); assert.equal(f.app.find(n => n.props?.label === 'Saldo pendiente').props.value, 'HNL 100.00')
    assert.equal(f.app.find(n => n.props?.label === 'Anticipos disponibles').props.value, 'HNL 40.00')
    f.input('collections-currency', 'USD'); assert.equal(f.app.find(n => n.props?.label === 'Saldo pendiente').props.value, '—')
    await f.app.tick(); f.app.render(); assert.equal(f.app.find(n => n.props?.label === 'Saldo pendiente').props.value, 'USD 0.00')
  } finally { f.app.cleanup() }
})

test('pantalla real guarda una aplicación parcial y deja claro el remanente; doble envío no duplica el cobro', async () => {
  const f = fixture()
  try {
    await f.ready(); await f.choose('a')
    f.app.find(n => n.props?.['aria-label'] === 'Aplicar a TEST-001').props.onChange({ target: { checked: true } }); f.app.render()
    f.app.find(n => n.props?.['aria-label'] === 'Importe para TEST-001').props.onChange({ target: { value: '25' } }); f.app.render()
    f.input('receipt-amount', '75'); f.input('receipt-reference', 'BANK-TEST')
    assert.match(f.app.text(), /Remanente disponible/); assert.match(f.app.text(), /HNL 50\.00/)
    const save = f.app.find(n => n.type === 'form').props.onSubmit
    save({ preventDefault() {} }); save({ preventDefault() {} }); await f.app.tick(); f.app.render()
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0][0], 'register_customer_receipt')
    assert.deepEqual(f.writes[0][1].p_allocations, [{ document_id: 'doc-a', amount: 25 }]); assert.equal(f.writes[0][1].p_amount, 75)
    assert.equal(f.app.find(n => n.props?.label === 'Saldo pendiente').props.value, 'HNL 75.00')
    assert.equal(f.app.find(n => n.props?.label === 'Anticipos disponibles').props.value, 'HNL 90.00')
  } finally { f.app.cleanup() }
})

test('aplicar un anticipo utiliza el recibo existente y bloquea importes superiores al disponible', async () => {
  const f = fixture()
  try {
    await f.ready(); await f.choose('a'); f.app.button('Aplicar anticipo').props.onClick(); f.app.render()
    f.app.find(n => n.props?.['aria-label'] === 'Aplicar a TEST-001').props.onChange({ target: { checked: true } }); f.app.render()
    assert.equal(f.app.find(n => n.type === 'button' && n.props.disabled && f.app.text(n) === 'Aplicar anticipo').props.disabled, true)
    f.app.find(n => n.props?.['aria-label'] === 'Importe para TEST-001').props.onChange({ target: { value: '20' } }); f.app.render()
    f.app.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await f.app.tick(); f.app.render()
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0][0], 'allocate_customer_receipt'); assert.equal(f.writes[0][1].p_receipt_id, 'advance')
  } finally { f.app.cleanup() }
})

test('un fallo del directorio se puede recuperar desde la pantalla sin mostrar una lista parcial', async () => {
  const f = fixture({ failClients: true })
  try {
    await f.ready(); assert.match(f.app.text(), /No se pudieron cargar los clientes/)
    assert.equal(f.app.find(n => n.type === 'ClienteCombobox').props.clientes.length, 0)
    f.recover(); f.app.button('Reintentar clientes').props.onClick(); f.app.render(); await f.app.tick(); f.app.render()
    assert.equal(f.app.find(n => n.type === 'ClienteCombobox').props.clientes.length, 2)
  } finally { f.app.cleanup() }
})


test('Estado histórico comparte exportación, cliente buscable y filtro de NC sin cambiar el saldo completo', async()=>{
 const events=[{id:'1',kind:'Factura',debit:100,credit:0,movement_date:'2026-10-01'},{id:'2',kind:'Nota de Crédito',debit:0,credit:20,movement_date:'2026-10-02'},{id:'3',kind:'Pago',debit:0,credit:30,movement_date:'2026-10-03'}].map(e=>({...e,party_id:'a',party_name:'Cliente Horizonte',currency:'HNL',reference:e.id,description:'Movimiento ficticio',reconstructed:false}))
 const client={from(table){const q={select:()=>q,order:()=>q,returns:()=>q,maybeSingle:async()=>({data:{starts_on:'2026-01-01',has_legacy:false},error:null}),range:async(from,to)=>({data:(table==='clientes'?clients:[]).slice(from,to+1),error:null})};return q},rpc(name){return{range:async(from,to)=>({data:(name==='finance_movements_at'?events:[]).slice(from,to+1),error:null})}}}
 const app=mountPage('src/app/(protected)/invoicing/statements/page.tsx',{'@/src/lib/supabase/client':{supabase:client},'@/src/components/ui/MultiSelect':{MultiSelect:'MultiSelect'},'@/src/components/invoicing/FinancialReportExport':{FinancialReportExport:'Export'}},{props:{side:'receivable',initialView:'movements'},unwrap:element=>element.type})
 try{
  await app.ready();await app.tick();app.render()
  app.find(n=>n.props?.id==='finance-party').props.onValueChange(['a']);app.render()
  assert.ok(app.find(n=>n.type==='Export'),app.text())
  const full=app.find(n=>n.type==='Export').props.data
  assert.equal(full.rows.length,3);assert.equal(full.metrics.find(m=>m.label.includes('Saldo HNL')).value,'HNL 50.00')
  app.find(n=>n.props?.['aria-label']==='Tipos de movimiento').props.onValueChange(['Nota de Crédito']);app.render()
  const filtered=app.find(n=>n.type==='Export').props.data
  assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0].kind,'Nota de Crédito');assert.equal(filtered.metrics.find(m=>m.label.includes('Saldo HNL')).value,'HNL 50.00')
 }finally{app.cleanup()}
})
