'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { canAccessPath } from '@/src/lib/permissions'
import { isSidebarItemActive, sidebarGroupOrder } from '@/src/lib/sidebar-navigation'
import { NOTIFICATIONS_READ_EVENT } from '@/src/lib/notifications'
import { supabase } from '@/src/lib/supabase/client'
import { TenantBrand } from '@/src/components/tenant/TenantBrand'
import { useTenant } from '@/src/components/tenant/TenantProvider'
import {
  LayoutDashboard, LogOut, Users, FileText, ActivitySquare, CalendarClock,
  Scale, DollarSign, BarChart3, Building2, Database, Route, Bell, Receipt,
  Package, ClipboardList, Warehouse, ShieldCheck, ShoppingBag, CreditCard,
  ShieldAlert, Mail, LifeBuoy, ChevronDown, Plus, type LucideIcon,
} from 'lucide-react'

type NavItem = { label: string; href: string; icon: LucideIcon; exact?: boolean }
const preferenceEvent = 'forwarders:sidebar-preferences'
const memoryPreferences = new Map<string, string>()
function subscribePreferences(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key) memoryPreferences.delete(event.key); else memoryPreferences.clear(); callback() }
  window.addEventListener('storage', onStorage)
  window.addEventListener(preferenceEvent, callback)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(preferenceEvent, callback)
  }
}
function readPreferences(key: string) {
  try { return memoryPreferences.get(key) || window.localStorage.getItem(key) || '{}' }
  catch { return memoryPreferences.get(key) || '{}' }
}

