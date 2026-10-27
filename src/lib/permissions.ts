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
    '/ventas',
    '/clientes',
    '/quotations',
    '/agents',
    '/reports',
    '/operations/shipping-instructions',
    '/historico',
    '/settings/company',
    '/support',
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
    '/support',
  ],

  Operaciones: [
    '/dashboard',
    '/alerts',
    '/clientes',
    '/quotations',
    '/operations/dashboard',
    '/operations/bookings',
    '/operations/shipping-instructions',
    '/agents',
    '/operations/garantias',
    '/manual-invoices',
    '/reports',
    '/historico',
    '/miami',
    '/miami/inventario',
    '/miami/embarques',
    '/settings/company',
    '/support',
  ],

  Contabilidad: [
    '/accounting',
    '/manual-invoices',
    '/clientes',
    '/quotations',
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
    '/support',
  ],

  Finanzas: [
    '/accounting',
    '/manual-invoices',
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
    '/support',
  ],
}

function matchesPath(path: string, allowedPath: string) {
  return path === allowedPath || path.startsWith(`${allowedPath}/`)
}

export function canViewClientOperationsReport(role: string | null | undefined) {
  return ['Admin', 'Operaciones', 'Ventas'].includes(role || '')
}

export function canManageCompanySettings(role: string | null | undefined) {
  return ['Admin', 'Contabilidad'].includes(role || '')
}

export function canManageCaiRanges(role: string | null | undefined) {
  return ['Admin', 'Contabilidad'].includes(role || '')
}

export function canViewQuotationCosts(role: string | null | undefined) {
  return ['Admin', 'Pricing', 'Contabilidad'].includes(role || '')
}

// La autorizacion efectiva se comprueba tambien en RLS y replace_client_rates.
export function canManageClientRates(role: string | null | undefined) {
  return ['Admin', 'Pricing', 'Ventas'].includes(role || '')
}

export function getDefaultPathForRole(role: string | null | undefined) {
  return role === 'Cliente' ? '/portal' : '/dashboard'
}

export function canAccessPath(role: string | null | undefined, path: string) {
  if (!role) return false
  // The tenant Admin wildcard never grants access to the platform console.
  if (matchesPath(path, '/platform')) return false
  if (matchesPath(path, '/reports/client-operations')) return canViewClientOperationsReport(role)

  if (role === 'Contabilidad') {
    if (matchesPath(path, '/clientes/nuevo')) return false
    if (path.startsWith('/quotations/')) {
      return /^\/quotations\/(?!new(?:\/|$))[^/]+\/?$/.test(path)
    }
  }

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
