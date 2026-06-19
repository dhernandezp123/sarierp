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
  ],

  Operaciones: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations',
    '/operations/dashboard',
    '/operations/bookings',
    '/operations/shipping-instructions',
    '/reports',
    '/historico',
    '/miami',
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
  ],
}

export const SETTINGS_READ_PATHS = ['/settings/company', '/settings/cai']

export function canAccessPath(role: string | null | undefined, path: string) {
  if (!role) return false

  // Settings pages are readable by all authenticated roles (edit guarded inside the page)
  if (SETTINGS_READ_PATHS.some((p) => path.startsWith(p))) return true

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
