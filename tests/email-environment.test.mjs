import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { exerciseRoute } from './email-route-fixture.mjs'

const { readEmailEnvironment, EmailEnvironmentUnavailableError } = loadTs('src/lib/server/email-environment.ts', { 'server-only': {} })
const { isIntakeDemo } = loadTs('src/lib/server/outlook-intake.ts', { 'server-only': {} })

async function withEnvironment(values, run) {
  const defaults = { APP_ENV: undefined, NEXT_PUBLIC_APP_ENV: undefined, OUTBOUND_EMAIL_ENABLED: 'true', SARI_OUTLOOK_RUN_SECRET: 'aud07-test-secret-at-least-32-characters' }
  const settings = { ...defaults, ...values }
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(settings)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return await run()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function environmentClient(result, { throws = false, rpcResult = { data: false, error: null } } = {}) {
  const calls = []
  const client = {
    calls,
    from(table) {
      calls.push(['from', table])
      const query = {
        select(fields) { calls.push(['select', fields]); return query },
        eq(field, value) { calls.push(['eq', field, value]); return query },
        async maybeSingle() { if (throws) throw new Error('fixture connection failed'); return typeof result === 'function' ? result() : result },
      }
      return query
    },
    async rpc(name) { calls.push(['rpc', name]); return rpcResult },
  }
  return client
}

const invalidRows = [
  { data: null, error: { message: 'database unavailable' } },
  { data: null, error: null },
  { data: { environment: 'production' }, error: { code: 'PGRST116', message: 'ambiguous row' } },
  { data: {}, error: null },
  ...['staging', 'trial', 'Production', ' production ', '', null, true, 0].map(environment => ({ data: { environment }, error: null })),
  { data: [{ environment: 'production' }], error: null },
]

test('shared guard requires a verified singleton value, including when local flags say production', async () => {
  await withEnvironment({ APP_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production' }, async () => {
    for (const result of invalidRows) {
      const client = environmentClient(result)
      await assert.rejects(readEmailEnvironment(client), EmailEnvironmentUnavailableError)
      assert.deepEqual(client.calls, [['from', 'platform_environment'], ['select', 'environment'], ['eq', 'singleton', true]])
    }
    await assert.rejects(readEmailEnvironment(environmentClient(null, { throws: true })), EmailEnvironmentUnavailableError)
  })
})

test('either normalized local demo flag vetoes mail without a database lookup', async () => {
  for (const variable of ['APP_ENV', 'NEXT_PUBLIC_APP_ENV']) {
    await withEnvironment({ [variable]: ' DEMO ' }, async () => {
      const client = environmentClient(null, { throws: true })
      assert.equal(await readEmailEnvironment(client), 'demo')
      assert.equal(client.calls.length, 0)
    })
  }
})

test('verified production is allowed; database demo overrides local production and decisions are not cached', async () => {
  await withEnvironment({ APP_ENV: 'production' }, async () => {
    let data = { environment: 'production' }
    const client = environmentClient(() => ({ data, error: null }))
    assert.equal(await readEmailEnvironment(client), 'production')
    data = { environment: 'demo' }
    assert.equal(await readEmailEnvironment(client), 'demo')
    assert.equal(client.calls.filter(call => call[0] === 'from').length, 2)
  })
})

for (const kind of ['miami', 'support']) {
  test(`${kind}: unknown environment returns 503 before provider, audit writes or delivery claims`, async () => {
    for (const environmentResult of invalidRows) {
      const result = await exerciseRoute(kind, { environmentResult, appEnv: 'production', publicAppEnv: 'production' })
      assert.equal(result.response.status, 503)
      assert.equal(result.body.ok, false)
      assert.match(result.body.error, /verificar el ambiente/)
      assert.equal(result.providerCalls.length, 0)
      assert.equal(result.inserts.length, 0)
      assert.equal(result.updates.length, 0)
      assert.equal(result.reads.includes(kind === 'miami' ? 'client_email_deliveries' : 'support_notification_outbox'), false)
    }
    const thrown = await exerciseRoute(kind, { environmentThrows: true })
    assert.equal(thrown.response.status, 503)
    assert.equal(thrown.providerCalls.length + thrown.inserts.length + thrown.updates.length, 0)
  })

  test(`${kind}: demo in either flag or the database preserves its response and creates no delivery`, async () => {
    for (const options of [
      { appEnv: ' DEMO ', environmentThrows: true },
      { publicAppEnv: 'DeMo', environmentResult: { data: null, error: { message: 'down' } } },
      { appEnv: 'production', publicAppEnv: 'production', environmentResult: { data: { environment: 'demo' }, error: null } },
    ]) {
      const result = await exerciseRoute(kind, options)
      assert.equal(result.response.status, kind === 'miami' ? 403 : 200)
      if (kind === 'support') assert.deepEqual(result.body, { ok: true, skipped: true, reason: 'demo' })
      assert.equal(result.providerCalls.length + result.inserts.length + result.updates.length, 0)
    }
  })

  test(`${kind}: verified production still requires the exact outbound opt-in`, async () => {
    for (const outbound of ['false', 'TRUE', ' true ', '']) {
      const result = await exerciseRoute(kind, { outbound })
      assert.equal(result.response.status, 503)
      assert.equal(result.providerCalls.length + result.inserts.length + result.updates.length, 0)
    }
    const missing = await exerciseRoute(kind, { outboundMissing: true })
    assert.equal(missing.response.status, 503)
    assert.equal(missing.providerCalls.length + missing.inserts.length + missing.updates.length, 0)
    const valid = await exerciseRoute(kind, { providerBody: '{"id":"aud07-mock-id"}', providerStatus: 200 })
    assert.equal(valid.response.status, 200)
    assert.equal(valid.body.sent, true)
    assert.equal(valid.providerCalls.length, 1)
    assert.equal(valid.inserts.length, 1)
    assert.equal(valid.updates.at(-1).status, 'sent')
    assert.ok(valid.providerCalls[0].headers['Idempotency-Key'])
  })

  test(`${kind}: authentication and profile rejection occur before environment access`, async () => {
    for (const options of [{ authenticated: false }, { callerRole: 'Cliente' }, { callerStatus: 'Pendiente' }, { callerActive: false }]) {
      const result = await exerciseRoute(kind, { ...options, environmentThrows: true })
      assert.equal(result.response.status, options.authenticated === false ? 401 : 403)
      assert.equal(result.reads.includes('platform_environment'), false)
      assert.equal(result.providerCalls.length + result.inserts.length + result.updates.length, 0)
    }
  })
}

test('Outlook uses the verified shared environment and requires a boolean legacy RPC result', async () => {
  await withEnvironment({}, async () => {
    for (const rpcResult of [{ data: null, error: null }, { data: 'false', error: null },
      { data: {}, error: null }, { data: false, error: { message: 'RPC failed' } }]) {
      await assert.rejects(isIntakeDemo(environmentClient({ data: { environment: 'production' }, error: null }, { rpcResult })), /verificar el ambiente/)
    }
    assert.equal(await isIntakeDemo(environmentClient({ data: { environment: 'production' }, error: null })), false)
    assert.equal(await isIntakeDemo(environmentClient({ data: { environment: 'production' }, error: null }, { rpcResult: { data: true, error: null } })), true)
    const demo = environmentClient({ data: { environment: 'demo' }, error: null }, { rpcResult: { data: null, error: { message: 'must not run' } } })
    assert.equal(await isIntakeDemo(demo), true)
    assert.equal(demo.calls.some(call => call[0] === 'rpc'), false)
  })
})

for (const action of ['run', 'check']) {
  test(`Outlook ${action}: environment failure/demo blocks token, Graph and business mutations`, async () => {
    await withEnvironment({}, async () => {
      for (const scenario of ['error', 'missing', 'unknown', 'demo', 'rpc-invalid']) {
        let tokenCalls = 0, graphCalls = 0
        const environment = scenario === 'error' ? { data: null, error: { message: 'db failed' } }
          : scenario === 'missing' ? { data: null, error: null }
            : { data: { environment: scenario === 'demo' ? 'demo' : scenario === 'unknown' ? 'staging' : 'production' }, error: null }
        const admin = environmentClient(environment, { rpcResult: { data: null, error: null } })
        const mocks = {
          'server-only': {},
          '@/src/lib/mail-intake': { ...loadTs('src/lib/mail-intake.ts'), OUTLOOK_INTAKE_STANDBY: false },
          '@/src/lib/server/outlook-intake': {
            intakeAdminClient: () => admin, isIntakeDemo,
            outlookToken: async () => { tokenCalls++; throw new Error('Token must not run') },
            graphRequest: async () => { graphCalls++; throw new Error('Graph must not run') },
          },
          '@/src/lib/supabase/server': { createClient: async () => ({
            auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
            from: () => ({ select() { return this }, single: async () => ({ data: { mailbox: loadTs('src/lib/mail-intake.ts').SARI_MAILBOX }, error: null }) }),
          }) },
        }
        const { POST } = loadTs(`src/app/api/integrations/outlook/${action}/route.ts`, mocks)
        const response = await POST(new Request('http://localhost/api/outlook', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.SARI_OUTLOOK_RUN_SECRET } }))
        assert.equal(response.status, scenario === 'demo' ? action === 'run' ? 200 : 403 : 503)
        assert.equal(tokenCalls + graphCalls, 0)
        assert.equal(admin.calls.some(call => call[0] === 'from' && call[1] !== 'platform_environment'), false)
      }
    })
  })
}
