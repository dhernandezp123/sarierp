import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

async function invite({
  profile = {
    rol: 'Admin', status: 'Aprobado', is_active: true,
    is_platform_admin: false, tenant_id: 'tenant-sari',
  },
  domain = { hostname: 'sari.forwarders.app' },
} = {}) {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  const invitations = []
  const updates = []

  const adminClient = {
    auth: { admin: {
      async inviteUserByEmail(email, options) {
        invitations.push({ email, options })
        return { data: { user: { id: 'invited-user' } }, error: null }
      },
    } },
    from(table) {
      let updateValue = null
      const query = {
        select() { return query },
        update(value) { updateValue = value; updates.push(value); return query },
        eq() { return query },
        single: async () => ({ data: table === 'profiles' ? profile : domain, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data: updateValue ? { id: 'invited-user' } : null, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }

  try {
    const { POST } = loadTs('src/app/api/admin/invite/route.ts', {
      '@supabase/supabase-js': {
        createClient(_url, key) {
          if (key === 'anon') {
            return { auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) } }
          }
          return adminClient
        },
      },
    })
    const response = await POST(new Request('http://localhost/api/admin/invite', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.invalid', rol: 'Ventas' }),
    }))
    return { response, body: await response.json(), invitations, updates }
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url
    if (previous.anon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.anon
    if (previous.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.service
  }
}

test('Invitación: fija tenant y dominio principal tanto en Auth como en profiles', async () => {
  const result = await invite()
  assert.equal(result.response.status, 200)
  assert.equal(result.invitations.length, 1)
  assert.equal(result.invitations[0].options.redirectTo, 'https://sari.forwarders.app/onboarding')
  assert.equal(result.invitations[0].options.data.tenant_id, 'tenant-sari')
  assert.equal(result.updates[0].tenant_id, 'tenant-sari')
})

test('Invitación: un Admin sin tenant o de plataforma no usa service_role para invitar', async () => {
  for (const profile of [
    { rol: 'Admin', status: 'Aprobado', is_active: true, is_platform_admin: false, tenant_id: null },
    { rol: 'Admin', status: 'Aprobado', is_active: true, is_platform_admin: true, tenant_id: null },
  ]) {
    const result = await invite({ profile })
    assert.equal(result.response.status, 403)
    assert.equal(result.invitations.length, 0)
  }
})
