import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import loadTs from './load-ts.mjs'

const { signupLegalAcceptance, LEGAL_VERSION } = loadTs('src/lib/legal-documents.ts')
test('No genera declaración sin aceptación explícita; distingue ERP de portal', () => {
  assert.throws(() => signupLegalAcceptance('erp', false))
  assert.deepEqual(signupLegalAcceptance('portal', true), {
    version: LEGAL_VERSION, audience: 'portal', terms_accepted: true, privacy_read: true,
  })
  assert.equal(signupLegalAcceptance('erp', true).audience, 'erp')
})

test('Las versiones presentadas coinciden con los hashes registrados en SQL', () => {
  const sql = fs.readFileSync('supabase/migrations/20260907160000_signup_legal_acceptance.sql', 'utf8')
  for (const key of ['platform', 'logistics']) {
    const path = `/legal/${key}-${LEGAL_VERSION}.json`
    const bytes = fs.readFileSync(`public${path}`)
    const document = JSON.parse(bytes)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    assert.ok(sql.includes(`('${key}', '${LEGAL_VERSION}', '${path}', '${hash}')`))
    assert.equal(document.version, LEGAL_VERSION)
    assert.equal(new Set(document.sections.map(s => s.id)).size, document.sections.length)
  }
})
