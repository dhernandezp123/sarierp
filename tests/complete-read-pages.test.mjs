import test from 'node:test'
import assert from 'node:assert/strict'
import { pagedClient } from './paged-client.mjs'
import { mountPage } from './page-harness.mjs'

function windowFixture() {
  const previous = globalThis.window
  globalThis.window = { setTimeout, clearTimeout, location: { search: '?view=documents' }, addEventListener() {}, removeEventListener() {} }
  return () => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
}

test('historico real permite navegar hasta la cotizacion1301 y conserva KPIs completos', async () => {
  const restore = windowFixture()
  const db = pagedClient({ quotations: Array.from({ length: 1301 }, (_, n) => ({ id: String(n).padStart(5, '0'), quotation_number: 'Q' + n,
    status: 'Ganada', quote_type: 'FCL', created_at: '2026-01-01', deleted_at: null, total_sale: 100, profit_amount: 20 })) })
  const app = mountPage('src/app/(protected)/historico/page.tsx', { '../../../lib/supabase/client': { supabase: db } })
  try {
    await app.ready()
    const pagination = app.find(node => node.type === 'Pagination')
    assert.equal(pagination.props.total, 1301)
    pagination.props.onPageChange(53); app.render()
    assert.match(app.text(), /Q1300/)
  } finally { app.cleanup(); restore() }
})

test('facturacion real muestra error recuperable si falta una pagina de saldos, sin KPIs/exportacion parcial', async () => {
  const restore = windowFixture()
  const data = {
    invoices: Array.from({ length: 101 }, (_, n) => ({ id: String(n), invoice_type: 'Factura', status: 'Aprobada', deleted_at: null, total: 100, currency: 'USD' })),
    invoice_receivables: Array.from({ length: 101 }, (_, n) => ({ invoice_id: String(n), receivable_status: 'Aprobada', balance: 10 })),
  }
  let broken = true
  const db = pagedClient(data, { fail: call => broken && call.table === 'invoice_receivables' && call.start >= 50 })
  const app = mountPage('src/app/(protected)/invoicing/page.tsx', {
    '../../../lib/supabase/client': { supabase: db },
    '@/src/lib/supabase/client': { supabase: db },
  })
  try {
    await app.ready()
    assert.match(app.text(), /saldos de facturas/)
    assert.equal(app.find(node => node.type === 'Pagination'), undefined)
    broken = false
    app.button('Reintentar').props.onClick(); await app.tick(); app.render()
    assert.equal(app.find(node => node.type === 'Pagination').props.total, 101)
  } finally { app.cleanup(); restore() }
})

test('historial manual real carga mas versiones y busca fuera de las primeras100 sin borrar el formulario', async () => {
  const restore = windowFixture(), previousFetch = globalThis.fetch
  const documents = Array.from({ length: 131 }, (_, n) => ({ id: String(n), invoice_number: 'INV-' + n, client_name: 'Cliente', total: 10, created_at: '2026-01-01' }))
  const requests = []
  globalThis.fetch = async url => {
    const params = new URL(url, 'http://localhost').searchParams
    const offset = Number(params.get('offset') || 0), search = params.get('search') || ''
    requests.push({ offset, search })
    const source = search ? documents.filter(row => row.invoice_number === search) : documents
    const data = source.slice(offset, offset + 25)
    return Response.json({ documents: data, total: source.length, nextOffset: offset + data.length, hasMore: offset + data.length < source.length })
  }
  const app = mountPage('src/components/invoicing/ManualInvoiceEditor.tsx', {}, { exported: 'ManualInvoiceEditor' })
  try {
    await app.ready()
    assert.match(app.text(), /Mostrando 25 de 131/)
    app.button('Cargar mas versiones').props.onClick(); await app.tick(); app.render()
    assert.match(app.text(), /Mostrando 50 de 131/)
    assert.equal(requests.at(-1).offset, 25)
    const input = app.find(node => node.type === 'input' && node.props.maxLength === 120)
    input.props.onChange({ target: { value: 'INV-130' } }); app.render()
    app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await app.tick(); app.render()
    assert.match(app.text(), /INV-130/)
    assert.match(app.text(), /Mostrando 1 de 1/)
    assert.equal(app.button('Cargar mas versiones'), undefined)
    app.find(node => node.type === 'input' && node.props.maxLength === 120).props.onChange({ target: { value: 'INV-NONE' } }); app.render()
    app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await app.tick(); app.render()
    assert.match(app.text(), /No hay versiones que coincidan/)
  } finally { app.cleanup(); restore(); if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch }
})

test('embarques conserva seleccion y peso entre paginas/filtros y envia todos los IDs elegidos', async () => {
  const restore = windowFixture()
  const db = pagedClient({ miami_packages: Array.from({ length: 1301 }, (_, n) => ({ id: String(n).padStart(5, '0'), tracking_number: 'TRACK-' + n,
    cargo_status: 'Recibido en Miami', tipo_carga: n === 25 ? 'Paquetería' : 'LCL', weight_lbs: n === 0 ? 2 : n === 25 ? 3 : 0, received_at: '2026-01-01' })) })
  let dispatched
  db.rpc = async (_name, params) => { dispatched = params.p_package_ids; return { data: [{ shipment_id: 'shipment', shipment_number: 'TEST' }], error: null } }
  const app = mountPage('src/app/(protected)/miami/embarques/page.tsx', {
    '@/src/lib/supabase/client': { supabase: db },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: null, error: null }) },
  })
  try {
    await app.ready()
    assert.equal(app.find(node => node.type === 'Pagination').props.total, 1301)
    app.find(node => node.type === 'tr' && node.props.onClick && app.text(node).includes('TRACK-0')).props.onClick(); app.render()
    app.find(node => node.type === 'Pagination').props.onPageChange(2); app.render()
    app.find(node => node.type === 'tr' && node.props.onClick && app.text(node).includes('TRACK-25')).props.onClick(); app.render()
    app.button('LCL').props.onClick(); app.render()
    assert.match(app.text(), /2 seleccionados/)
    assert.match(app.text(), /5\.0 lbs/)
    const dispatch = app.find(node => node.type === 'button' && app.text(node).includes('Marcar En'))
    assert.ok(dispatch)
    await dispatch.props.onClick()
    assert.deepEqual(dispatched, ['00000','00025'])
  } finally { app.cleanup(); restore() }
})
