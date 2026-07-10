'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { Package, LogOut, User, Bell, Home, Ship } from 'lucide-react'
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
    if (!user || !profile) { router.replace('/portal/login'); return }
    if (profile.rol !== 'Cliente') {
      toast.error('Esta área es solo para clientes.')
      router.replace('/dashboard')
      return
    }
    if (profile.status !== 'Aprobado' || !profile.is_active) {
      router.replace('/portal/login')
    }
  }, [isPublicPortalPath, loading, user, profile, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/portal/login')
  }

  const { unreadCount } = useClientNotifications(profile?.id)

  if (isPublicPortalPath) return children
  if (loading || !user || !profile || profile.rol !== 'Cliente') return null

  const navItems = [
    { href: '/portal', label: 'Inicio', icon: Home },
    { href: '/portal/envios', label: 'Envíos', icon: Ship },
    { href: '/portal/paquetes', label: 'Paquetería', icon: Package },
    { href: '/portal/pre-alertas', label: 'Pre-alertas', icon: Bell },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020817]">
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

          <nav className="hidden items-center gap-1 sm:flex">
            {navItems.map(item => {
              const active = item.href === '/portal'
                ? pathname === '/portal'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <User className="h-4 w-4" />
              <span className="hidden sm:inline max-w-[120px] truncate">{profile.nombre ?? user.email}</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión"
              className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:pb-10">
        {children}
      </main>

      {/* Mobile bottom nav (fixed) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-[#07111F]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm sm:hidden">
        {navItems.map(item => {
          const active = item.href === '/portal'
            ? pathname === '/portal'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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
        <Link
          href="/portal/notificaciones"
          className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
            pathname === '/portal/notificaciones'
              ? 'text-blue-400'
              : 'text-slate-400'
          }`}
        >
          <span className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-600 text-[8px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          Avisos
        </Link>
        <Link
          href="/portal/perfil"
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition ${
            pathname.startsWith('/portal/perfil')
              ? 'text-blue-400'
              : 'text-slate-400'
          }`}
        >
          <User className="h-5 w-5" />
          Perfil
        </Link>
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
