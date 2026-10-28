import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const { draftEditorSignature, draftItemPayload, draftEditorFromInvoice } = loadTs('src/lib/invoice-drafts.ts')
const { blankFiscalOptions } = loadTs('src/components/invoicing/InvoiceFiscalOptions.tsx', { '@/src/hooks/useUser': { useUser: () => ({}) }, '@/src/lib/supabase/client': { supabase: {} } })
const clientRow = { id: 'client', nombre: 'Cliente ficticio', rtn: '00000000000000', condicion_pago: 'Contado', dias_credito: 0, billing_office: { name: 'SPS', is_active: true } }
function fixture({ query = '', saved = null, failSave = false, deferSave, master = false, officeAllowed = true } = {}) {
  const before = globalThis.window; globalThis.window = { setTimeout, clearTimeout }
  const writes = [], messages = [], routes = [], drafts = new Map(saved ? [[saved.id, saved]] : [])
  let current = { user: { id: 'finance' }, profile: { id: 'finance', tenant_id: 'tenant', rol: 'Contabilidad', status: 'Aprobado', is_active: true } }, fail = failSave, issued = false
  const router = { push: value => routes.push(value), replace: value => routes.push(value) }
  const api = { from(table) { const filters = [], q = { select: () => q, order: () => q, is: () => q, eq: (k,v) => { filters.push([k,v]); return q },
    then: resolve => Promise.resolve({ data: table === 'clientes' ? [clientRow] : [], error: null }).then(resolve),
    maybeSingle: async () => ({ data: table === 'cai_ranges' ? { id: 'cai', cai: 'TEST', point_of_sale: 'SPS', document_type: 'Factura', fecha_limite_emision: '2099-12-31' } : null, error: null }),
    single: async () => ({ data: table === 'invoice_drafts' ? drafts.get(filters.find(([k]) => k === 'id')?.[1]) || null : null, error: null }),
  }; return q }, async rpc(name,args) {
    if (name === 'is_invoice_master') return { data: master, error: null }
    if (name === 'get_billing_points_of_sale') return { data: ['SPS'], error: null }
    if (name === 'get_my_billing_office_access') return { data: [{ name: 'SPS', allowed: officeAllowed }], error: null }
    writes.push({ name,args })
    if (name === 'save_invoice_draft') {
      if (deferSave) await deferSave
      const old = drafts.get(args.p_id)
      const draft = old?.request_key === args.p_request_key ? old : { id: args.p_id, revision: (old?.revision || 0) + 1, status: 'Borrador', invoice_payload: args.p_invoice, items: args.p_items, editor_state: args.p_editor_state, source_invoice_id: args.p_source_invoice_id, request_key: args.p_request_key }
      drafts.set(args.p_id,draft)
      if (fail) { fail = false; return { data: null, error: { message: 'Respuesta perdida' } } }
      return { data: draft, error: null }
    }
    if (name === 'issue_invoice_draft') { issued = true; return { data: [{ invoice_id: 'issued', invoice_number: 'TEST-001' }], error: null } }
    return { data: null, error: null }
  } }
  const app = mountPage('src/app/(protected)/invoicing/new/page.tsx', {
    '@/src/hooks/useUser': { useUser: () => current },
    'next/navigation': { useRouter: () => router, useSearchParams: () => new URLSearchParams(query) },
    '../../../../lib/supabase/client': { supabase: api }, '@/src/lib/supabase/client': { supabase: api },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: { default_currency: 'HNL' }, error: null }) },
    '@/src/components/ui/UnsavedChangesGuard': { UnsavedChangesGuard: 'Guard', requestFormNavigation() {}, markFormSaved() {} },
    '@/src/components/invoicing/InvoiceCorrectionReview': { InvoiceCorrectionReview: 'CorrectionReview' },
    sonner: { toast: { success: value => messages.push(value), error: value => messages.push(value) } },
  })
  const ready = async () => { await app.ready(); await app.tick(); app.render() }
  return { app, api, writes, drafts, routes, messages, ready, issued: () => issued, switchUser() { current = { user: { id: 'other' }, profile: { ...current.profile, id: 'other', tenant_id: 'other-tenant' } } }, cleanup() { app.cleanup(); if (before === undefined) delete globalThis.window; else globalThis.window = before } }
}

test('borrador real guarda información incompleta, preserva texto vacío y no invoca emisión', async () => {
  const f = fixture()
  try {
    await f.ready(); f.app.find(n => n.type === 'input' && n.props.placeholder === 'Descripción del servicio...').props.onChange({ target: { value: 'Precio por confirmar' } }); f.app.render()
    f.app.find(n => n.type === 'input' && n.props.type === 'number' && n.props.step === '1').props.onChange({ target: { value: '' } }); f.app.render()
    f.app.button('Guardar borrador').props.onClick(); await f.app.tick(); f.app.render()
    assert.equal(f.writes.length,1); assert.equal(f.writes[0].name,'save_invoice_draft')
    assert.equal(f.writes[0].args.p_invoice.cliente_id,null); assert.equal(f.writes[0].args.p_editor_state.items[0].quantity,'')
    assert.equal(f.issued(),false); assert.match(f.routes[0],/new\?draft=/)
  } finally { f.cleanup() }
})

