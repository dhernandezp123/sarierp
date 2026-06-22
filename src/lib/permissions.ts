export type UserRole =
  | 'Admin'
  | 'Ventas'
  | 'Pricing'
  | 'Operaciones'
  | 'Contabilidad'
  | 'Finanzas'
  | 'Cliente'

export const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['*'],

  Cliente: [
    '/portal',
  ],

  Ventas: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations',
    '/reports',
    '/operations/shipping-instructions',
    '/historico',
    '/settings/company',
  ],

  Pricing: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations/new',
    '/pricing-comparison',
    '/agents',
    '/catalogs',
    '/reports',
    '/historico',
    '/settings/company',
  ],

  Operaciones: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations',
    '/operations/dashboard',
    '/operations/bookings',
    '/operations/shipping-instructions',
    '/operations/garantias',
    '/reports',
    '/historico',
    '/miami',
    '/miami/inventario',
    '/miami/embarques',
    '/settings/company',
  ],

  Contabilidad: [
    '/dashboard',
    '/alerts',
    '/financial-dashboard',
    '/cost-validation',
    '/invoicing',
    '/suppliers',
    '/accounts-payable',
    '/reports',
    '/historico',
    '/settings/company',
    '/settings/cai',
  ],

  Finanzas: [
    '/dashboard',
    '/alerts',
    '/financial-dashboard',
    '/cost-validation',
    '/invoicing',
    '/suppliers',
    '/accounts-payable',
    '/reports',
    '/historico',
    '/settings/company',
    '/settings/cai',
  ],
}

function matchesPath(path: string, allowedPath: string) {
  return path === allowedPath || path.startsWith(`${allowedPath}/`)
}

export function getDefaultPathForRole(role: string | null | undefined) {
  return role === 'Cliente' ? '/portal' : '/dashboard'
}

export function canAccessPath(role: string | null | undefined, path: string) {
  if (!role) return false

  if (path === '/profile' && role !== 'Cliente') {
    return true
  }

  if (
    role === 'Ventas' &&
    path.startsWith('/operations/shipping-instructions/') &&
    path.endsWith('/booking')
  ) {
    return false
  }

  if (
    role === 'Ventas' &&
    path.includes('/bl/')
  ) {
    return false
  }

  const permissions = rolePermissions[role as UserRole]

  if (!permissions) return false
  if (permissions.includes('*')) return true

  return permissions.some((allowedPath) => matchesPath(path, allowedPath))
}
