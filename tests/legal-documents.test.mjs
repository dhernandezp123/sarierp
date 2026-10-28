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
  const sql = fs.readFileSync('supabase/migrations/20260924100000_legal_documents_2026_09_24.sql', 'utf8')
  const compactSql = sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
  for (const key of ['platform', 'logistics']) {
    const path = `/legal/${key}-${LEGAL_VERSION}.json`
    const bytes = fs.readFileSync(`public${path}`)
    const document = JSON.parse(bytes)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    assert.ok(compactSql.includes(`('${key}', '${LEGAL_VERSION}', '${path}', '${hash}')`))
    assert.equal(document.version, LEGAL_VERSION)
    assert.equal(new Set(document.sections.map(s => s.id)).size, document.sections.length)
  }
})

test('Las ediciones publicadas anteriormente permanecen inmutables', () => {
  const sql = fs.readFileSync('supabase/migrations/20260907160000_signup_legal_acceptance.sql', 'utf8')
  const historicalVersions = [
    ['platform', '2026-09-07'],
    ['logistics', '2026-09-07'],
  ]

  for (const [key, version] of historicalVersions) {
    const path = `/legal/${key}-${version}.json`
    const bytes = fs.readFileSync(`public${path}`)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    assert.ok(sql.includes(`('${key}', '${version}', '${path}', '${hash}')`))
  }
})

test('La política global es neutral y las condiciones logísticas siguen siendo de Sari', () => {
  const platform = fs.readFileSync(`public/legal/platform-${LEGAL_VERSION}.json`, 'utf8')
  const logistics = fs.readFileSync(`public/legal/logistics-${LEGAL_VERSION}.json`, 'utf8')

  assert.doesNotMatch(platform, /Sari Express|sari\.forwarders\.app|\/terminos-logisticos/)
  assert.match(logistics, /Sari Express/)
  assert.match(logistics, /sari\.forwarders\.app/)
})

test('La interfaz legal no ofrece snapshots JSON como descargas para usuarios', () => {
  const platformPage = fs.readFileSync('src/app/politicas/page.tsx', 'utf8')
  const logisticsTerms = fs.readFileSync('src/components/legal/LogisticsTerms.tsx', 'utf8')

  assert.doesNotMatch(platformPage, /href="\/legal\//)
  assert.doesNotMatch(platformPage, /Condiciones del servicio logístico/)
  assert.doesNotMatch(logisticsTerms, /href="\/legal\//)
  assert.doesNotMatch(logisticsTerms, /\sdownload(?:=|>)/)
})
