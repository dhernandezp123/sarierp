const allRoles = ['Admin', 'Ventas', 'Pricing', 'Contabilidad', 'Finanzas', 'Operaciones']
const nonSalesRoles = ['Admin', 'Pricing', 'Contabilidad', 'Finanzas', 'Operaciones']
const financeRoles = ['Admin', 'Contabilidad', 'Finanzas']
const operationsRoles = ['Admin', 'Ventas', 'Operaciones']
const operationsDashboardRoles = ['Admin', 'Operaciones']

const pathPermissions: Array<{
  paths: string[]
  roles: string[]
}> = [
  {
    paths: ['/dashboard'],
    roles: allRoles,
  },
  {
    paths: ['/clientes', '/quotations', '/quotations/new', '/historico'],
    roles: allRoles,
  },
  {
    paths: ['/historico/activity'],
    roles: nonSalesRoles,
  },
  {
    paths: ['/pricing-comparison', '/agents', '/catalogs', '/catalogos'],
    roles: nonSalesRoles,
  },
  {
    paths: ['/financial-dashboard', '/cost-validation'],
    roles: financeRoles,
  },
  {
    paths: ['/operations/dashboard'],
    roles: operationsDashboardRoles,
  },
  {
    paths: ['/operations/bookings'],
    roles: operationsDashboardRoles,
  },
  {
    paths: ['/operations/routing'],
    roles: operationsRoles,
  },
  {
    paths: ['/admin'],
    roles: ['Admin'],
  },
]

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (!role) return false

  const normalizedPathname = pathname === '/' ? '/dashboard' : pathname
  const permission = pathPermissions
    .flatMap(({ paths, roles }) => paths.map((path) => ({ path, roles })))
    .filter(
      ({ path }) =>
        normalizedPathname === path || normalizedPathname.startsWith(`${path}/`)
    )
    .sort((a, b) => b.path.length - a.path.length)[0]

  if (!permission) return true

  return permission.roles.includes(role)
}
