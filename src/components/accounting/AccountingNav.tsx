'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
export function AccountingNav() {
  const pathname=usePathname()
  return <nav aria-label="Contabilidad" className="flex gap-2 overflow-x-auto border-b pb-3 text-sm lg:flex-wrap lg:overflow-visible">{[['Cuentas','/accounting/accounts'],['Asientos','/accounting/journal'],['Compras y documentos','/accounting/purchases'],['Cuentas por cobrar','/accounting/receivables'],['Estado de proveedores','/accounting/supplier-statements'],['Caja y bancos','/accounting/banks'],['Anulaciones','/accounting/voids'],['Libros y balances','/accounting/books'],['Activos','/accounting/assets'],['Configuración y períodos','/accounting/settings']].map(([label,path])=><Link key={path} href={path} aria-current={pathname===path?'page':undefined} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 ${pathname===path?'bg-rose-50 font-semibold text-[#B3282D]':'text-slate-600 hover:bg-slate-100 dark:text-slate-300'}`}>{label}</Link>)}</nav>
}
