export type UserRole =
  | 'Admin'
  | 'Ventas'
  | 'Pricing'
  | 'Operaciones'
  | 'Contabilidad'

export const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['*'],

  Ventas: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations',
    '/operations/shipping-instructions',
    '/historico',
  ],

  Pricing: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations/new',
    '/pricing-comparison',
    '/agents',
    '/catalogs',
    '/historico',
  ],

  Operaciones: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations',
    '/operations/dashboard',
    '/operations/bookings',
    '/operations/shipping-instructions',
    '/historico',
  ],

  Contabilidad: [
    '/dashboard',
    '/alerts',
    '/financial-dashboard',
    '/cost-validation',
    '/historico',
  ],
}

export function canAccessPath(role: string | null | undefined, path: string) {
  if (!role) return false

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

  return permissions.some((allowedPath) => path.startsWith(allowedPath))
}