test('sin autorización de oficina el formulario permite guardar borrador y bloquea emisión fiscal', async () => {
  const f = fixture({ officeAllowed: false })
  try {
    await f.ready()
    f.app.find(node=>node.type==='select'&&f.app.text(node).includes('Cliente ficticio')).props.onChange({target:{value:'client'}});f.app.render();await f.app.tick();f.app.render()
    assert.equal(f.app.button('Emitir factura').props.disabled,true)
    assert.match(f.app.text(),/No tienes autorización de emisión para SPS/)
    f.app.button('Guardar borrador').props.onClick();await f.app.tick();f.app.render()
    assert.equal(f.writes[0].name,'save_invoice_draft');assert.equal(f.issued(),false)
  } finally { f.cleanup() }
})

test('respuesta perdida al guardar conserva UUID y clave; doble clic no duplica el borrador', async () => {
  const f = fixture({ failSave: true })
  try {
    await f.ready(); const save = f.app.button('Guardar borrador').props.onClick
    await Promise.all([save(),save()]); f.app.render(); assert.equal(f.writes.length,1)
    await f.app.button('Guardar borrador').props.onClick(); f.app.render()
    assert.equal(f.writes[0].args.p_id,f.writes[1].args.p_id); assert.equal(f.writes[0].args.p_request_key,f.writes[1].args.p_request_key)
    assert.equal(f.drafts.size,1); assert.equal([...f.drafts.values()][0].revision,1)
  } finally { f.cleanup() }
})

test('cambiar de identidad descarta la respuesta de guardado y oculta el formulario anterior', async () => {
  let release; const deferred = new Promise(resolve => { release = resolve }), f = fixture({ deferSave: deferred })
  try {
    await f.ready(); const promise = f.app.button('Guardar borrador').props.onClick()
    f.switchUser(); f.app.render(); assert.match(f.app.text(), /Cargando formulario/)
    release(); await promise; await f.app.tick(); f.app.render()
    assert.equal(f.routes.length,0); assert.equal(f.messages.length,0)
  } finally { release(); f.cleanup() }
})

function savedCorrection() {
  return { id: 'draft-approved', revision: 3, status: 'Aprobada', source_invoice_id: 'original', source_snapshot: { invoice_number: 'TEST-OLD' },
    editor_state: { invoiceType: 'Factura', clienteId: 'client', quotationId: '', issueDate: '2026-10-28', dueDate: '', currency: 'HNL', exchangeRate: '1', notes: '', motivo: '', sourceCurrency: '', fiscalOptions: blankFiscalOptions(), items: [{ id: 'line', description: 'Flete corregido', quantity: '1', unit_price: '100', discount_amount: '0', amount: 100, isv_rate: 15 }] } }
}
test('solo el master puede emitir la revisión aprobada; editar vuelve a bloquear la emisión', async () => {
  for (const master of [false,true]) {
    const f = fixture({ query: 'draft=draft-approved', saved: savedCorrection(), master })
    try {
      await f.ready(); assert.equal(f.app.button('Emitir corrección aprobada').props.disabled,!master)
      if (master) {
        f.app.find(n => n.type === 'input' && n.props.placeholder === 'Descripción del servicio...').props.onChange({ target: { value: 'Cambio posterior' } }); f.app.render()
        assert.equal(f.app.button('Emitir corrección aprobada').props.disabled,true)
        assert.equal(f.app.find(n => n.type === 'CorrectionReview').props.dirty,true)
      }
    } finally { f.cleanup() }
  }
})
test('la corrección aprobada se emite con su revisión exacta sin guardar y anular la aprobación otra vez', async () => {
  const f = fixture({ query: 'draft=draft-approved', saved: savedCorrection(), master: true })
  try {
    await f.ready(); f.app.button('Emitir corrección aprobada').props.onClick(); f.app.render()
    f.app.find(n => n.type === 'ConfirmDialog' && n.props.title === 'Emitir factura sustituta').props.onConfirm(); await f.app.tick(); f.app.render()
    assert.deepEqual(f.writes.map(w => w.name),['issue_invoice_draft'])
    assert.deepEqual(f.writes[0].args,{p_id:'draft-approved',p_revision:3}); assert.equal(f.routes[0],'/invoicing/issued')
  } finally { f.cleanup() }
})
test('firmas comparan JSON sin depender del orden y una copia de corrección conserva moneda, ISV y equivalencia sin reconvertir precios', () => {
  assert.equal(draftEditorSignature({ b:2,a:{x:1,y:2} }),draftEditorSignature({ a:{y:2,x:1},b:2 }))
  const state = draftEditorFromInvoice({ cliente_id: 'client',currency:'USD',exchange_rate:26,fiscal_mode:'Exonerada',reference_equivalence:{currency:'HNL',rate:26,operation:'multiply'},orden_compra_exenta:'OCE-TEST' },[{id:'line',description:'Flete',quantity:2,unit_price:25,amount:50,isv_rate:0,discount_amount:0,tax_treatment:'Exonerada'}],blankFiscalOptions(),'2026-10-28')
  assert.equal(state.currency,'USD'); assert.equal(state.fiscalOptions.referenceRate,'26'); assert.equal(state.fiscalOptions.conversionEnabled,false)
  assert.equal(draftItemPayload(state.items)[0].unit_price,25); assert.equal(state.items[0].tax_treatment,'Exonerada'); assert.equal(state.quotationId,'')
})
