'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  ActivitySquare,
  CalendarClock,
  Scale,
  DollarSign,
  BarChart3,
  Building2,
  Database,
  Route,
  Bell,
  Receipt,
  Package,
  ClipboardList,
  Warehouse,
  ShieldCheck,
  ShoppingBag,
  CreditCard,
  ShieldAlert,
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
  const [unreadCount, setUnreadCount] = useState(0)

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

      const [profileResult, notifResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('nombre, apellido, email, rol, avatar_url')
          .eq('id', user.id)
          .single(),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false),
      ])

      setProfile(profileResult.data)
      setCurrentRole(profileResult.data?.rol ?? profileRole ?? null)
      setUnreadCount(notifResult.count ?? 0)
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
      label: 'Alertas',
      href: '/alerts',
      icon: Bell,
    },
    {
      label: 'Actividades',
      href: '/ventas',
      icon: CalendarClock,
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
      label: 'Cotizaciones',
      href: '/historico',
      icon: FileText,
    },
    {
      label: 'Reportes',
      href: '/reports',
      icon: BarChart3,
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
    {
      label: 'Facturación',
      href: '/invoicing',
      icon: Receipt,
    },
  ]

  const purchaseItems = [
    {
      label: 'Proveedores',
      href: '/suppliers',
      icon: ShoppingBag,
    },
    {
      label: 'Cuentas por Pagar',
      href: '/accounts-payable',
      icon: CreditCard,
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
      href: '/operations/shipping-instructions',
      icon: Route,
    },
    {
      label: 'Garantías Navieras',
      href: '/operations/garantias',
      icon: ShieldAlert,
    },
  ]

  const miamiItems = [
    {
      label: 'Dashboard Bodega',
      href: '/miami',
      icon: Warehouse,
      exact: true,
    },
    {
      label: 'Ingreso Individual',
      href: '/miami/ingreso',
      icon: Package,
    },
    {
      label: 'Manifiestos',
      href: '/miami/manifiestos',
      icon: ClipboardList,
    },
    {
      label: 'Inventario',
      href: '/miami/inventario',
      icon: Database,
    },
    {
      label: 'Lista de Embarque',
      href: '/miami/embarques',
      icon: Route,
    },
  ]

  const adminItems = [
    {
      label: 'Usuarios',
      href: '/admin/users',
      icon: Users,
    },
    {
      label: 'Activity Center',
      href: '/historico/activity',
      icon: ActivitySquare,
    },
    {
      label: 'Config. Empresa',
      href: '/settings/company',
      icon: Building2,
    },
    {
      label: 'Rangos CAI',
      href: '/settings/cai',
      icon: ShieldCheck,
    },
  ]

  const filterVisibleItems = (items: any[]) =>
    items.filter((item) => canAccessPath(currentRole, item.href))

  const visibleNavItems = filterVisibleItems(navItems)
  const visibleCostItems = filterVisibleItems(costItems)
  const visibleFinancialItems = filterVisibleItems(financialItems)
  const visibleOperationsItems = filterVisibleItems(operationsItems)
  const visibleMiamiItems = filterVisibleItems(miamiItems)
  const visibleAdminItems = filterVisibleItems(adminItems)
  const visiblePurchaseItems = filterVisibleItems(purchaseItems)
  const displayName = profile?.nombre
    ? `${profile.nombre} ${profile.apellido || ''}`.trim()
    : 'Usuario'

  const renderItem = (item: any) => {
    const Icon = item.icon
    const isActive = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + '/')
    const isAlerts = item.href === '/alerts'
    const showBadge = isAlerts && unreadCount > 0

    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-300 ${
          isActive
            ? 'border-white/15 bg-white/[0.075] text-white shadow-md shadow-[#0038BD]/10'
            : 'border-transparent text-slate-300 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/[0.06] hover:text-white hover:shadow-lg hover:shadow-[#0038BD]/5'
        }`}
      >
        {isActive && (
          <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-[#0038BD] to-[#EF8E01]" />
        )}
        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition ${
            isActive
              ? 'bg-white/10 text-[#EF8E01]'
              : 'bg-white/[0.03] text-slate-400 group-hover:bg-white/10 group-hover:text-[#EF8E01]'
          }`}
        >
          <Icon size={17} />
          {showBadge && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </span>
        <span className="relative z-10 flex-1 truncate">{item.label}</span>
        {showBadge && (
          <span className="ml-auto shrink-0 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
            {unreadCount}
          </span>
        )}
      </Link>
    )
  }

  return (
    <aside className="relative flex h-full min-h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#07111F] text-white shadow-2xl shadow-slate-950/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,56,189,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(239,142,1,0.16),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-40 [mask-image:linear-gradient(to_bottom,white,transparent_88%)]" />

      <div className="relative mb-6 border-b border-white/10 px-4 pb-5 pt-5">
        <Link
          href="/dashboard"
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-lg shadow-slate-950/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl overflow-hidden">
            <Image
              src="/brand/isotipo-blanco.png"
              alt="Forwarders ERP"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
          </span>

          <span className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight tracking-tight text-white">
              Forwarders ERP
            </span>
            <span className="mt-1 block truncate text-[11px] text-slate-400">
              ERP Log&iacute;stico
            </span>
          </span>
        </Link>
      </div>

      <div className="relative flex-1 overflow-y-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {canViewCommercial && visibleNavItems.length > 0 && (
          <nav className="space-y-1 px-4">
            <div className="mb-2 flex items-center gap-2 px-3">
              <span className="h-px flex-1 bg-white/10" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                Comercial
              </p>
            </div>

            {visibleNavItems.map(renderItem)}
          </nav>
        )}

      {(visibleCostItems.length > 0 ||
        visibleFinancialItems.length > 0 ||
        visiblePurchaseItems.length > 0 ||
        visibleOperationsItems.length > 0) && (
        <div className="mt-8 px-4">
          {visibleCostItems.length > 0 && (
            <>
              <div className="mb-2 flex items-center gap-2 px-3">
                <span className="h-px flex-1 bg-white/10" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Pricing
                </p>
              </div>

              <nav className="space-y-1">
                {visibleCostItems.map(renderItem)}
              </nav>
            </>
          )}

          {visibleFinancialItems.length > 0 && (
            <>
              <div className="mb-2 mt-6 flex items-center gap-2 px-3">
                <span className="h-px flex-1 bg-white/10" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Finanzas
                </p>
              </div>

              <nav className="space-y-1">
                {visibleFinancialItems.map(renderItem)}
              </nav>
            </>
          )}

          {visiblePurchaseItems.length > 0 && (
            <>
              <div className="mb-2 mt-6 flex items-center gap-2 px-3">
                <span className="h-px flex-1 bg-white/10" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Compras
                </p>
              </div>

              <nav className="space-y-1">
                {visiblePurchaseItems.map(renderItem)}
              </nav>
            </>
          )}

          {visibleOperationsItems.length > 0 && (
            <>
              <div className="mb-2 mt-6 flex items-center gap-2 px-3">
                <span className="h-px flex-1 bg-white/10" />
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Operaciones
                </p>
              </div>

              <nav className="space-y-1">
                {visibleOperationsItems.map(renderItem)}
              </nav>
            </>
          )}
        </div>
      )}

      {visibleMiamiItems.length > 0 && (
        <div className="mt-8 px-4">
          <div className="mb-2 flex items-center gap-2 px-3">
            <span className="h-px flex-1 bg-white/10" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Miami Bodega
            </p>
          </div>

          <nav className="space-y-1">
            {visibleMiamiItems.map(renderItem)}
          </nav>
        </div>
      )}

      {visibleAdminItems.length > 0 && (
        <div className="mt-8 px-4">
          <div className="mb-2 flex items-center gap-2 px-3">
            <span className="h-px flex-1 bg-white/10" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Administración
            </p>
          </div>

          <nav className="space-y-1">
            {visibleAdminItems.map(renderItem)}
          </nav>
        </div>
      )}

      </div>

      <div className="relative border-t border-white/10 bg-[#07111F]/65 p-4 backdrop-blur-xl">
        <Link
          href="/profile"
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3 shadow-sm shadow-slate-950/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.085] hover:shadow-lg hover:shadow-[#0038BD]/10"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#0038BD] to-[#EF8E01] text-sm font-semibold text-white shadow-md">
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
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
