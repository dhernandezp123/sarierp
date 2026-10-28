import test from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { createHash } from 'node:crypto'
import loadTs from './load-ts.mjs'
import { exerciseRoute } from './email-route-fixture.mjs'

const { EMAIL_LEASE_MS, EMAIL_REPLAY_MS, EMAIL_TIMEOUT_MS } = loadTs('src/lib/server/email-delivery.ts', { 'server-only': {} })
const row = (overrides = {}) => ({
  id: 'delivery', status: 'processing', attempts: 1, tenant_id: 'tenant-sari',
  updated_at: new Date(Date.now() - EMAIL_LEASE_MS - 1000).toISOString(),
  first_attempt_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  request_body: '{"from":"sender@example.invalid","to":["original@example.invalid"],"subject":"Frozen","text":"Original"}',
  provider_key: 'original-key', lease_token: 'original-token', retry_authorized: false,
  provider_credential_hash: createHash('sha256').update('mock').digest('hex'),
  recipient_email: 'original@example.invalid', resend_message_id: null,
  ...overrides,
})

for (const kind of ['miami', 'support']) {
  test(`${kind}: processing activo devuelve conflicto en curso; sent requiere evidencia persistida`, async () => {
    for (const existingDelivery of [row({ updated_at: new Date().toISOString() }), row({ status: 'sent', resend_message_id: 'accepted-id' })]) {
      const r = await exerciseRoute(kind, { existingDelivery })
      assert.equal(r.providerCalls.length + r.inserts.length + r.updates.length, 0)
      if (existingDelivery.status === 'sent') assert.deepEqual(r.body, { ok: true, alreadySent: true })
      else { assert.equal(r.response.status, 409); assert.equal(r.body.ok, false); assert.equal(r.body.inProgress, true); assert.equal(r.body.alreadySent, undefined) }
    }
    const noEvidence = await exerciseRoute(kind, { existingDelivery: row({ status: 'sent' }) })
    assert.equal(noEvidence.body.uncertain, true)
    assert.equal(noEvidence.body.alreadySent, undefined)
    assert.equal(noEvidence.providerCalls.length, 0)
    assert.equal(noEvidence.deliveryState.status, 'uncertain')
  })

  test(`${kind}: recupera lease vencido y resultado incierto usando bytes/clave originales`, async () => {
    for (const status of ['processing', 'uncertain', 'failed']) {
      const existingDelivery = row({ status })
      const r = await exerciseRoute(kind, { existingDelivery, providerStatus: 200, providerBody: '{"id":"original-provider-id"}' })
      assert.equal(r.body.sent, true)
      assert.equal(r.providerCalls.length, 1)
      assert.equal(r.providerCalls[0].body, existingDelivery.request_body)
      assert.equal(r.providerCalls[0].headers['Idempotency-Key'], 'original-key')
      assert.equal(r.deliveryState.attempts, 2)
      assert.equal(r.deliveryState.first_attempt_at, existingDelivery.first_attempt_at)
      assert.ok(r.updates[0].conditions.some(([f, v]) => f === 'updated_at' && v === existingDelivery.updated_at))
      assert.ok(r.updates.at(-1).conditions.some(([f, v]) => f === 'lease_token' && v === r.deliveryState.lease_token))
    }
  })

  test(`${kind}: legacy, reloj inválido y ventana agotada requieren conciliación sin proveedor`, async () => {
    for (const existingDelivery of [
      row({ request_body: null }), row({ provider_key: null }), row({ first_attempt_at: null }),
      row({ provider_credential_hash: null }), row({ provider_credential_hash: 'another-account-or-key' }),
      row({ first_attempt_at: 'invalid' }), row({ first_attempt_at: new Date(Date.now() + 60_000).toISOString() }),
      row({ first_attempt_at: new Date(Date.now() - EMAIL_REPLAY_MS).toISOString() }),
      row({ status: 'failed', request_body: null, first_attempt_at: null }),
    ]) {
      const r = await exerciseRoute(kind, { existingDelivery })
      assert.equal(r.response.status, 409)
      assert.equal(r.body.uncertain, true)
      assert.equal(r.body.sent, undefined)
      assert.equal(r.providerCalls.length, 0)
      assert.equal(r.deliveryState.attempts, existingDelivery.attempts)
      assert.equal(r.deliveryState.status, 'uncertain')
    }
    // Database latency can exhaust the window after a successful reservation.
    mock.timers.enable({ apis: ['Date'], now: Date.now() })
    try {
      const delayed = await exerciseRoute(kind, { existingDelivery: row(), afterClaim: () => mock.timers.tick(EMAIL_REPLAY_MS) })
      assert.equal(delayed.response.status, 409)
      assert.equal(delayed.body.uncertain, true)
      assert.equal(delayed.providerCalls.length, 0)
      assert.equal(delayed.deliveryState.status, 'uncertain')
    } finally { mock.timers.reset() }
  })

  test(`${kind}: errores de lectura/reserva o perder CAS no envían ni declaran sent`, async () => {
    for (const options of [
      { lookupError: true }, { claimError: { code: '42501' } }, { claimError: { code: '23505' } },
      { existingDelivery: row(), loseClaim: true }, { existingDelivery: row(), claimError: { code: '42501' } },
    ]) {
      const r = await exerciseRoute(kind, options)
      assert.ok([409, 503].includes(r.response.status))
      assert.equal(r.body.ok, false)
      assert.equal(r.body.alreadySent, undefined)
      assert.equal(r.providerCalls.length, 0)
    }
  })

  test(`${kind}: aceptación con auditoría fallida o lease reemplazado nunca confirma envío`, async () => {
    for (const options of [{ finalError: true }, { finalNoRow: true }, { finalThrows: true },
      { beforeFinish: delivery => { delivery.lease_token = 'new-owner' } }]) {
      const r = await exerciseRoute(kind, { ...options, providerStatus: 200, providerBody: '{"id":"accepted-id"}' })
      assert.equal(r.response.status, 503)
      assert.equal(r.body.uncertain, true)
      assert.equal(r.body.ok, false)
      assert.equal(r.body.sent, undefined)
      assert.equal(r.deliveryState.status, 'processing')
      assert.equal(r.providerCalls.length, 1)
    }
  })

  test(`${kind}: timeout/red/200 sin ID/409/5xx dejan uncertain; rechazo explícito deja failed`, async () => {
    for (const options of [
      { provider: async () => { throw Error('response lost after provider acceptance') } },
      { providerStatus: 200, providerBody: '<html>Proxy</html>' },
      { providerStatus: 200, providerBody: '{"id":123}' },
      { providerStatus: 409 }, { providerStatus: 408 }, { providerStatus: 500 },
      { providerStatus: 422, providerBody: '{"message":"Invalid recipient"}' },
    ]) {
      const r = await exerciseRoute(kind, options)
      assert.equal(r.response.status, 502)
      assert.equal(r.deliveryState.status, options.providerStatus === 422 ? 'failed' : 'uncertain')
      assert.equal(r.body.sent, undefined)
    }
  })

  test(`${kind}: timeout incluye cuerpo de respuesta y aborta sin esperar al proveedor`, async () => {
    // Tick only the actual deadline; provider remains unresolved even if it ignores abort.
    mock.timers.enable({ apis: ['setTimeout'] })
    try {
      let options
      const running = exerciseRoute(kind, { provider: async request => {
        options = request
        return { ok: true, status: 200, json: () => new Promise(() => {}) }
      } })
      for (let i = 0; !options && i < 80; i++) await Promise.resolve()
      assert.ok(options)
      // Allow response body reading and deadline registration to start.
      await Promise.resolve()
      mock.timers.tick(EMAIL_TIMEOUT_MS)
      const r = await running
      assert.equal(r.response.status, 502)
      assert.equal(r.body.uncertain, true)
      assert.equal(r.deliveryState.status, 'uncertain')
      assert.equal(options.signal.aborted, true)
    } finally { mock.timers.reset() }
  })

  test(`${kind}: reentrada tras conexión perdida conserva snapshot aunque cambie el contacto`, async () => {
    const r = await exerciseRoute(kind, {
      requests: 2,
      provider: async (_, call) => { if (call === 1) throw Error('response lost'); return Response.json({ id: 'one-accepted-email' }) },
      betweenRequests: (_delivery, rows) => {
        rows.miami_packages.clientes.email_1 = 'changed@example.invalid'
        rows.support_settings.support_email = 'changed@example.invalid'
      },
    })
    assert.equal(r.responses[0].body.uncertain, true)
    assert.equal(r.responses[1].body.sent, true)
    assert.equal(r.inserts.length, 1)
    assert.equal(r.providerCalls[0].body, r.providerCalls[1].body)
    assert.equal(r.providerCalls[0].headers['Idempotency-Key'], r.providerCalls[1].headers['Idempotency-Key'])
    assert.equal(r.deliveryState.attempts, 2)
    assert.equal(r.deliveryState.recipient_email, kind === 'miami' ? 'client@example.invalid' : 'support@example.invalid')
  })

  test(`${kind}: autorización manual de no aceptación permite nueva clave y respeta cinco intentos`, async () => {
    const authorized = row({ status: 'failed', request_body: null, provider_key: null, first_attempt_at: null, retry_authorized: true })
    const r = await exerciseRoute(kind, { existingDelivery: authorized, providerStatus: 200, providerBody: '{"id":"new-email"}' })
    assert.equal(r.body.sent, true)
    assert.notEqual(r.providerCalls[0].headers['Idempotency-Key'], 'original-key')
    assert.equal(r.deliveryState.retry_authorized, false)
    for (const existingDelivery of [row({ attempts: 5 }), { ...authorized, attempts: 5 }]) {
      const capped = await exerciseRoute(kind, { existingDelivery })
      assert.equal(capped.response.status, 429)
      assert.equal(capped.providerCalls.length, 0)
      assert.equal(capped.deliveryState.attempts, 5)
    }
  })
}
