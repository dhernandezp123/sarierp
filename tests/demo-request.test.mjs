import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const validLead = { nombre: '  Carlos  Mendoza ', empresa: ' Agencia Demo ', email: ' demo@example.invalid ', telefono: ' +504 0000-0000 ' }

test('demo validation normalizes the saved snapshot and rejects invalid types and oversized fields', () => {
  const { validateDemoLead } = loadTs('src/lib/demo-lead.ts')
  const result = validateDemoLead(validLead)
  assert.equal(result.valid, true)
  assert.deepEqual(result.lead, { nombre: 'Carlos  Mendoza', empresa: 'Agencia Demo', email: 'demo@example.invalid', telefono: '+504 0000-0000' })
  assert.equal(result.lead.nombre.split(/\s+/)[0], 'Carlos')
  for (const [key, value] of [['nombre', ' '], ['empresa', 'a'.repeat(161)], ['email', 'invalid'], ['telefono', {}]]) {
    assert.ok(validateDemoLead({ ...validLead, [key]: value }).errors[key])
  }
  assert.equal(validateDemoLead(null).valid, false)
})

async function exercise({ payload = validLead, rawBody, origin = 'https://forwarders.app', host = 'forwarders.app', contentType = 'application/json', data = true, error = null, ip = '203.0.113.8', vercel = '1' } = {}) {
  const calls = []
  const { POST } = loadTs('src/app/api/demo-request/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@supabase/supabase-js': { createClient: () => ({ rpc: async (...args) => { calls.push(args); return { data, error } } }) },
  })
  const previous = { key: process.env.SUPABASE_SERVICE_ROLE_KEY, url: process.env.NEXT_PUBLIC_SUPABASE_URL, vercel: process.env.VERCEL }
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-key-never-remote'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:59999'
  process.env.VERCEL = vercel
  try {
    const headers = { 'content-type': contentType }
    if (origin) headers.origin = origin
    if (ip) headers['x-vercel-forwarded-for'] = ip
    const response = await POST(new Request(`https://${host}/api/demo-request`, {
      method: 'POST', headers, body: rawBody ?? JSON.stringify(payload),
    }))
    return { response, body: await response.json(), calls }
  } finally {
    for (const [name, value] of [['SUPABASE_SERVICE_ROLE_KEY', previous.key], ['NEXT_PUBLIC_SUPABASE_URL', previous.url], ['VERCEL', previous.vercel]]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

test('demo receiver rejects foreign origins, tenant hosts, invalid JSON and oversized chunked bodies before DB', async () => {
  for (const [options, expected] of [
    [{ origin: 'https://attacker.invalid' }, 403], [{ origin: null }, 403],
    [{ host: 'sari.forwarders.app' }, 404], [{ contentType: 'text/plain' }, 415],
    [{ rawBody: '{' }, 400], [{ payload: [] }, 400], [{ payload: { ...validLead, email: 'invalid' } }, 400],
    [{ rawBody: JSON.stringify({ nombre: 'x'.repeat(5000) }) }, 413],
  ]) {
    const result = await exercise(options)
    assert.equal(result.response.status, expected)
    assert.equal(result.calls.length, 0)
  }
})

test('server honeypot accepts generically without creating a lead even when client filtering is skipped', async () => {
  const result = await exercise({ payload: { ...validLead, website: 'https://bot.invalid' } })
  assert.equal(result.response.status, 202)
  assert.deepEqual(result.body, { ok: true })
  assert.equal(result.calls.length, 0)
})

test('valid leads reach only the service RPC with a keyed hash and normalized fields', async () => {
  const result = await exercise()
  assert.equal(result.response.status, 202)
  assert.equal(result.response.headers.get('cache-control'), 'no-store')
  assert.equal(result.calls.length, 1)
  assert.equal(result.calls[0][0], 'submit_demo_lead')
  assert.match(result.calls[0][1].p_request_key, /^[a-f0-9]{64}$/)
  assert.equal(result.calls[0][1].p_lead.nombre, 'Carlos  Mendoza')
  assert.doesNotMatch(JSON.stringify(result.body), /203\.0\.113|unit-test-key/)
  assert.equal((await exercise()).calls[0][1].p_request_key, result.calls[0][1].p_request_key)
  assert.notEqual((await exercise({ ip: '203.0.113.9' })).calls[0][1].p_request_key, result.calls[0][1].p_request_key)
})

test('rate limits are recoverable and missing trusted IP or DB failures never become success', async () => {
  const limited = await exercise({ data: false })
  assert.equal(limited.response.status, 429)
  assert.equal(limited.response.headers.get('retry-after'), '900')
  for (const options of [{ ip: null }, { ip: 'forged, 203.0.113.8' }, { error: { message: 'private database details' } }, { data: null }]) {
    const result = await exercise(options)
    assert.equal(result.response.status, 503)
    assert.doesNotMatch(JSON.stringify(result.body), /private database|unit-test-key/)
  }
})
