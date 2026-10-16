import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recoveryAuthPatch } from '../scripts/publish-recovery-email.mjs'

const html = readFileSync(new URL('../supabase/templates/recovery.html', import.meta.url), 'utf8')
const subject = 'Restablece tu contraseña'
const callback = 'https://sari.forwarders.app/auth/callback?next=/portal/reset-password'

test('recovery release authorizes the tenant callback while preserving existing Auth destinations and SMTP', () => {
  const current = { uri_allow_list: 'https://forwarders.app/onboarding,https://forwarders.app/auth/callback', smtp_host: 'unchanged', site_url: 'https://forwarders.app' }
  const patch = recoveryAuthPatch(current, html, subject)
  assert.deepEqual(patch.uri_allow_list.split(','), [...current.uri_allow_list.split(','), callback])
  assert.deepEqual(Object.keys(patch).sort(), ['mailer_subjects_recovery','mailer_templates_recovery_content','uri_allow_list'])
  assert.equal(current.smtp_host,'unchanged')
  assert.equal(recoveryAuthPatch(patch, html, subject).uri_allow_list, patch.uri_allow_list)
})

test('recovery release rejects encoding damage and untrusted tenant callbacks', () => {
  assert.throws(() => recoveryAuthPatch({}, html, Buffer.from(subject).toString('latin1')), /encoding/)
  assert.throws(() => recoveryAuthPatch({}, html.replace('contraseña','contrase\u00c3\u00b1a'), subject), /encoding/)
  for (const invalid of [callback.replace('https:','http:'), callback.replace('sari.forwarders.app','evil.example'), callback+'&next=https://evil.example']) {
    assert.throws(() => recoveryAuthPatch({}, html.replace(callback,invalid), subject), /callback/)
  }
})

test('both links use the same recovery URL without displaying a bearer token as text', () => {
  const patch = recoveryAuthPatch({}, html, subject)
  assert.equal(patch.mailer_subjects_recovery, subject)
  assert.equal((patch.mailer_templates_recovery_content.match(/href="{{ \.ConfirmationURL }}"/g) || []).length,2)
  assert.ok(!html.includes('>{{ .ConfirmationURL }}</a>'))
  assert.throws(() => recoveryAuthPatch({}, html.replace('Abrir enlace de recuperación','{{ .ConfirmationURL }}'),subject), /visible text/)
})
