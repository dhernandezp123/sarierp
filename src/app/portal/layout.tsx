'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Package, LogOut, User, Bell, Home, Ship, ClipboardList } from 'lucide-react'
import { PortalUnlinked } from '@/src/components/portal/PortalFeedback'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { UserProvider, useUser } from '@/src/hooks/useUser'
import { useClientNotifications } from '@/src/hooks/useClientNotifications'

function PortalShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const isPublicPortalPath = [
    '/portal/login',
    '/portal/register',
    '/portal/forgot-password',
    '/portal/reset-password',
  ].includes(pathname)

  useEffect(() => {
    if (isPublicPortalPath) return
    if (loading) return
    if (!user || !profile) {
      const returnTo = `${pathname}${window.location.search}${window.location.hash}`
      router.replace(`/portal/login?next=${encodeURIComponent(returnTo)}`)
      return
    }
    if (profile.rol !== 'Cliente') {
      toast.error('Esta área es solo para clientes.')
      router.replace('/dashboard')
      return
    }
    if (profile.status !== 'Aprobado' || !profile.is_active) {
      router.replace('/portal/login')
    }
  }, [isPublicPortalPath, loading, user, profile, router, pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/portal/login')
  }

  const { unreadCount } = useClientNotifications(profile?.id)

  if (isPublicPortalPath) return children
  if (loading || !user || !profile || profile.rol !== 'Cliente' || profile.status !== 'Aprobado' || !profile.is_active) return <div role="status" className="p-8 text-center text-sm text-slate-500">Preparando tu portal…</div>

  const navItems = [
    { href: '/portal', label: 'Inicio', icon: Home },
    { href: '/portal/paquetes', label: 'Paquetes', icon: Package },
    { href: '/portal/envios', label: 'Envíos', icon: Ship },
    { href: '/portal/solicitudes', label: 'Solicitudes', icon: ClipboardList },
    { href: '/portal/perfil', label: 'Cuenta', icon: User },
  ]
  const isActive = (href: string) => href === '/portal' ? pathname === href : href === '/portal/solicitudes' ? ['/portal/solicitudes', '/portal/pre-alertas', '/portal/pickup', '/portal/incidencias', '/portal/calculadora'].some(path => pathname.startsWith(path)) : pathname.startsWith(href)

  return (
    <div className="portal-shell min-h-screen bg-slate-50 text-slate-900 dark:bg-[#020817] dark:text-slate-100">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#07111F]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2">
            <Image
              src="/brand/isotipo-color.png"
              alt="Forwarders ERP"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
            <span className="font-semibold text-white">Mi Carga</span>
          </Link>

          <nav aria-label="Navegación principal" className="hidden items-center gap-1 md:flex">
            {navItems.map(item => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-1">
            {/* Bell with unread badge */}
            <Link
              href="/portal/notificaciones"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
              title="Notificaciones"
              aria-label={`Notificaciones${unreadCount ? `, ${unreadCount} sin leer` : ''}`}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            <Link
              href="/portal/perfil"
              aria-label="Mi cuenta"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline max-w-[120px] truncate">{profile.nombre ?? user.email}</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-24 md:pb-10">
        {!profile.cliente_id && !['/portal/contacto', '/portal/perfil', '/portal/notificaciones'].includes(pathname) && !pathname.startsWith('/portal/info/') ? <PortalUnlinked /> : children}
      </main>

      {/* Mobile bottom nav (fixed) */}
      <nav aria-label="Navegación principal móvil" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#07111F]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden">
        {navItems.map(item => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
                active
                  ? 'text-blue-400'
                  : 'text-slate-400'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <PortalShell>{children}</PortalShell>
    </UserProvider>
  )
}
