import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { exerciseRoute } from './email-route-fixture.mjs'
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

for (const kind of ['miami', 'support']) {
  test(`${kind}: una respuesta HTML 502 deja resultado incierto, no confirma rechazo ni envío`, async () => {
    const result = await exerciseRoute(kind)
    assert.equal(result.response.status, 502)
    assert.equal(result.updates.at(-1)?.status, 'uncertain')
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

for (const kind of ['miami', 'support']) {
  test(`${kind}: rechaza recursos de otro tenant antes de enviar correo`, async () => {
    const result = await exerciseRoute(kind, {
      callerTenant: 'tenant-sari',
      resourceTenant: 'tenant-mya',
    })
    assert.ok([403, 404].includes(result.response.status))
    assert.equal(result.providerCalls.length, 0)
    assert.equal(result.updates.length, 0)
  })
}
