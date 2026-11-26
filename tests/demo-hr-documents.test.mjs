import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

test('Demo blocks HR document uploads before session, file parsing or service-role access', async () => {
  const forbidden = () => { throw new Error('Demo must not access private upload services') }
  const { POST } = loadTs('src/app/api/hr/documents/route.ts', {
    '@/src/lib/demo-environment': { IS_DEMO_ENVIRONMENT: true },
    '@/src/lib/server/hr-access': { requireHrSession: forbidden },
    '@supabase/supabase-js': { createClient: forbidden },
  })
  const response = await POST(new Request('https://demo.forwarders.app/api/hr/documents', { method: 'POST' }))
  assert.equal(response.status, 403)
  assert.match((await response.json()).error, /Demo/)
})
