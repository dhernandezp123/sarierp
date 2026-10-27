import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'
import { pagedClient } from './paged-client.mjs'
import { activeIdentity, topbarFixture } from './read-error-fixture.mjs'

const permissions = loadTs('src/lib/permissions.ts')

test('Contabilidad consulta y edita clientes y consulta cotizaciones sin crear ni editar cotizaciones', () => {
  for (const path of ['/clientes', '/clientes/client-1', '/clientes/client-1/edit',
    '/quotations/quote-1', '/historico', '/reports', '/settings/company', '/settings/cai',
    '/manual-invoices', '/invoicing']) {
    assert.equal(permissions.canAccessPath('Contabilidad', path), true, path)
  }
  for (const path of ['/clientes/nuevo', '/clientes/nuevo/extra', '/quotations/new',
    '/quotations/new/', '/quotations/quote-1/edit', '/pricing-comparison', '/admin/users']) {
    assert.equal(permissions.canAccessPath('Contabilidad', path), false, path)
  }
  assert.equal(permissions.canManageClientRates('Contabilidad'), false)
})

test('permisos corporativos y de costos conservan los otros roles', () => {
  for (const role of ['Admin', 'Ventas', 'Pricing', 'Operaciones', 'Contabilidad', 'Finanzas', 'Cliente', '', null]) {
    assert.equal(permissions.canManageCompanySettings(role), ['Admin', 'Contabilidad'].includes(role))
    assert.equal(permissions.canManageCaiRanges(role), ['Admin', 'Contabilidad'].includes(role))
    assert.equal(permissions.canViewQuotationCosts(role), ['Admin', 'Pricing', 'Contabilidad'].includes(role))
  }
})

test('Contabilidad encuentra Ver / Editar Cliente en acciones rápidas sin acciones de creación', async () => {
  const fixture = topbarFixture()
  fixture.identity(activeIdentity('accountant', 'tenant-a', 'Contabilidad'))
  const app = fixture.mount()
  try {
    await app.ready()
    app.find(node => node.type === 'button' && node.props.title === 'Acciones rapidas').props.onClick()
    app.render()
    assert.ok(app.find(node => node.type === 'button' && app.text(node).trim() === 'Ver / Editar Cliente'))
    assert.equal(app.find(node => node.type === 'button' && app.text(node).trim() === 'Nuevo Cliente'), undefined)
    assert.equal(app.find(node => node.props?.href === '/quotations/new'), undefined)
  } finally { app.cleanup(); fixture.cleanup() }
})

const identity = {
  user: { id: 'accountant' },
  profile: { id: 'accountant', rol: 'Contabilidad', tenant_id: 'tenant-a', status: 'Aprobado', is_active: true },
  loading: false,
}
const userMocks = {
  '../../../../hooks/useUser': { useUser: () => identity },
  '@/src/hooks/useUser': { useUser: () => identity },
}
const button = (app, label) => app.find(node => node.type === 'button' && app.text(node).trim() === label)

function withWindow() {
  const previous = globalThis.window
  globalThis.window = { setTimeout: (fn, ms) => ms < 1000 ? setTimeout(fn, ms) : 0, clearTimeout }
  return () => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
}

test('pantalla real permite a Contabilidad crear y actualizar empresa/facturacion, incluido ISV cero', async () => {
  const restore = withWindow()
  try {
    for (const existing of [false, true]) {
      const writes = [], errors = []
      const client = { from(table) {
        const query = {
          select: () => query, eq: () => query, order: () => query,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: { id: 'settings' }, error: null }),
          insert: value => { writes.push({ table, action: 'insert', value }); return query },
          update: value => { writes.push({ table, action: 'update', value }); return query },
          then: resolve => Promise.resolve({ error: null }).then(resolve),
        }
        return query
      } }
      const app = mountPage('src/app/(protected)/settings/company/page.tsx', {
        ...userMocks, '../../../../lib/supabase/client': { supabase: client },
        '@/src/lib/supabase/client': { supabase: client },
        '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({
          data: existing ? { id: 'settings', legal_name: 'Empresa A', default_tax_rate: 0 } : null, error: null,
        }) },
        sonner: { toast: { error: value => errors.push(value), success() {} } },
      })
      try {
        await app.ready()
        assert.ok(button(app, 'Guardar cambios'))
        assert.equal(app.find(node => node.type === 'input' && node.props.disabled === true), undefined)
        await button(app, 'Guardar cambios').props.onClick()
        assert.deepEqual(errors, [])
        assert.equal(writes.length, 1)
        assert.equal(writes[0].action, existing ? 'update' : 'insert')
        assert.equal(writes[0].value.tenant_id, 'tenant-a')
        assert.equal(writes[0].value.updated_by, 'accountant')
        assert.equal(writes[0].value.default_tax_rate, existing ? 0 : 15)
      } finally { app.cleanup() }
    }
  } finally { restore() }
})

