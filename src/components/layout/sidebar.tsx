'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import {
  LayoutDashboard,
  LogOut,
  Users,
  FileText,
  History,
  Scale,
  DollarSign,
  BarChart3,
  Building2,
  Database,
} from 'lucide-react'

interface SidebarProps {
  role?: string
}

export default function Sidebar({ role: profileRole }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [currentRole, setCurrentRole] = useState<string | null>(profileRole ?? null)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  useEffect(() => {
    if (profileRole) {
      setCurrentRole(profileRole)
      return
    }

    const fetchRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .single()

      setCurrentRole(data?.rol ?? null)
    }

    fetchRole()
  }, [profileRole])

  const isAdmin = currentRole === 'Admin'
  const isSales = currentRole === 'Ventas'
  const isPricing = currentRole === 'Pricing'
  const isFinance = currentRole === 'Finanzas' || currentRole === 'Contabilidad'
  const isOperations = currentRole === 'Operaciones'

  const canViewCommercial =
    isAdmin || isSales || isPricing || isFinance || isOperations

  const canViewPricing =
    isAdmin || isSales || isPricing || isFinance || isOperations

  const canViewFinance =
    isAdmin || isSales || isPricing || isFinance || isOperations

  const canViewFinancialDashboard =
    isAdmin || isFinance

  const canViewCostValidation =
    isAdmin || isFinance

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Clientes',
      href: '/clientes',
      icon: Users,
    },
    {
      label: 'Nueva Cotización',
      href: '/quotations/new',
      icon: FileText,
    },
    {
      label: 'Histórico',
      href: '/historico',
      icon: History,
    },
  ]

  const costItems = [
    {
      label: 'Comparativo',
      href: '/pricing-comparison',
      icon: Scale,
    },
    {
      label: 'Agentes',
      href: '/agents',
      icon: Building2,
    },
    {
      label: 'Catálogos',
      href: '/catalogs',
      icon: Database,
    },
  ]

  const financialItems = [
    canViewFinancialDashboard && {
      label: 'Dashboard Financiero',
      href: '/financial-dashboard',
      icon: BarChart3,
    },
    canViewCostValidation && {
      label: 'Validación de Costos',
      href: '/cost-validation',
      icon: DollarSign,
    },
  ].filter(Boolean)

  const adminItems = [
    {
      label: 'Usuarios',
      href: '/admin/users',
      icon: Users,
    },
  ]

  const renderItem = (item: any) => {
    const Icon = item.icon
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'bg-slate-100 text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
        }`}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white text-slate-900 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-white">
      <div className="mb-8 border-b border-slate-200 px-4 pb-5 pt-5 dark:border-slate-800">
        <p className="text-xs uppercase tracking-[0.25em] text-red-500 font-bold">
          Sari Express
        </p>

        <h2 className="mt-2 text-xl font-bold tracking-tight leading-tight">
          Forwarders ERP
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Freight Management Platform
        </p>
      </div>

      {canViewCommercial && (
        <nav className="space-y-1 px-4">
          {navItems.map(renderItem)}
        </nav>
      )}

      {(canViewPricing || canViewFinance) && (
        <div className="mt-8 px-4">
          {canViewPricing && (
            <>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pricing
              </p>

              <nav className="space-y-1">
                {costItems.map(renderItem)}
              </nav>
            </>
          )}

          {canViewFinance && financialItems.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Finanzas
              </p>

              <nav className="space-y-1">
                {financialItems.map(renderItem)}
              </nav>
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="mt-8 px-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Administración
          </p>

          <nav className="space-y-1">
            {adminItems.map(renderItem)}
          </nav>
        </div>
      )}

      <div className="mt-10 border-t border-slate-200 px-4 pt-6 dark:border-slate-800">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/70">
          <p className="text-xs text-slate-500 dark:text-slate-400">Rol activo</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {currentRole || 'Ventas'}
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
