import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { pagedClient } from './paged-client.mjs'

const { writeTenantHeaders } = loadTs('src/lib/tenant-context.ts')
const { mergeManualInvoicePage } = loadTs('src/lib/manual-invoice-history.ts')
const { literalTextFilter } = loadTs('src/lib/postgrest-search.ts')
const tenant = { id: '00000000-0000-4000-8000-000000000001', slug: 'sari', hostname: 'sari.forwarders.app', requestHostname: 'sari.forwarders.app', name: 'Sari Express', tradeName: 'Sari Express' }
const profile = { rol: 'Finanzas', status: 'Aprobado', is_active: true, is_platform_admin: false, tenant_id: tenant.id }
const rows = Array.from({ length: 1301 }, (_, n) => ({ id: String(n).padStart(5, '0'), tenant_id: tenant.id,
  invoice_number: 'INV-' + n, client_name: 'Client ' + n, total: 10, created_at: '2026-01-01', data: {} }))
const headers = () => { const value = new Headers(); writeTenantHeaders(value, tenant); return value }
function api(options = {}) {
  const db = pagedClient({ manual_invoices: [...rows, { ...rows[0], id: 'other', tenant_id: 'other-tenant' }] }, options)
  const baseFrom = db.from
  db.from = table => table === 'profiles' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.profile === undefined ? profile : options.profile }) }) }) } : baseFrom(table)
  db.auth = { getUser: async () => ({ data: { user: { id: 'finance' } }, error: null }) }
  const { GET } = loadTs('src/app/api/manual-invoices/route.ts', { '@/src/lib/supabase/server': { createClient: async () => db } })
  return { db, get: query => GET(new Request('https://sari.forwarders.app/api/manual-invoices' + (query ? '?' + query : ''), { headers: headers() })) }
}

test('historial manual pagina mas de100 versiones con limite50 y conteo real del tenant', async () => {
  const app = api()
  let documents = [], offset = 0, hasMore = true
  while (hasMore) {
    const response = await app.get('pageSize=100&offset=' + offset)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const page = mergeManualInvoicePage(documents, await response.json(), offset)
    documents = page.documents; offset = page.nextOffset; hasMore = page.hasMore
    assert.equal(page.total, 1301)
  }
  assert.equal(documents.length, 1301)
  assert.equal(new Set(documents.map(row => row.id)).size, 1301)
  assert.ok(!documents.some(row => row.id === 'other'))
  assert.ok(app.db.calls.every(call => call.filters.some(filter => filter.field === 'tenant_id' && filter.value === tenant.id)))
})

test('busqueda manual encuentra una version antigua fuera de la primera pagina', async () => {
  const app = api()
  const response = await app.get('search=INV-0')
  const result = await response.json()
  assert.equal(result.documents.length, 1)
  assert.equal(result.documents[0].invoice_number, 'INV-0')
  assert.equal(result.total, 1)
  assert.equal(result.hasMore, false)
  assert.deepEqual(app.db.calls[0].orders, [['created_at', false], ['id', false]])
})

test('paginacion invalida, consulta vacia inesperada y fallo de lectura no aparentan historial completo', async () => {
  const app = api()
  for (const query of ['offset=-1', 'offset=1.5', 'offset=10000001', 'pageSize=1000', 'search=' + 'x'.repeat(121)]) {
    assert.equal((await app.get(query)).status, 400)
  }
  const broken = api({ fail: () => true })
  assert.equal((await broken.get('offset=50')).status, 503)
  const unauthorized = api({ profile: { ...profile, tenant_id: 'another' } })
  assert.equal((await unauthorized.get()).status, 403)
  assert.equal(unauthorized.db.calls.length, 0)
})

test('busquedas literales reutilizan el escape del portal y no inyectan operadores', () => {
  const search = ' A_%,"x\\y),tenant_id.neq.foo '
  const literal = search.trim().replace(/\\/g, '\\\\').replace(/[%_]/g, character => '\\' + character)
  const quoted = JSON.stringify('%' + literal + '%')
  assert.equal(literalTextFilter(['invoice_number','client_name'], search), 'invoice_number.ilike.' + quoted + ',client_name.ilike.' + quoted)
  const { portalTrackingFilter } = loadTs('src/lib/portal.ts')
  assert.equal(portalTrackingFilter(search), literalTextFilter(['tracking_number','warehouse_number'], search))
})

test('el cliente rechaza paginas repetidas, respuestas incompletas y desplazamientos inconsistentes', () => {
  const first = mergeManualInvoicePage([], { documents: rows.slice(0, 25), nextOffset: 25, total: 1301, hasMore: true }, 0)
  assert.throws(() => mergeManualInvoicePage(first.documents, { documents: rows.slice(0, 25), nextOffset: 50, total: 1301, hasMore: true }, 25), /cambio durante/)
  assert.throws(() => mergeManualInvoicePage(first.documents, { documents: [], nextOffset: 25, total: 1301, hasMore: true }, 25), /no se pudo cargar completo/)
  assert.throws(() => mergeManualInvoicePage(first.documents, { documents: [], nextOffset: 26, total: 25, hasMore: false }, 25), /no se pudo cargar completo/)
  assert.throws(() => mergeManualInvoicePage([], { documents: rows.slice(0, 25), nextOffset: 25, total: 1301, hasMore: false }, 0), /no se pudo cargar completo/)
})
