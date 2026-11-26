'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/src/hooks/useUser'
import { canManagePurchaseWorkflow } from '@/src/lib/purchase-workflow'

export function PurchaseNavigation() {
  const path = usePathname()
  const { profile } = useUser()
  const permitted = canManagePurchaseWorkflow(profile)
  return <nav aria-label="Compras" className="flex flex-wrap gap-2">{[
    ['Documentos recibidos', '/accounting/purchases'], ['Solicitudes', '/accounting/purchase-requests'], ['Órdenes', '/accounting/purchase-orders'],
  ].filter(([, href]) => href === '/accounting/purchases' || permitted).map(([label, href]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}
    className={`rounded-xl border px-4 py-2 text-sm ${path === href ? 'border-rose-200 bg-rose-50 font-semibold text-[#B3282D]' : 'border-slate-200 text-slate-600 dark:text-slate-300'}`}>{label}</Link>)}</nav>
}
