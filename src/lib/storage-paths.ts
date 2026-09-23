const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeSegment(segment: string) {
  const value = segment.trim()
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error('Segmento de ruta de Storage inválido')
  }
  return value
}

export function buildTenantStoragePath(tenantId: string, ...segments: string[]) {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error('Tenant inválido para la ruta de Storage')
  }
  if (segments.length === 0) {
    throw new Error('La ruta de Storage requiere un recurso')
  }
  return [tenantId, ...segments.map(normalizeSegment)].join('/')
}

export function isTenantResourceStoragePath(
  path: string,
  tenantId: string,
  resourceId: string,
) {
  const [pathTenantId, pathResourceId] = path.split('/')
  return (pathTenantId === tenantId && pathResourceId === resourceId)
    || pathTenantId === resourceId
}
