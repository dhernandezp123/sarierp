import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const originalFetch = globalThis.fetch
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key'
})

afterEach(() => {
  globalThis.fetch = originalFetch

  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl

  if (originalAnonKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey
})

test('el cliente Supabase del navegador evita reutilizar respuestas entre dominios', async () => {
  let clientOptions
  let receivedInput
  let receivedInit

  globalThis.fetch = async (input, init) => {
    receivedInput = input
    receivedInit = init
    return new Response(null, { status: 204 })
  }

  const { fetchWithoutHttpCache } = loadTs('src/lib/supabase/client.ts', {
    '@supabase/ssr': {
      createBrowserClient: (_url, _key, options) => {
        clientOptions = options
        return { kind: 'test-client' }
      },
    },
  })

  assert.equal(clientOptions.global.fetch, fetchWithoutHttpCache)

  await clientOptions.global.fetch('https://project.supabase.co/rest/v1/clientes', {
    method: 'GET',
    headers: { Origin: 'https://sari.forwarders.app' },
    cache: 'force-cache',
  })

  assert.equal(receivedInput, 'https://project.supabase.co/rest/v1/clientes')
  assert.equal(receivedInit.method, 'GET')
  assert.deepEqual(receivedInit.headers, {
    Origin: 'https://sari.forwarders.app',
  })
  assert.equal(receivedInit.cache, 'no-store')
})
