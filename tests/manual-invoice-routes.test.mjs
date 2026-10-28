import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { blankManualInvoice } = loadTs('src/lib/manual-invoice.ts')
const { writeTenantHeaders } = loadTs('src/lib/tenant-context.ts')
const tenant = { id: '00000000-0000-4000-8000-000000000001', slug: 'sari', hostname: 'sari.forwarders.app',
  requestHostname: 'sari.forwarders.app', name: 'Sari Express', tradeName: 'Sari Express', logoUrl: null, primaryColor: '#0038BD', secondaryColor: '#07111F' }
const goodProfile = { rol: 'Admin', status: 'Aprobado', is_active: true, is_platform_admin: false, tenant_id: tenant.id }
const headers = () => { const result = new Headers(); writeTenantHeaders(result, tenant); return result }
const authorizedServer = (profile = goodProfile, user = { id: 'user-1' }) => {
  const select = () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile }) }) })
  return { auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => ({ select }) }
}

test('Scanner / Factura manual autoriza Contabilidad de Sari en el servidor', async () => {
  const server = authorizedServer({ ...goodProfile, rol: 'Contabilidad' })
  const { authorizeManualInvoices } = loadTs('src/lib/server/manual-invoices.ts', {
    '@/src/lib/supabase/server': { createClient: async () => server },
  })
  const result = await authorizeManualInvoices(new Request('https://sari.forwarders.app/api/manual-invoices', { headers: headers() }))
  assert.equal(result.tenant.id, tenant.id)
})

test('server authorization checks approval, activity, role, tenant, host and platform-only accounts', async () => {
  for (const profile of [goodProfile, { ...goodProfile, rol: 'Ventas' }, { ...goodProfile, status: 'Pendiente' },
    { ...goodProfile, is_active: false }, { ...goodProfile, is_platform_admin: true }, { ...goodProfile, tenant_id: 'other-tenant' }, null]) {
    const server = authorizedServer(profile)
    const { authorizeManualInvoices } = loadTs('src/lib/server/manual-invoices.ts', { '@/src/lib/supabase/server': { createClient: async () => server } })
    const call = () => authorizeManualInvoices(new Request('https://sari.forwarders.app/api/manual-invoices', { headers: headers() }))
    if (profile === goodProfile) assert.equal((await call()).tenant.id, tenant.id)
    else await assert.rejects(call, (error) => error.status === 403)
  }
  const { authorizeManualInvoices } = loadTs('src/lib/server/manual-invoices.ts', { '@/src/lib/supabase/server': { createClient: async () => authorizedServer(goodProfile, null) } })
  await assert.rejects(() => authorizeManualInvoices(new Request('https://sari.forwarders.app', { headers: headers() })), (error) => error.status === 401)
})

test('save API rejects incomplete documents and derives total before insert', async () => {
  const saved = []
  const server = authorizedServer()
  const baseFrom = server.from
  server.from = (table) => table === 'profiles' ? baseFrom(table) : {
    insert: (value) => { saved.push(value); return { select: () => ({ single: async () => ({ data: { ...value, id: 'saved-1' }, error: null }) }) } },
  }
  const { POST } = loadTs('src/app/api/manual-invoices/route.ts', { '@/src/lib/supabase/server': { createClient: async () => server } })
  const incomplete = await POST(new Request('https://sari.forwarders.app/api/manual-invoices', { method: 'POST', headers: headers(), body: JSON.stringify(blankManualInvoice()) }))
  assert.equal(incomplete.status, 400); assert.equal(saved.length, 0)
  const data = { ...blankManualInvoice(), invoice_number: '131326', bill_to_name: 'Client', items: [{ description: 'Freight', amount: '3300.00' }], total: 1, tenant_id: 'evil' }
  for (const date_format of ['mdy', 'dmy']) {
    const response = await POST(new Request('https://sari.forwarders.app/api/manual-invoices', { method: 'POST', headers: headers(), body: JSON.stringify({ ...data, date_format }) }))
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(saved.at(-1).data.date_format, date_format)
    assert.equal((await response.json()).document.data.date_format, date_format)
  }
  const invalid = await POST(new Request('https://sari.forwarders.app/api/manual-invoices', { method: 'POST', headers: headers(), body: JSON.stringify({ ...data, date_format: 'unexpected' }) }))
  assert.equal(invalid.status, 400); assert.equal(saved.length, 2)
  assert.equal(saved[0].total, 3300); assert.equal(saved[0].tenant_id, tenant.id); assert.equal(saved[0].created_by, 'user-1')
})

test('OCR API rejects fake files and exhausted quotas before invoking a provider', async () => {
  const previousKey = process.env.OPENAI_API_KEY
  const previousEnabled = process.env.MANUAL_INVOICE_OCR_ENABLED
  process.env.OPENAI_API_KEY = 'test-key'; process.env.MANUAL_INVOICE_OCR_ENABLED = 'true'
  let claims = 0; let providerCalls = 0
  try {
    const server = authorizedServer()
    server.rpc = async () => { claims++; return { data: false, error: null } }
    const { POST } = loadTs('src/app/api/manual-invoices/ocr/route.ts', {
      '@/src/lib/supabase/server': { createClient: async () => server },
      '@/src/lib/server/manual-invoice-ocr': { extractManualInvoice: async () => { providerCalls++; return {} } },
    })
    for (const [bytes, expected] of [['<html>fake PDF</html>', 415], ['%PDF-1.7', 429]]) {
      const form = new FormData(); form.set('file', new File([bytes], 'scan.pdf', { type: 'application/pdf' }))
      const response = await POST(new Request('https://sari.forwarders.app/api/manual-invoices/ocr', { method: 'POST', headers: headers(), body: form }))
      assert.equal(response.status, expected)
    }
    assert.equal(claims, 1); assert.equal(providerCalls, 0)
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey
    if (previousEnabled === undefined) delete process.env.MANUAL_INVOICE_OCR_ENABLED; else process.env.MANUAL_INVOICE_OCR_ENABLED = previousEnabled
  }
})
