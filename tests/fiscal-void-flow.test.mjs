import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import loadTs from './load-ts.mjs'

const { canRequestFiscalVoid, canReviewFiscalVoid, fiscalVoidReport } = loadTs('src/lib/fiscal-void.ts')
const profile = { id: 'accountant', tenant_id: 'tenant-a', rol: 'Contabilidad', status: 'Aprobado', is_active: true }
const request = { id: 'request', document_id: 'invoice', document_table: 'invoices', document_type: 'Factura', document_number: 'TEST-001', cai: 'CAI-TEST', point_of_sale: 'TGU', issue_date: '2026-10-27', currency: 'HNL', total: 115, reason: 'Error de emisión', status: 'Pendiente', requested_at: '2026-10-27T16:00:00Z', requested_by: 'finance', requested_by_name: 'Finanzas de prueba', reviewed_at: null, review_reason: null, reviewed_by_name: null, accounting_result: null, original_entry_id: null, reversal_entry_id: null }
const dialogs = { '@/src/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'].map(name => [name, name])) }
const userMock = current => ({ '@/src/hooks/useUser': { useUser: () => ({ user: { id: current().id }, profile: current() }) } })
const button = (app, label) => { const node = app.button(label); assert.ok(node, label); return node }
const tick = async app => { await app.tick(); app.render() }

test('solo Contabilidad aprobada, activa y con identidad/tenant válidos puede decidir', () => {
  assert.equal(canReviewFiscalVoid(profile, profile.id), true)
  for (const rol of ['Admin', 'Finanzas', 'Ventas', 'Operaciones']) {
    assert.equal(canReviewFiscalVoid({ ...profile, rol }, profile.id), false)
    assert.equal(canRequestFiscalVoid({ ...profile, rol }, profile.id), ['Admin', 'Finanzas'].includes(rol))
  }
  for (const change of [{ is_active: false }, { status: 'Pendiente' }, { tenant_id: null }]) assert.equal(canReviewFiscalVoid({ ...profile, ...change }, profile.id), false)
  assert.equal(canReviewFiscalVoid(profile, 'otro'), false)
})

test('registro exportable conserva motivo, personas, CAI y vínculo del reverso sin mezclar monedas', () => {
  const report = fiscalVoidReport([request, { ...request, id: 'approved', status: 'Aprobada', reviewed_at: '2026-10-27T18:00:00Z', reviewed_by_name: 'Contabilidad prueba', review_reason: 'Confirmado', accounting_result: 'Reversado', original_entry_id: 'entry-original', reversal_entry_id: 'entry-reverse', currency: 'USD' }], ['TGU'])
  assert.equal(report.rows.length, 2)
  assert.match(report.rows[1].accounting, /entry-original/); assert.match(report.rows[1].accounting, /entry-reverse/)
  assert.match(report.rows[0].document, /CAI-TEST/); assert.match(report.rows[1].decision, /Contabilidad prueba/)
  assert.match(report.rows[0].amount, /^HNL /); assert.match(report.rows[1].amount, /^USD /)
  assert.equal(report.metrics.find(m => m.label === 'Aprobada').value, '1')
})

test('revisión real exige motivo y custodia; doble clic genera una sola decisión', async () => {
  const calls = [], changes = [], messages = []; let resolve
  const app = mountPage('src/components/invoicing/FiscalVoidControl.tsx', {
    ...dialogs, ...userMock(() => profile),
    '@/src/lib/supabase/client': { supabase: { rpc: (...args) => { calls.push(args); return new Promise(r => { resolve = r }) } } },
    sonner: { toast: { success: value => messages.push(value), error: value => messages.push(value) } },
  }, { exported: 'FiscalVoidReview', props: { request, onChanged: () => changes.push(true) } })
  try {
    app.render(); button(app, 'Revisar anulación').props.onClick(); app.render()
    assert.equal(button(app, 'Aprobar anulación').props.disabled, true)
    app.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Error confirmado' } }); app.render()
    assert.equal(button(app, 'Aprobar anulación').props.disabled, true)
    assert.equal(button(app, 'Rechazar solicitud').props.disabled, false)
    app.find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); app.render()
    const approve = button(app, 'Aprobar anulación'); assert.equal(approve.props.disabled, false)
    approve.props.onClick(); approve.props.onClick(); assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], ['review_fiscal_void', { p_request_id: 'request', p_approve: true, p_reason: 'Error confirmado', p_originals_confirmed: true }])
    resolve({ error: null }); await tick(app); assert.equal(changes.length, 1); assert.equal(messages.length, 1)
  } finally { app.cleanup() }
})

