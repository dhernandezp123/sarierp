import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { exerciseRoute } from './email-route-fixture.mjs'

test('diagnostic output never serializes payloads, exceptions or invalid identifiers', () => {
  const lines = [], original = console.error
  console.error = line => lines.push(JSON.parse(line))
  try {
    const { reportDiagnostic } = loadTs('src/lib/diagnostics.ts')
    const reference = reportDiagnostic('activity_log_failed', {
      entityId: 'secret@example.com', tenantId: 'Bearer secret', code: 'private message',
      metadata: { token: 'secret' }, error: new Error('private body'),
    })
    assert.match(reference, /^[a-f\d-]{36}$/)
    assert.deepEqual(Object.keys(lines[0]).sort(), ['code', 'entity_id', 'event', 'reference', 'result', 'tenant_id', 'timestamp'])
    assert.equal(lines[0].entity_id, null)
    assert.equal(lines[0].tenant_id, null)
    assert.equal(lines[0].code, 'UNEXPECTED')
    assert.doesNotMatch(JSON.stringify(lines), /secret|private|Bearer/)
  } finally { console.error = original }
})

test('auxiliary activity logging returns an explicit failure without retrying the business write', async () => {
  const warnings = [], logs = [], writes = []
  const original = console.error
  console.error = line => logs.push(JSON.parse(line))
  try {
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
      from: () => ({ insert: async row => { writes.push(row); return { error: { code: '42501', message: 'private details' } } } }) }
    const { createActivityLog } = loadTs('src/lib/activity-logger.ts', {
      '@/src/lib/supabase/client': { supabase: client }, sonner: { toast: { warning: message => warnings.push(message) } },
    })
    const result = await createActivityLog({ module: 'quotations', action: 'test', description: 'private business detail' })
    assert.equal(result.ok, false)
    assert.equal(writes.length, 1)
    assert.match(warnings[0], new RegExp(result.reference))
    assert.equal(logs[0].code, '42501')
    assert.doesNotMatch(JSON.stringify(logs), /private/)
  } finally { console.error = original }
})

test('mail API failures return the same support reference as the sanitized server log', async () => {
  const lines = [], original = console.error
  console.error = line => { try { lines.push(JSON.parse(line)) } catch {} }
  try {
    for (const kind of ['miami', 'support']) {
      const result = await exerciseRoute(kind, { environmentThrows: true })
      assert.equal(result.response.status, 503)
      assert.equal(result.body.reference, lines.at(-1).reference)
      assert.equal(result.response.headers.get('X-Request-ID'), result.body.reference)
      assert.ok(result.body.error.includes(result.body.reference))
      assert.equal(lines.at(-1).code, 'ENVIRONMENT_UNAVAILABLE')
    }
  } finally { console.error = original }
})

test('an uncertain provider result has a reference without changing retry safety', async () => {
  const lines = [], original = console.error
  console.error = line => lines.push(JSON.parse(line))
  try {
    const result = await exerciseRoute('miami', { providerStatus: 502 })
    assert.equal(result.response.status, 502)
    assert.equal(result.body.uncertain, true)
    assert.equal(result.body.reference, lines.at(-1).reference)
    assert.equal(result.providerCalls.length, 1)
  } finally { console.error = original }
})
