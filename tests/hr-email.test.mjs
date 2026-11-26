import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { hrEmailRequest } = loadTs('src/lib/hr-email.ts')
test('HR email only contains a secure tenant portal link, with no employment or medical details', () => {
  const r = hrEmailRequest('employee@example.invalid', 'HR <noreply@example.invalid>', 'https://company.example.invalid')
  assert.deepEqual(r.to, ['employee@example.invalid'])
  assert.match(r.text, /https:\/\/company.example.invalid\/rrhh\/avisos/)
  assert.equal(r.attachments, undefined)
  for (const origin of ['http://company.example.invalid', 'https://user:pass@company.example.invalid', 'https://company.example.invalid/other', 'https://company.example.invalid?redirect=outside']) assert.throws(() => hrEmailRequest('employee@example.invalid', 'sender@example.invalid', origin))
  assert.throws(() => hrEmailRequest('a@example.invalid\r\nbcc:other', 'sender@example.invalid', 'https://company.example.invalid'))
  assert.throws(() => hrEmailRequest('a@example.invalid', 'sender@example.invalid\r\nbcc:other', 'https://company.example.invalid'))
})
test('HR mail blocks demo, global veto and unverifiable environment before touching queue or provider', async () => {
  const env = { ...process.env }
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://local.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic'
    for (const mode of ['demo', 'veto', 'unknown']) {
      process.env.OUTBOUND_EMAIL_ENABLED = mode === 'veto' ? 'false' : 'true'
      let touches = 0
      const { dispatchHrEmail } = loadTs('src/lib/server/hr-email.ts', {
        'server-only': {}, '@supabase/supabase-js': { createClient: () => ({ from() { touches++; throw new Error('Queue must stay untouched') } }) },
        './email-environment': { readEmailEnvironment: async () => { if (mode === 'unknown') throw new Error('Unknown environment'); return mode === 'demo' ? 'demo' : 'production' } },
        './email-delivery': { deliverEmail() { throw new Error('Provider must stay untouched') } },
      })
      if (mode === 'unknown') await assert.rejects(dispatchHrEmail())
      else assert.equal((await dispatchHrEmail()).blocked, true)
      assert.equal(touches, 0)
    }
  } finally { for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env) }
})