test('Admin no recibe controles de aprobación y rechazo real envía una decisión negativa sin custodia', async () => {
  for (const rol of ['Admin', 'Contabilidad']) {
    const calls = [], actor = { ...profile, rol }
    const app = mountPage('src/components/invoicing/FiscalVoidControl.tsx', { ...dialogs, ...userMock(() => actor), '@/src/lib/supabase/client': { supabase: { rpc: async (...args) => { calls.push(args); return { error: null } } } } }, { exported: 'FiscalVoidReview', props: { request, onChanged() {} } })
    try {
      app.render()
      if (rol === 'Admin') { assert.equal(app.button('Revisar anulación'), undefined); continue }
      button(app, 'Revisar anulación').props.onClick(); app.render()
      app.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Usar nota de crédito' } }); app.render()
      button(app, 'Rechazar solicitud').props.onClick(); await tick(app)
      assert.equal(calls[0][1].p_approve, false); assert.equal(calls[0][1].p_originals_confirmed, false)
    } finally { app.cleanup() }
  }
})

test('solicitud real conserva la clave al reintentar una respuesta perdida y nunca actualiza invoices directamente', async () => {
  const calls = [], actor = { ...profile, rol: 'Finanzas' }; let fail = true
  const client = { from(table) { assert.equal(table, 'fiscal_void_requests'); const q = { select: () => q, eq: () => q, order: () => q, range: async () => ({ data: [], error: null }) }; return q }, async rpc(...args) { calls.push(args); return { error: fail ? { message: 'Respuesta perdida' } : null } } }
  const app = mountPage('src/components/invoicing/FiscalVoidControl.tsx', { ...dialogs, ...userMock(() => actor), '@/src/lib/supabase/client': { supabase: client } }, { exported: 'FiscalVoidControl', props: { table: 'invoices', documentId: 'invoice', status: 'Aprobada', onChanged() {} } })
  try {
    await app.ready(); await tick(app); button(app, 'Solicitar anulación').props.onClick(); app.render()
    app.find(n => n.type === 'textarea').props.onChange({ target: { value: '  Error de emisión  ' } }); app.render()
    button(app, 'Enviar a Contabilidad').props.onClick(); await tick(app)
    fail = false; button(app, 'Enviar a Contabilidad').props.onClick(); await tick(app)
    assert.equal(calls.length, 2); assert.equal(calls[0][1].p_request_key, calls[1][1].p_request_key)
    assert.equal(calls[0][0], 'request_fiscal_void'); assert.equal(calls[0][1].p_reason, 'Error de emisión')
  } finally { app.cleanup() }
})

test('una decisión tardía después de cambiar identidad no publica mensajes ni refresca datos del usuario anterior', async () => {
  let actor = { ...profile }, resolve; const changes = [], messages = []
  const app = mountPage('src/components/invoicing/FiscalVoidControl.tsx', { ...dialogs, ...userMock(() => actor), '@/src/lib/supabase/client': { supabase: { rpc: () => new Promise(r => { resolve = r }) } }, sonner: { toast: { success: value => messages.push(value), error: value => messages.push(value) } } }, { exported: 'FiscalVoidReview', props: { request, onChanged: () => changes.push(true) } })
  try {
    app.render(); button(app, 'Revisar anulación').props.onClick(); app.render()
    app.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Rechazado' } }); app.render()
    button(app, 'Rechazar solicitud').props.onClick()
    actor = { ...profile, id: 'new-accountant', tenant_id: 'tenant-b' }; app.render()
    resolve({ error: null }); await tick(app)
    assert.deepEqual(changes, []); assert.deepEqual(messages, [])
    assert.equal(app.find(n => n.type === 'Dialog').props.open, false)
  } finally { app.cleanup() }
})

