import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { readEmailProviderResponse } = loadTs('src/lib/email-provider-response.ts')

test('Respuestas inválidas del proveedor se normalizan sin lanzar ni aceptar un ID inválido', async () => {
  for (const body of ['', '<html>Bad gateway</html>', 'null', '[]', '{"id":123,"message":{}}', '{"id":" "}']) {
    const result = await readEmailProviderResponse(new Response(body, { status: 502 }))
    assert.equal(result.id, undefined)
    assert.equal(typeof result.message, 'string')
  }
  const result = await readEmailProviderResponse(Response.json({ error: { message: 'Rate limit' } }, { status: 429 }))
  assert.equal(result.message, 'Rate limit')
})

async function exerciseRoute(kind, { demo = false, providerBody = '<html>Bad gateway</html>', providerStatus = 502 } = {}) {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock',
    SUPABASE_SERVICE_ROLE_KEY: 'mock', RESEND_API_KEY: 'mock', OUTBOUND_EMAIL_ENABLED: 'true',
    APP_ENV: demo ? 'demo' : 'test', NEXT_PUBLIC_APP_ENV: 'test',
  }
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  Object.assign(process.env, env)
  const originalFetch = globalThis.fetch
  const updates = [], providerCalls = []
  globalThis.fetch = async (_url, options) => {
    providerCalls.push(options)
    return new Response(providerBody, { status: providerStatus })
  }
  const profile = { id: 'user', rol: 'Admin', status: 'Aprobado', is_active: true, nombre: 'Test', apellido: '', email: 'test@example.invalid' }
  const rows = {
    profiles: profile,
    platform_environment: { environment: demo ? 'demo' : 'production' },
    support_tickets: { id: 'ticket', ticket_number: 'TEST-1', subject: 'Local', category: 'Bug', priority: 'Media', status: 'Abierto', created_by: 'user', creator: profile },
    support_settings: { enabled: true, support_email: 'support@example.invalid' },
    miami_packages: { id: 'package', tracking_number: 'LOCAL', status: 'Asignado', cliente_id: 'client', warehouse_number: 'WH-1', received_at: '2026-09-07T18:00:00Z', clientes: { nombre: 'Test', contacto: 'Test', email_1: 'client@example.invalid' } },
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
    from(table) {
      let inserted = false
      const result = () => ({ data: inserted ? { id: 'delivery', status: 'processing', attempts: 1 } : rows[table] ?? null, error: null })
      const query = {
        select() { return query }, eq() { return query },
        insert() { inserted = true; return query },
        update(value) { updates.push({ table, ...value }); return query },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }
      return query
    },
  }
  try {
    const route = kind === 'miami' ? 'src/app/api/miami/package-assignment-email/route.ts' : 'src/app/api/support/notify/route.ts'
    const { POST } = loadTs(route, { '@supabase/supabase-js': { createClient: () => client } })
    const response = await POST(new Request('http://localhost/api/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock' },
      body: JSON.stringify(kind === 'miami' ? { packageId: 'package' } : { ticketId: 'ticket', eventType: 'ticket_created' }),
    }))
    return { response, body: await response.json(), updates, providerCalls }
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

for (const kind of ['miami', 'support']) {
  test(`${kind}: una respuesta HTML deja el aviso en failed, no en processing`, async () => {
    const result = await exerciseRoute(kind)
    assert.equal(result.response.status, 502)
    assert.equal(result.updates.at(-1)?.status, 'failed')
    assert.match(result.updates.at(-1)?.error_message, /502/)
    assert.equal(result.providerCalls.length, 1)
    assert.ok(result.providerCalls[0].headers['Idempotency-Key'])
  })

  test(`${kind}: una confirmación válida conserva la auditoría de envío`, async () => {
    const result = await exerciseRoute(kind, { providerBody: '{"id":"resend-test-id"}', providerStatus: 200 })
    assert.equal(result.response.status, 200)
    assert.equal(result.body.sent, true)
    assert.equal(result.updates.at(-1)?.status, 'sent')
    assert.equal(result.updates.at(-1)?.resend_message_id, 'resend-test-id')
  })

  test(`${kind}: demo no llama al proveedor ni escribe una auditoría de envío`, async () => {
    const result = await exerciseRoute(kind, { demo: true })
    assert.equal(result.providerCalls.length, 0)
    assert.equal(result.updates.length, 0)
  })
}
