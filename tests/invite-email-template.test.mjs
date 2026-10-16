import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inviteAuthPatch, recoveryAuthPatch } from '../scripts/publish-recovery-email.mjs'

const html = readFileSync(new URL('../supabase/templates/invite.html',import.meta.url),'utf8')
const recovery = readFileSync(new URL('../supabase/templates/recovery.html',import.meta.url),'utf8')
const subject = 'Activa tu cuenta'
const callback = 'https://sari.forwarders.app/onboarding'

test('invite publication authorizes onboarding and preserves recovery settings and existing destinations', () => {
  const current = { uri_allow_list:'https://forwarders.app/onboarding,https://sari.forwarders.app/auth/callback?next=/portal/reset-password', mailer_subjects_recovery:'Recupera tu acceso', mailer_templates_recovery_content:recovery }
  const patch = inviteAuthPatch(current,html,subject)
  assert.deepEqual(Object.keys(patch).sort(),['mailer_subjects_invite','mailer_templates_invite_content','uri_allow_list'])
  assert.deepEqual(patch.uri_allow_list.split(','),[...current.uri_allow_list.split(','),callback])
  assert.equal(inviteAuthPatch(patch,html,subject).uri_allow_list,patch.uri_allow_list)
  assert.equal(current.mailer_templates_recovery_content,recovery)
})

test('invite and recovery templates cannot be published into the wrong Auth flow', () => {
  assert.throws(()=>inviteAuthPatch({},recovery,subject),/callback/)
  assert.throws(()=>recoveryAuthPatch({},html,'Recupera tu acceso'),/callback/)
  assert.throws(()=>inviteAuthPatch({},html.replace(callback,callback+'?next=https://evil.example'),subject),/callback/)
  assert.throws(()=>inviteAuthPatch({},html.replace('sari.forwarders.app/onboarding','evil.example/onboarding'),subject),/callback/)
})

test('invite subject is transport safe and activation links never print the token as text', () => {
  const config = readFileSync(new URL('../supabase/config.toml',import.meta.url),'utf8')
  const section = config.match(/\[auth\.email\.template\.invite\]([^]*?)(?=\n\[|$)/)[1]
  const configured = JSON.parse(section.match(/^subject\s*=\s*(".*")\s*$/m)[1])
  assert.equal(configured,subject)
  assert.equal(Buffer.from(configured,'utf8').toString('latin1'),configured)
  assert.equal(inviteAuthPatch({},html,configured).mailer_subjects_invite,subject)
  assert.throws(()=>inviteAuthPatch({},html.replace('Abrir enlace de activación','{{ .ConfirmationURL }}'),subject),/visible text/)
  assert.ok(!html.includes('recuperación'))
  assert.ok(!html.includes('restablecer'))
  assert.ok(!html.includes('.Data'))
})
