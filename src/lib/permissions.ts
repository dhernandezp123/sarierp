const allRoles = ['Admin', 'Ventas', 'Pricing', 'Contabilidad', 'Finanzas', 'Operaciones']
const financeRoles = ['Admin', 'Contabilidad', 'Finanzas']

const pathPermissions: Array<{
  paths: string[]
  roles: string[]
}> = [
  {
    paths: ['/dashboard'],
    roles: allRoles,
  },
  {
    paths: ['/clientes', '/quotations', '/historico'],
    roles: allRoles,
  },
  {
    paths: ['/pricing-comparison', '/agents', '/catalogs'],
    roles: allRoles,
  },
  {
    paths: ['/financial-dashboard', '/cost-validation'],
    roles: financeRoles,
  },
  {
    paths: ['/admin'],
    roles: ['Admin'],
  },
]

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (!role) return false

  const normalizedPathname = pathname === '/' ? '/dashboard' : pathname
  const permission = pathPermissions.find(({ paths }) =>
    paths.some(
      (path) =>
        normalizedPathname === path || normalizedPathname.startsWith(`${path}/`)
    )
  )

  if (!permission) return true

  return permission.roles.includes(role)
}