test('registro real lee todas las páginas y no permite exportar resultados parciales ante fallo', async () => {
  for (const fail of [false, true]) {
    const rows = Array.from({ length: 7 }, (_, i) => ({ ...request, id: 'r-' + i })), offsets = []
    const client = { from() { const q = { select: () => q, order: () => q, eq: () => q, range: async from => { offsets.push(from); return from && fail ? { error: { message: 'Offline' }, data: null } : { data: rows.slice(from, from + 2), error: null } } }; return q } }
    const app = mountPage('src/app/(protected)/invoicing/voids/page.tsx', { ...userMock(() => profile), '@/src/lib/supabase/client': { supabase: client }, '@/src/components/invoicing/FinancialReportExport': { FinancialReportExport: 'Export' } })
    try {
      await app.ready(); await tick(app)
      if (fail) { assert.equal(app.find(n => n.type === 'Export'), undefined); assert.match(app.text(), /No se pudo cargar/) }
      else { assert.equal(app.find(n => n.type === 'Export').props.data.rows.length, 7); assert.deepEqual(offsets, [0, 2, 4, 6, 7]) }
    } finally { app.cleanup() }
  }
})

test('acceso directo Nueva proforma crea una proforma real sin requerir ni consumir CAI', async () => {
  const writes = [], previous = globalThis.window; globalThis.window = { setTimeout, clearTimeout }
  const client = { from(table) { const q = { select: () => q, order: () => q, is: () => q, eq: () => q, then: resolve => Promise.resolve({ data: table === 'clientes' ? [{ id: 'cliente', nombre: 'Cliente TGU', rtn: '00000000000000', condicion_pago: 'Contado', dias_credito: 0, billing_office: { name: 'TGU', is_active: true } }] : [], error: null }).then(resolve), maybeSingle: async () => ({ data: null, error: null }) }; return q }, async rpc(name, args) { if (name === 'create_manual_invoice_with_items') { writes.push(args); return { data: [{ invoice_id: 'proforma', invoice_number: 'PRO-TEST' }], error: null } } return { data: ['TGU'], error: null } } }
  const app = mountPage('src/app/(protected)/invoicing/new/page.tsx', { 'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams('doc_type=proforma') }, '../../../../lib/supabase/client': { supabase: client }, '@/src/lib/supabase/client': { supabase: client }, '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: { default_currency: 'HNL' }, error: null }) }, '@/src/components/ui/UnsavedChangesGuard': { UnsavedChangesGuard: 'Guard', requestFormNavigation() {}, markFormSaved() {} } })
  try {
    await app.ready(); await tick(app)
    assert.ok(app.find(n => n.type === 'select' && n.props.value === 'Proforma'))
    app.find(n => n.type === 'select' && app.text(n).includes('Cliente TGU')).props.onChange({ target: { value: 'cliente' } }); await tick(app)
    app.find(n => n.type === 'input' && n.props.placeholder === 'Descripción del servicio...').props.onChange({ target: { value: 'Servicio proforma' } }); app.render()
    app.find(n => n.type === 'input' && n.props.type === 'number' && n.props.step === '0.01' && !n.props['aria-label'] && n.props.value === '0').props.onChange({ target: { value: '100' } }); app.render()
    app.find(n => n.type === 'button' && app.text(n).startsWith('Generar ')).props.onClick(); await tick(app)
    assert.equal(writes.length, 1); assert.equal(writes[0].p_invoice.invoice_type, 'Proforma')
  } finally { app.cleanup(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})
