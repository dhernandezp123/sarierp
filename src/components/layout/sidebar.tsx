'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { canAccessPath } from '@/src/lib/permissions'
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
  Route,
} from 'lucide-react'

interface SidebarProps {
  role?: string
}

type ProfileSummary = {
  nombre: string | null
  apellido: string | null
  email: string | null
  rol: string | null
  avatar_url: string | null
}

export default function Sidebar({ role: profileRole }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [currentRole, setCurrentRole] = useState<string | null>(profileRole ?? null)
  const [profile, setProfile] = useState<ProfileSummary | null>(null)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  useEffect(() => {
    if (profileRole) {
      setCurrentRole(profileRole)
    }

    const fetchRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('nombre, apellido, email, rol, avatar_url')
        .eq('id', user.id)
        .single()

      setProfile(data)
      setCurrentRole(data?.rol ?? profileRole ?? null)
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
    {
      label: 'Activity Center',
      href: '/historico/activity',
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
    {
      label: 'Dashboard Financiero',
      href: '/financial-dashboard',
      icon: BarChart3,
    },
    {
      label: 'Validación de Costos',
      href: '/cost-validation',
      icon: DollarSign,
    },
  ]

  const operationsItems = [
    {
      label: 'Dashboard Operativo',
      href: '/operations/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Bookings',
      href: '/operations/bookings',
      icon: FileText,
    },
    {
      label: 'Shipping Instructions',
      href: '/operations/routing',
      icon: Route,
    },
  ]

  const adminItems = [
    {
      label: 'Usuarios',
      href: '/admin/users',
      icon: Users,
    },
  ]

  const filterVisibleItems = (items: any[]) =>
    items.filter((item) => canAccessPath(currentRole, item.href))

  const visibleNavItems = filterVisibleItems(navItems)
  const visibleCostItems = filterVisibleItems(costItems)
  const visibleFinancialItems = filterVisibleItems(financialItems)
  const visibleOperationsItems = filterVisibleItems(operationsItems)
  const visibleAdminItems = filterVisibleItems(adminItems)
  const displayName = profile?.nombre
    ? `${profile.nombre} ${profile.apellido || ''}`.trim()
    : 'Usuario'

  const renderItem = (item: any) => {
    const Icon = item.icon
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          isActive
            ? 'bg-white/10 text-white shadow-sm'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-white/5 bg-[#0B1120] text-white">
      <div className="mb-8 border-b border-white/5 px-4 pb-5 pt-5">
        <p className="text-xs uppercase tracking-[0.25em] text-red-500 font-bold">
          Sari Express
        </p>

        <h2 className="mt-2 text-xl font-bold tracking-tight leading-tight">
          Forwarders ERP
        </h2>

        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Freight Management Platform
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {canViewCommercial && visibleNavItems.length > 0 && (
          <nav className="space-y-1 px-4">
            {visibleNavItems.map(renderItem)}
          </nav>
        )}

      {(visibleCostItems.length > 0 ||
        visibleFinancialItems.length > 0 ||
        visibleOperationsItems.length > 0) && (
        <div className="mt-8 px-4">
          {visibleCostItems.length > 0 && (
            <>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pricing
              </p>

              <nav className="space-y-1">
                {visibleCostItems.map(renderItem)}
              </nav>
            </>
          )}

          {visibleFinancialItems.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Finanzas
              </p>

              <nav className="space-y-1">
                {visibleFinancialItems.map(renderItem)}
              </nav>
            </>
          )}

          {visibleOperationsItems.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Operaciones
              </p>

              <nav className="space-y-1">
                {visibleOperationsItems.map(renderItem)}
              </nav>
            </>
          )}
        </div>
      )}

      {visibleAdminItems.length > 0 && (
        <div className="mt-8 px-4">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Administración
          </p>

          <nav className="space-y-1">
            {visibleAdminItems.map(renderItem)}
          </nav>
        </div>
      )}

      </div>

      <div className="border-t border-white/5 p-4">
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 p-3 transition hover:bg-white/10"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {displayName}
            </p>
            <p className="text-xs text-slate-400">
              {currentRole || 'Ventas'}
            </p>
          </div>
        </Link>

        <button
          onClick={handleLogout}
          className="mt-4 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