export default function Sidebar({ role }: { role?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, user } = useUser()
  const tenant = useTenant()
  const currentRole = profile?.rol ?? role
  const isPlatformAdmin = profile?.is_platform_admin === true
  const navId = useId()
  const [unread, setUnread] = useState({ userId: '', count: 0 })
  const unreadCount = unread.userId === user?.id ? unread.count : 0
  const [loggingOut, setLoggingOut] = useState(false)
  const [collapsedActivePath, setCollapsedActivePath] = useState<string | null>(null)
  const preferenceKey = 'forwarders:sidebar:' + (user?.id || 'anonymous') + ':' + currentRole
  const preferenceValue = useSyncExternalStore(subscribePreferences, () => readPreferences(preferenceKey), () => '{}')
  let collapsed: Record<string, boolean> = {}
  try {
    const parsed: unknown = JSON.parse(preferenceValue)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) collapsed = parsed as Record<string, boolean>
  } catch { /* Ignore an obsolete or invalid preference. */ }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/login')
    } catch { toast.error('No se pudo cerrar la sesión. Intenta nuevamente.') }
    finally { setLoggingOut(false) }
  }

  useEffect(() => {
    const userId = user?.id
    if (!userId || isPlatformAdmin) return
    let cancelled = false
    let readVersion = 0
    const refresh = async () => {
      const version = readVersion
      const { count, error } = await supabase.from('notifications')
        .select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_read', false)
      if (!cancelled && !error && version === readVersion) setUnread({ userId, count: count ?? 0 })
    }
    void refresh().catch(() => { /* Keep the last successful count on network failure. */ })
    const onRead = () => { readVersion += 1; setUnread({ userId, count: 0 }) }
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead)
    return () => { cancelled = true; window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead) }
  }, [isPlatformAdmin, pathname, user?.id])

  const navItems = [
    {
      label: 'Inicio',
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
    {
      label: 'Mesa de ayuda',
      href: '/support',
      icon: LifeBuoy,
    },
  ]

  const costItems = [
    {
      label: 'Comparativo de tarifas',
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
      label: 'Registro de actividad',
      href: '/historico/activity',
      icon: ActivitySquare,
    },
    {
      label: 'Configuración de empresa',
      href: '/settings/company',
      icon: Building2,
    },
    {
      label: 'Rangos CAI',
      href: '/settings/cai',
      icon: ShieldCheck,
    },
    {
      label: 'Plantillas de Correo',
      href: '/settings/email-templates',
      icon: Mail,
    },
  ]


  const generalPaths = ['/dashboard', '/alerts', '/reports']
  const groups = [
    { id: 'commercial', label: 'Comercial', items: navItems.filter((item) => ![...generalPaths, '/quotations/new', '/support'].includes(item.href)) },
    { id: 'pricing', label: 'Pricing', items: costItems },
    { id: 'operations', label: 'Operaciones', items: operationsItems },
    { id: 'miami', label: 'Bodega Miami', items: miamiItems },
    { id: 'finance', label: 'Finanzas', items: [...financialItems, ...purchaseItems] },
    { id: 'admin', label: 'Administración', items: adminItems },
  ].map((group) => ({ ...group, items: group.items.filter((item) => canAccessPath(currentRole, item.href)) }))
    .filter((group) => group.items.length)
    .sort((a, b) => sidebarGroupOrder(currentRole).indexOf(a.id) - sidebarGroupOrder(currentRole).indexOf(b.id))
  const displayName = profile?.nombre ? [profile.nombre, profile.apellido].filter(Boolean).join(' ') : 'Usuario'

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = isSidebarItemActive(pathname, item.href, item.exact)
    return (
      <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
        className={'group relative flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400 ' + (active ? 'border-white/15 bg-white/10 text-white' : 'border-transparent text-slate-300 hover:bg-white/[0.06] hover:text-white')}>
        {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gradient-to-b from-[#0038BD] to-[#EF8E01]" />}
        <Icon aria-hidden="true" size={17} className={'shrink-0 ' + (active ? 'text-[#EF8E01]' : 'text-slate-400')} />
        <span className="min-w-0 flex-1">{item.label}</span>
        {item.href === '/alerts' && unreadCount > 0 && <span title="Notificaciones sin leer" aria-label={unreadCount + ' notificaciones sin leer'} className="shrink-0 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-xs text-rose-200">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </Link>
    )
  }

  return (
    <aside aria-label="Navegación principal" className="relative flex h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-tenant-secondary text-white shadow-2xl" style={{ backgroundColor: tenant?.secondaryColor }}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,56,189,0.24),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(239,142,1,0.16),transparent_32%)]" />
      <div className="relative shrink-0 border-b border-white/10 px-4 pb-3 pt-3">
        <Link
          href={isPlatformAdmin ? '/support' : '/dashboard'}
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-lg shadow-slate-950/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]"
        >
          <span className="min-w-0">
            {isPlatformAdmin ? (
              <span className="block">
                <span className="block text-base font-bold text-white">Forwarders ERP</span>
                <span className="block text-xs text-slate-400">Soporte Hernova</span>
              </span>
            ) : (
              <TenantBrand compact inverse />
            )}
          </span>
        </Link>
      </div>


      <nav aria-label="Módulos" className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {!isPlatformAdmin && canAccessPath(currentRole, '/quotations/new') && (
          <Link href="/quotations/new" aria-current={pathname === '/quotations/new' ? 'page' : undefined} className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-tenant-primary px-3 py-3 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400">
            <Plus size={17} aria-hidden="true" /> Nueva cotización
          </Link>
        )}
        {!isPlatformAdmin && (
          <div className="space-y-1">{navItems.filter((item) => generalPaths.includes(item.href) && canAccessPath(currentRole, item.href)).map(renderItem)}</div>
        )}
        {!isPlatformAdmin && groups.map((group, index) => {
          const active = group.items.some((item: NavItem) => isSidebarItemActive(pathname, item.href, item.exact))
          const open = active ? collapsedActivePath !== pathname : !(collapsed[group.id] ?? index > 0)
          const id = navId + '-' + group.id
          return <div key={group.id}>
            <button type="button" aria-expanded={open} aria-controls={id} onClick={() => {
              if (active) setCollapsedActivePath(open ? pathname : null)
              const value = JSON.stringify({ ...collapsed, [group.id]: open })
              memoryPreferences.set(preferenceKey, value)
              try { window.localStorage.setItem(preferenceKey, value) } catch { /* Preferences remain available for this session. */ }
              window.dispatchEvent(new Event(preferenceEvent))
            }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-orange-400">
              {group.label}<ChevronDown size={14} aria-hidden="true" className={open ? '' : '-rotate-90'} />
            </button>
            <div id={id} hidden={!open} className="space-y-1">{group.items.map(renderItem)}</div>
          </div>
        })}
      </nav>
      <div className="relative shrink-0 border-t border-white/10 bg-black/10 p-3 backdrop-blur-xl">
        {canAccessPath(currentRole, '/support') && renderItem({ label: 'Mesa de ayuda', href: '/support', icon: LifeBuoy })}
        {!isPlatformAdmin && <Link
          href="/profile"
          aria-current={pathname === '/profile' ? 'page' : undefined}
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3 shadow-sm shadow-slate-950/10 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.085] hover:shadow-lg hover:shadow-[#0038BD]/10"
        >
          {profile?.avatar_url ? (
            <Image
              width={36}
              height={36}
              unoptimized
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
              {currentRole || 'Usuario'}
            </p>
          </div>
        </Link>}

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-3 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  )
}
