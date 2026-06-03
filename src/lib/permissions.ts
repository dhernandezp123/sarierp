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
    '/clientes',
    '/quotations',
    '/operations/routing',
    '/historico',
  ],

  Pricing: [
    '/dashboard',
    '/pricing-comparison',
    '/agents',
    '/catalogos',
    '/historico',
  ],

  Operaciones: [
    '/dashboard',
    '/operations/routing',
    '/historico',
  ],

  Contabilidad: [
    '/dashboard',
    '/financial-dashboard',
    '/cost-validation',
    '/historico',
  ],
}

export function canAccessPath(role: string | null | undefined, path: string) {
  if (!role) return false

  if (
    role === 'Ventas' &&
    path.startsWith('/operations/routing/') &&
    path.endsWith('/booking')
  ) {
    return false
  }

  const permissions = rolePermissions[role as UserRole]

  if (!permissions) return false
  if (permissions.includes('*')) return true

  return permissions.some((allowedPath) => path.startsWith(allowedPath))
}
