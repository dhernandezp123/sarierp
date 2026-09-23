import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import loadTs from './load-ts.mjs'

const {
  loadCurrentCompanyBranding,
  loadCurrentCompanySettings,
  loadTenantEmailBranding,
} = loadTs('src/lib/company-settings.ts')

function mockClient(result) {
  const calls = []
  return {
    calls,
    rpc(name) {
      calls.push(name)
      return {
        maybeSingle: async () => result,
      }
    },
  }
}

test('La configuración interna se resuelve con el RPC del tenant actual', async () => {
  const expected = { tenant_id: 'tenant-sari', trade_name: 'Sari Express' }
  const client = mockClient({ data: expected, error: null })

  assert.deepEqual(await loadCurrentCompanySettings(client), {
    data: expected,
    error: null,
  })
  assert.deepEqual(client.calls, ['get_current_company_settings'])
})

test('El portal solicita solamente el branding seguro del tenant actual', async () => {
  const expected = { trade_name: 'Sari Express', primary_color: '#0038BD' }
  const client = mockClient({ data: expected, error: null })

  assert.deepEqual(await loadCurrentCompanyBranding(client), {
    data: expected,
    error: null,
  })
  assert.deepEqual(client.calls, ['get_current_company_branding'])
})

test('El correo privilegiado consulta configuración con tenant explícito', async () => {
  const calls = []
  const query = {
    select(columns) { calls.push(['select', columns]); return query },
    eq(column, value) { calls.push(['eq', column, value]); return query },
    single: async () => ({ data: { trade_name: 'Sari Express' }, error: null }),
  }
  const client = {
    from(table) { calls.push(['from', table]); return query },
  }

  const result = await loadTenantEmailBranding(client, 'tenant-sari')
  assert.equal(result.data.trade_name, 'Sari Express')
  assert.deepEqual(calls, [
    ['from', 'company_settings'],
    ['select', 'trade_name, legal_name, email'],
    ['eq', 'tenant_id', 'tenant-sari'],
  ])
})

test('Los módulos consumidores no hacen lecturas ambiguas de company_settings', () => {
  const srcRoot = path.resolve('src')
  const settingsEditor = path.resolve(
    'src/app/(protected)/settings/company/page.tsx'
  )
  const settingsDataAccess = path.resolve('src/lib/company-settings.ts')
  const offenders = []

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(filename)
      } else if (/\.tsx?$/.test(entry.name) && filename !== settingsEditor && filename !== settingsDataAccess) {
        const source = fs.readFileSync(filename, 'utf8')
        if (source.includes(".from('company_settings')")) {
          offenders.push(path.relative(srcRoot, filename))
        }
      }
    }
  }

  visit(srcRoot)
  assert.deepEqual(offenders, [])

  const editorSource = fs.readFileSync(settingsEditor, 'utf8')
  const editorCallsites = [
    ...editorSource.matchAll(/\.from\('company_settings'\)([\s\S]{0,100})/g),
  ]
  assert.equal(editorCallsites.length, 2)
  assert.ok(
    editorCallsites.every((match) => /\.(?:insert|update)\(/.test(match[1])),
    'El editor solo puede conservar escrituras explícitas de company_settings'
  )
})
