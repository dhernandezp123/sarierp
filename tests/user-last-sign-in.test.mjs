import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

async function requestConnections({
  user = { id: 'admin' },
  authError = null,
  profile = { rol: 'Admin', status: 'Aprobado', is_active: true },
  profileError = null,
  pages = [{ data: { users: [], nextPage: null }, error: null }],
  serviceKey = 'mock-server-key',
} = {}) {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY
  const calls = []
  let adminClients = 0
  const query = {
    select() { return query },
    eq(column, value) { assert.equal(column, 'id'); assert.equal(value, user.id); return query },
    single: async () => ({ data: profile, error: profileError }),
  }
  try {
    const { GET } = loadTs('src/app/api/admin/users/last-sign-in/route.ts', {
      '@/src/lib/supabase/server': {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user }, error: authError }) },
          from(table) { assert.equal(table, 'profiles'); return query },
        }),
      },
      '@supabase/supabase-js': {
        createClient(_url, key, options) {
          adminClients++
          assert.equal(key, 'mock-server-key')
          assert.equal(options.auth.persistSession, false)
          return { auth: { admin: {
            async listUsers(options) {
              calls.push(options)
              const result = pages[options.page - 1]
              if (result instanceof Error) throw result
              assert.ok(result, 'No debe consultar páginas inexistentes')
              return result
            },
          } } }
        },
      },
    })
    const response = await GET()
    return { status: response.status, body: await response.json(), headers: response.headers, calls, adminClients }
  } finally {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey
  }
}

test('Conexiones: exige sesión válida antes de crear el cliente privilegiado', async () => {
  for (const input of [{ user: null }, { authError: new Error('expired') }]) {
    const result = await requestConnections(input)
    assert.equal(result.status, 401)
    assert.equal(result.adminClients, 0)
  }
})

test('Conexiones: solo Admin aprobado y activo puede consultar Auth', async () => {
  for (const profile of [
    null,
    { rol: 'Ventas', status: 'Aprobado', is_active: true },
    { rol: 'Cliente', status: 'Aprobado', is_active: true },
    { rol: 'Admin', status: 'Pendiente', is_active: true },
    { rol: 'Admin', status: 'Rechazado', is_active: true },
    { rol: 'Admin', status: 'Aprobado', is_active: false },
    { rol: 'Admin', status: 'Aprobado', is_active: null },
  ]) {
    const result = await requestConnections({ profile })
    assert.equal(result.status, 403)
    assert.equal(result.adminClients, 0)
    assert.equal(result.body.users, undefined)
  }
  const result = await requestConnections({ profileError: new Error('database unavailable') })
  assert.equal(result.status, 403)
  assert.equal(result.adminClients, 0)
})

test('Conexiones: recorre páginas, conserva fechas históricas y excluye metadata privada', async () => {
  const timestamp = '2026-09-08T16:34:00Z'
  const result = await requestConnections({ pages: [
    { data: { users: [{ id: 'first', last_sign_in_at: timestamp, email: 'private@example.invalid', user_metadata: { secret: true } }], nextPage: 2 }, error: null },
    { data: { users: [{ id: 'invited' }], nextPage: null }, error: null },
  ] })
  assert.equal(result.status, 200)
  assert.deepEqual(result.calls, [{ page: 1, perPage: 1000 }, { page: 2, perPage: 1000 }])
  assert.deepEqual(result.body, { users: [{ id: 'first', last_sign_in_at: timestamp }, { id: 'invited', last_sign_in_at: null }] })
  assert.equal(result.headers.get('cache-control'), 'private, no-store')
})

test('Conexiones: los fallos no se confunden con usuarios sin inicio de sesión', async () => {
  for (const failure of [{ data: null, error: new Error('upstream secret') }, new Error('upstream secret')]) {
    const result = await requestConnections({ pages: [
      { data: { users: [{ id: 'first' }], nextPage: 2 }, error: null },
      failure,
    ] })
    assert.ok(result.status >= 500)
    assert.equal(result.body.users, undefined)
    assert.doesNotMatch(JSON.stringify(result.body), /upstream secret/)
    assert.equal(result.headers.get('cache-control'), 'private, no-store')
  }
  const result = await requestConnections({ serviceKey: null })
  assert.equal(result.status, 503)
  assert.equal(result.adminClients, 0)
})

test('Conexiones: avanza sin repetir páginas aunque el SDK trunque nextPage a un dígito', async () => {
  const pages = Array.from({ length: 11 }, (_, index) => ({
    data: { users: [{ id: `user-${index}` }], nextPage: index === 10 ? null : Number(String(index + 2)[0]) },
    error: null,
  }))
  const result = await requestConnections({ pages })
  assert.equal(result.status, 200)
  assert.equal(result.body.users.length, 11)
  assert.deepEqual(result.calls.map(({ page }) => page), Array.from({ length: 11 }, (_, index) => index + 1))
})
