import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  getTenantEntryRedirectUrl,
  getTenantPlatformRedirectUrl,
  isLegalDocumentPath,
  isLogisticsLegalDocumentPath,
  isPlatformCanonicalPath,
  isPlatformLegalDocumentPath,
  normalizeRequestHostname,
  resolveTenantHost,
} = loadTs('src/lib/tenant-host.ts')
const {
  clearTenantHeaders,
  isPlatformSupportPath,
  profileMatchesAccessContext,
  profileMatchesTenant,
  readTenantHeaders,
  tenantContextFromRow,
  writeTenantHeaders,
} = loadTs('src/lib/tenant-context.ts')

const sariRow = {
  tenant_id: '00000000-0000-4000-8000-000000000001',
  slug: 'sari',
  tenant_name: 'Sari Express',
  hostname: 'sari.forwarders.app',
  trade_name: 'Sari Express',
  logo_url: '/logo/sari-logo.png',
  primary_color: '#0038BD',
  secondary_color: '#07111F',
}

test('normaliza puertos y rechaza Host ambiguo o manipulado', () => {
  assert.equal(normalizeRequestHostname('SARI.FORWARDERS.APP:3000'), 'sari.forwarders.app')
  assert.equal(normalizeRequestHostname('sari.forwarders.app.'), 'sari.forwarders.app')
  for (const host of [
    'sari.forwarders.app,evil.test',
    'sari.forwarders.app/evil',
    'user@sari.forwarders.app',
    'sari.forwarders.app.evil.test:bad',
    'sari forwarders.app',
    '',
  ]) {
    assert.equal(normalizeRequestHostname(host), null, host)
  }
})

test('resuelve subdominio productivo, sari.localhost y alias local explícito', () => {
  assert.deepEqual(resolveTenantHost('sari.forwarders.app'), {
    kind: 'tenant',
    requestHostname: 'sari.forwarders.app',
    lookupHostname: 'sari.forwarders.app',
    slug: 'sari',
    isLocalAlias: false,
  })
  assert.equal(resolveTenantHost('sari.localhost:3000').lookupHostname, 'sari.forwarders.app')
  assert.equal(resolveTenantHost('localhost:3000', {
    localTenantHostname: 'sari.forwarders.app',
  }).lookupHostname, 'sari.forwarders.app')
  assert.deepEqual(resolveTenantHost('forwarders.app'), {
    kind: 'platform',
    requestHostname: 'forwarders.app',
  })
})

test('separa las rutas públicas de plataforma de las condiciones logísticas del tenant', () => {
  for (const path of ['/politicas', '/legal/platform-2026-09-07.json', '/legal/platform-2026-09-24.json']) {
    assert.equal(isPlatformCanonicalPath(path), true, path)
  }

  for (const path of ['/', '/login', '/dashboard', '/terminos-logisticos', '/legal/logistics-2026-09-07.json', '/legal/logistics-2026-09-24.json']) {
    assert.equal(isPlatformCanonicalPath(path), false, path)
  }

  assert.equal(isPlatformLegalDocumentPath('/legal/platform-2026-06-22.json'), true)
  assert.equal(isLogisticsLegalDocumentPath('/legal/logistics-2026-06.json'), true)
  assert.equal(isLegalDocumentPath('/legal/logistics-2026-09-07.json'), true)
  assert.equal(isPlatformLegalDocumentPath('/legal/platform-2026-09-24.json'), true)
  assert.equal(isLogisticsLegalDocumentPath('/legal/logistics-2026-09-24.json'), true)
})

test('envía la raíz del tenant a su login y canoniza solo políticas de plataforma', () => {
  assert.equal(
    getTenantEntryRedirectUrl('https://sari.forwarders.app/?campaign=landing').toString(),
    'https://sari.forwarders.app/login',
  )
  assert.equal(getTenantEntryRedirectUrl('https://sari.forwarders.app/login'), null)
  assert.equal(getTenantPlatformRedirectUrl('https://sari.forwarders.app/'), null)
  assert.equal(
    getTenantPlatformRedirectUrl('https://sari.forwarders.app/politicas?source=erp').toString(),
    'https://forwarders.app/politicas?source=erp',
  )
  assert.equal(getTenantPlatformRedirectUrl('https://sari.forwarders.app/login'), null)
  assert.equal(getTenantPlatformRedirectUrl('https://sari.forwarders.app/terminos-logisticos'), null)
  assert.equal(
    getTenantPlatformRedirectUrl('http://sari.localhost:3000/politicas', true),
    null,
  )
})

test('slugs reservados e intentos de suffix injection fallan cerrados', () => {
  for (const host of [
    'admin.forwarders.app',
    'api.forwarders.app',
    'www.localhost',
  ]) {
    assert.equal(resolveTenantHost(host).kind, 'invalid', host)
  }

  const injected = resolveTenantHost('sari.forwarders.app.evil.test')
  assert.equal(injected.kind, 'tenant')
  assert.equal(injected.slug, null)
  assert.equal(injected.lookupHostname, 'sari.forwarders.app.evil.test')
})

test('el contexto validado reemplaza headers entrantes y no autoriza otro tenant', () => {
  const tenant = tenantContextFromRow(sariRow, 'sari.localhost')
  assert.ok(tenant)

  const headers = new Headers({
    'x-forwarders-tenant-id': 'tenant-inyectado',
    'x-forwarders-tenant-name': 'Atacante',
  })
  clearTenantHeaders(headers)
  writeTenantHeaders(headers, tenant)

  assert.deepEqual(readTenantHeaders(headers), tenant)
  assert.equal(profileMatchesTenant(sariRow.tenant_id, tenant), true)
  assert.equal(profileMatchesTenant('00000000-0000-4000-8000-000000000099', tenant), false)
  assert.equal(profileMatchesTenant(null, tenant), false)
})

test('separa el acceso operativo por tenant del soporte de plataforma', () => {
  const tenant = tenantContextFromRow(sariRow, 'sari.forwarders.app')

  assert.equal(profileMatchesAccessContext({
    tenant_id: sariRow.tenant_id,
    is_platform_admin: false,
  }, tenant), true)
  assert.equal(profileMatchesAccessContext({
    tenant_id: null,
    is_platform_admin: true,
  }, tenant), false)
  assert.equal(profileMatchesAccessContext({
    tenant_id: null,
    is_platform_admin: true,
  }, null), true)
  assert.equal(profileMatchesAccessContext({
    tenant_id: sariRow.tenant_id,
    is_platform_admin: false,
  }, null), false)
  assert.equal(profileMatchesAccessContext({
    tenant_id: sariRow.tenant_id,
    is_platform_admin: true,
  }, null), false)

  assert.equal(isPlatformSupportPath('/support'), true)
  assert.equal(isPlatformSupportPath('/support/00000000-0000-4000-8000-000000000001'), true)
  assert.equal(isPlatformSupportPath('/support/new'), false)
  assert.equal(isPlatformSupportPath('/support/ticket-id'), false)
  assert.equal(isPlatformSupportPath('/supporting'), false)
  assert.equal(isPlatformSupportPath('/dashboard'), false)
})

test('descarta colores y logos inseguros entregados por configuración', () => {
  assert.equal(tenantContextFromRow(null, 'sari.forwarders.app'), null)

  const tenant = tenantContextFromRow({
    ...sariRow,
    logo_url: 'javascript:alert(1)',
    primary_color: 'red',
    secondary_color: '#nothex',
  }, 'sari.forwarders.app')

  assert.equal(tenant.logoUrl, null)
  assert.equal(tenant.primaryColor, '#0038BD')
  assert.equal(tenant.secondaryColor, '#07111F')
})
