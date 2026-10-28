import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const { validateBillingPointsOfSale } = loadTs('src/lib/billing-points-of-sale.ts')
const { readReportView } = loadTs('src/lib/report-view.ts')
const { validateCaiRange } = loadTs('src/lib/cai-validation.ts')

test('registro CAI acepta el próximo correlativo utilizado por la oficina y rechaza valores fuera del rango', () => {
  const range = { cai: 'TEST', rango_desde: '001-001-01-00000001', rango_hasta: '001-001-01-00000100', fecha_limite_emision: '2099-12-31' }
  for (const next_number of ['', '1', '60', '100']) assert.equal(validateCaiRange({ ...range, next_number }), null)
  for (const next_number of ['0', '101', '1.5', '-1', 'abc']) assert.ok(validateCaiRange({ ...range, next_number }))
})

test('puntos de venta requieren nombres válidos y únicos', () => {
  assert.equal(validateBillingPointsOfSale(['San Pedro Sula', 'Tegucigalpa']), null)
  for (const points of [[], [''], [' '], ['SPS', ' sps '], ['a'.repeat(121)]]) {
    assert.ok(validateBillingPointsOfSale(points))
  }
})

test('reportes de facturación conservan el filtro de oficina al exportar o navegar', () => {
  assert.equal(readReportView(new URLSearchParams('report=billing&pos=Tegucigalpa'), ['billing']).pos, 'Tegucigalpa')
  assert.equal(readReportView(new URLSearchParams('report=commercial&pos=Tegucigalpa'), ['commercial']).pos, 'Todos')
})

test('factura real deriva CAI de la oficina del cliente y descarta respuestas antiguas', async () => {
  const previous = globalThis.window
  globalThis.window = { setTimeout, clearTimeout }
  const reads = [], pending = []
  const client = {
    from(table) {
      const filters = {}
      const query = {
        select: () => query, order: () => query, is: () => query,
        eq: (name, value) => { filters[name] = value; return query },
        then: resolve => Promise.resolve({ data: table === 'clientes' ? [
          { id: 'sps', nombre: 'Cliente SPS', billing_office: { name: 'San Pedro Sula', is_active: true } },
          { id: 'tgu', nombre: 'Cliente TGU', billing_office: { name: 'Tegucigalpa', is_active: true } },
        ] : [], error: null }).then(resolve),
        maybeSingle: async () => {
          reads.push({ ...filters })
          return new Promise(resolve => pending.push({ filters, resolve }))
        },
      }
      assert.ok(['clientes', 'cai_ranges', 'quotations'].includes(table))
      return query
    },
    rpc: async () => ({ data: ['San Pedro Sula', 'Tegucigalpa'], error: null }),
  }
  const app = mountPage('src/app/(protected)/invoicing/new/page.tsx', {
    '../../../../lib/supabase/client': { supabase: client },
    '@/src/lib/supabase/client': { supabase: client },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: null, error: null }) },
    '@/src/components/ui/UnsavedChangesGuard': { UnsavedChangesGuard: 'Guard', requestFormNavigation() {}, markFormSaved() {} },
  })
  const reply = (request, cai) => request.resolve({ data: { id: cai, cai, point_of_sale: request.filters.point_of_sale,
    document_type: 'Factura', rango_desde: '001-001-01-00000001', rango_hasta: '001-001-01-00000100',
    fecha_limite_emision: '2099-12-31' }, error: null })
  try {
    await app.ready(); await app.tick(); app.render()
    assert.equal(reads.length, 0, 'Sin cliente no se elige una oficina arbitraria')
    const chooseClient = value => app.find(node => node.type === 'select' && app.text(node).includes('Cliente SPS')).props.onChange({ target: { value } })
    chooseClient('sps'); app.render(); await app.tick(); app.render()
    assert.equal(reads[0].point_of_sale, 'San Pedro Sula')
    assert.equal(app.find(node => node.type === 'select' && node.props.id === 'invoice-point-of-sale'), undefined)
    chooseClient('tgu')
    app.render(); await app.tick(); app.render()
    assert.equal(reads[1].point_of_sale, 'Tegucigalpa')
    reply(pending[1], 'CAI-TGU'); await app.tick(); app.render()
    assert.match(app.text(), /CAI-TGU/)
    reply(pending[0], 'CAI-SPS'); await app.tick(); app.render()
    assert.match(app.text(), /CAI-TGU/)
    assert.doesNotMatch(app.text(), /CAI-SPS/)
  } finally { app.cleanup(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})
