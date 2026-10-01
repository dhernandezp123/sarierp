/** Route selection is separate from authorization (see permissions.ts). */
export function isSidebarItemActive(pathname: string, href: string, exact = false) {
  if (href === '/historico') {
    return pathname === '/historico' ||
      (pathname.startsWith('/quotations/') && pathname !== '/quotations/new')
  }
  return pathname === href || (!exact && pathname.startsWith(`${href}/`))
}

export function sidebarGroupOrder(role?: string | null) {
  const groups = ['commercial', 'pricing', 'operations', 'miami', 'finance', 'admin']
  const first = role === 'Pricing' ? ['pricing']
    : role === 'Operaciones' ? ['operations', 'miami']
      : role === 'Finanzas' || role === 'Contabilidad' ? ['finance'] : ['commercial']
  return [...first, ...groups.filter((group) => !first.includes(group))]
}
