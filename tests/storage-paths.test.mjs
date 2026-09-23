import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  buildTenantStoragePath,
  isTenantResourceStoragePath,
} = loadTs('src/lib/storage-paths.ts')

const tenantId = '00000000-0000-4000-8000-000000000001'
const resourceId = '00000000-0000-4000-8000-000000000101'

test('Storage: las rutas nuevas comienzan con tenant y recurso', () => {
  assert.equal(
    buildTenantStoragePath(tenantId, resourceId, 'invoice.pdf'),
    `${tenantId}/${resourceId}/invoice.pdf`,
  )
  assert.equal(
    isTenantResourceStoragePath(`${tenantId}/${resourceId}/invoice.pdf`, tenantId, resourceId),
    true,
  )
})

test('Storage: rechaza segmentos ambiguos y tenants inválidos', () => {
  assert.throws(() => buildTenantStoragePath('tenant-sari', resourceId), /Tenant/)
  assert.throws(() => buildTenantStoragePath(tenantId, '..', 'invoice.pdf'), /Segmento/)
  assert.throws(() => buildTenantStoragePath(tenantId, 'folder/file.pdf'), /Segmento/)
})

test('Storage: conserva reconocimiento local de rutas legacy sin aceptar otro tenant', () => {
  assert.equal(isTenantResourceStoragePath(`${resourceId}/legacy.pdf`, tenantId, resourceId), true)
  assert.equal(
    isTenantResourceStoragePath(
      `00000000-0000-4000-8000-000000000002/${resourceId}/cross.pdf`,
      tenantId,
      resourceId,
    ),
    false,
  )
})
