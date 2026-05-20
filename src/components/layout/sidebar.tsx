'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import {
  LayoutDashboard,
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
  const [currentRole, setCurrentRole] = useState<string | null>(profileRole ?? null)

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
            ? 'bg-white text-zinc-950 shadow-sm'
            : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
        }`}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="relative w-64 min-h-screen bg-zinc-950 text-white border-r border-zinc-800 px-4 py-5 font-sans">
      <div className="mb-8 border-b border-zinc-800 pb-5">
        <p className="text-xs uppercase tracking-[0.25em] text-red-500 font-bold">
          Sari Express
        </p>

        <h2 className="mt-2 text-xl font-bold tracking-tight leading-tight">
          Forwarders ERP
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Freight Management Platform
        </p>
      </div>

      {canViewCommercial && (
        <nav className="space-y-1">
          {navItems.map(renderItem)}
        </nav>
      )}

      {(canViewPricing || canViewFinance) && (
        <div className="mt-8">
          {canViewPricing && (
            <>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Pricing
              </p>

              <nav className="space-y-1">
                {costItems.map(renderItem)}
              </nav>
            </>
          )}

          {canViewFinance && financialItems.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
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
        <div className="mt-8">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Administración
          </p>

          <nav className="space-y-1">
            {adminItems.map(renderItem)}
          </nav>
        </div>
      )}

      <div className="mt-10 pt-6 border-t border-zinc-800">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="text-xs text-zinc-500">Rol activo</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {currentRole || 'Ventas'}
          </p>
        </div>
      </div>
    </aside>
  )
}