test('configuración valida TC e impuestos antes de escribir y conserva una TC decimal', async () => {
  const restore = withWindow()
  try {
    for (const [tax, exchange, allowed] of [[15, 0, false], [15, -1, false], [101, 25.3, false], [0, 26.75, true]]) {
      const writes = [], errors = []
      const client = { from() {
        const query = {
          select: () => query, eq: () => query, order: () => query,
          maybeSingle: async () => ({ data: null, error: null }),
          update: value => { writes.push(value); return query },
          then: resolve => Promise.resolve({ error: null }).then(resolve),
        }
        return query
      } }
      const app = mountPage('src/app/(protected)/settings/company/page.tsx', {
        ...userMocks, '../../../../lib/supabase/client': { supabase: client },
        '@/src/lib/supabase/client': { supabase: client },
        '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({
          data: { id: 'settings', default_tax_rate: tax, exchange_rate_usd_hnl: exchange }, error: null,
        }) },
        sonner: { toast: { error: value => errors.push(value), success() {} } },
      })
      try {
        await app.ready()
        await button(app, 'Guardar cambios').props.onClick()
        assert.equal(writes.length, allowed ? 1 : 0)
        assert.equal(errors.length, allowed ? 0 : 1)
        if (allowed) {
          assert.equal(writes[0].exchange_rate_usd_hnl, 26.75)
          assert.equal(writes[0].default_tax_rate, 0)
        }
      } finally { app.cleanup() }
    }
  } finally { restore() }
})

test('pantalla CAI registra y activa con Contabilidad sin ofrecer borrado', async () => {
  const restore = withWindow(), writes = [], errors = []
  const range = { id: 'range', point_of_sale: 'San Pedro Sula', document_type: 'Factura', cai: 'CAI-TEST', rango_desde: '000-001-01-00000001',
    rango_hasta: '000-001-01-00000100', range_start: 1, range_end: 100, next_number: 1,
    fecha_limite_emision: '2099-12-31', is_active: false }
  const client = {
    from: () => ({ select: () => ({ order: async () => ({ data: [range], error: null }) }),
      insert: async value => { writes.push(['insert', value]); return { error: null } } }),
    rpc: async (...args) => {
      if (args[0] === 'get_billing_points_of_sale') return { data: ['San Pedro Sula', 'Tegucigalpa'], error: null }
      writes.push(args); return { error: null }
    },
  }
  const app = mountPage('src/app/(protected)/settings/cai/page.tsx', {
    ...userMocks, '../../../../lib/supabase/client': { supabase: client },
    sonner: { toast: { error: value => errors.push(value), success() {} } },
  })
  try {
    await app.ready()
    assert.equal(app.find(node => node.type === 'button' && node.props.onClick?.toString().includes('setRangePendingDelete')), undefined)
    await button(app, 'Activar').props.onClick()
    app.find(node => node.type === 'select' && node.props.id === 'cai-point-of-sale').props.onChange({ target: { value: 'Tegucigalpa' } })
    app.render()
    button(app, 'Registrar rango CAI').props.onClick(); app.render()
    for (const [label, value] of Object.entries({ CAI: 'CAI-NUEVO', 'Rango desde': range.rango_desde,
      'Rango hasta': range.rango_hasta, 'Fecha límite de emisión': range.fecha_limite_emision, 'Siguiente correlativo': '60' })) {
      app.find(node => node.type === 'input' && node.props['aria-label'] === label).props.onChange({ target: { value } })
      app.render()
    }
    await button(app, 'Guardar rango').props.onClick()
    assert.deepEqual(errors, [])
    assert.deepEqual(writes[0], ['activate_cai_range', { p_range_id: 'range' }])
    assert.equal(writes[1][0], 'insert')
    assert.equal(writes[1][1].cai, 'CAI-NUEVO')
    assert.equal(writes[1][1].is_active, false)
    assert.equal(writes[1][1].point_of_sale, 'Tegucigalpa')
    assert.equal(writes[1][1].next_number, '60')
  } finally { app.cleanup(); restore() }
})

