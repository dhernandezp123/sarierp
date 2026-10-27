'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
export function AccountingNav() {
  const pathname=usePathname()
  return <nav aria-label="Contabilidad" className="flex flex-wrap gap-4 border-b pb-3 text-sm">{[['Cuentas','/accounting/accounts'],['Asientos','/accounting/journal'],['Compras y documentos','/accounting/purchases'],['Libros y balances','/accounting/books'],['Activos','/accounting/assets'],['Configuración y períodos','/accounting/settings']].map(([label,path])=><Link key={path} href={path} aria-current={pathname===path?'page':undefined} className={pathname===path?'font-bold text-orange-600':'text-blue-700 underline'}>{label}</Link>)}</nav>
}