test('reporte comercial real carga utilidades y habilita CSV/PDF para Contabilidad', async () => {
  const restore = withWindow(), previousDocument = globalThis.document
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL
  const blobs = [], downloads = [], pdfs = []
  URL.createObjectURL = blob => { blobs.push(blob); return 'blob:test' }
  URL.revokeObjectURL = () => {}
  globalThis.document = { createElement: () => { const link = { click: () => downloads.push(link.download) }; return link } }
  const client = pagedClient({ quotations: [{ id: 'quote-a', quotation_number: 'Q-A', created_at: '2026-10-26',
    status: 'Pricing Aprobado', total_sale: 150, total_cost: 100, profit_amount: 50, gp_percentage: 33.33,
    clientes: { id: 'client-a', nombre: 'Cliente A' } }] })
  const params = new URLSearchParams('report=commercial&from=2026-01-01&to=2026-12-31')
  const app = mountPage('src/app/(protected)/reports/page.tsx', {
    ...userMocks, '@/src/lib/supabase/client': { supabase: client },
    'next/navigation': { usePathname: () => '/reports', useSearchParams: () => params },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: null, error: null }) },
    '@/src/components/pdf/report-pdf': { ReportPdf: 'ReportPdf' },
    '@react-pdf/renderer': { pdf: element => { pdfs.push(element.props.data); return { toBlob: async () => new Blob(['pdf']) } } },
  }, { unwrap: element => element.type })
  try {
    await app.ready()
    assert.equal(button(app, 'Comercial').props['aria-pressed'], true)
    assert.match(app.text(), /Cliente A/)
    assert.equal(button(app, 'Exportar CSV').props.disabled, false)
    assert.equal(button(app, 'Descargar PDF').props.disabled, false)
    button(app, 'Exportar CSV').props.onClick()
    assert.match(await blobs[0].text(), /Cliente A/)
    await button(app, 'Descargar PDF').props.onClick()
    assert.equal(pdfs.length, 1)
    assert.equal(downloads.length, 2)
    assert.ok(client.calls.some(call => call.table === 'quotations'))
  } finally {
    app.cleanup(); restore(); URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument
  }
})

test('reporte real de facturación filtra la oficina sin mezclar SPS y TGU', async () => {
  const restore = withWindow()
  const client = pagedClient({ invoices: ['San Pedro Sula', 'Tegucigalpa'].map((point, index) => ({
    id: String(index), invoice_number: 'TEST-' + index, invoice_type: 'Factura', status: 'Borrador',
    cliente_nombre: 'Cliente ' + point, point_of_sale: point, issue_date: '2026-10-26', total: 115, currency: 'USD',
  })) })
  const params = new URLSearchParams('report=billing&pos=Tegucigalpa&from=2026-01-01&to=2026-12-31')
  const app = mountPage('src/app/(protected)/reports/page.tsx', {
    ...userMocks, '@/src/lib/supabase/client': { supabase: client },
    '@/src/components/pdf/report-pdf': { ReportPdf: 'ReportPdf' },
    'next/navigation': { usePathname: () => '/reports', useSearchParams: () => params },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: null, error: null }) },
  }, { unwrap: element => element.type })
  try {
    await app.ready()
    const table = app.find(node => node.type === 'tbody')
    assert.ok(table)
    assert.match(app.text(table), /Cliente Tegucigalpa/)
    assert.doesNotMatch(app.text(table), /Cliente San Pedro Sula/)
    assert.ok(app.find(node => node.type === 'select' && node.props.id === 'report-pos'))
    assert.equal(button(app, 'Exportar CSV').props.disabled, false)
    assert.equal(button(app, 'Descargar PDF').props.disabled, false)
  } finally { app.cleanup(); restore() }
})
