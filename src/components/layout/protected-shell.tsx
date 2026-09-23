'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Sidebar from '@/src/components/layout/sidebar'
import Topbar from '@/src/components/layout/topbar'
import { ErrorBoundary } from '@/src/components/ui/error-boundary'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/src/components/ui/dialog'
import { X } from 'lucide-react'
import OnboardingTutorial from '@/src/components/onboarding/OnboardingTutorial'
import { useUser } from '@/src/hooks/useUser'
import { canAccessPath, getDefaultPathForRole } from '@/src/lib/permissions'
import { isPlatformSupportPath } from '@/src/lib/tenant-context'
import {
  PLATFORM_ATTRIBUTION,
  PLATFORM_NAME,
} from '@/src/lib/platform-branding'

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { profile } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const isPlatformAdmin = profile?.is_platform_admin === true
  const hasPathAccess = Boolean(
    profile
    && (isPlatformAdmin
      ? isPlatformSupportPath(pathname)
      : canAccessPath(profile.rol, pathname)),
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (desktop.matches) setMobileNavOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!profile || hasPathAccess) return

    toast.error('No tienes permisos para acceder a esta sección')
    router.replace(isPlatformAdmin ? '/support' : getDefaultPathForRole(profile.rol))
  }, [hasPathAccess, isPlatformAdmin, profile, router])

  // Cierra el menú móvil al navegar a otra ruta.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    if (mobileNavOpen) setMobileNavOpen(false)
  }

  if (!profile || !hasPathAccess) return null

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FA] text-slate-900 transition-colors dark:bg-[#020817] dark:text-slate-100">
      <div className="hidden shrink-0 lg:block">
        <Sidebar role={profile.rol} />
      </div>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent showCloseButton={false} aria-describedby={undefined}
          onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById('mobile-nav-trigger')?.focus() }}
          className="left-0 top-0 flex h-dvh w-64 max-w-[calc(100%-2rem)] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-[#07111F] p-0 text-white sm:max-w-64">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-2">
            <DialogTitle>Menú principal</DialogTitle>
            <DialogClose aria-label="Cerrar menú" className="rounded-lg p-2 hover:bg-white/10"><X size={20} /></DialogClose>
          </div>
          <div className="min-h-0 flex-1"><Sidebar role={profile.rol} /></div>
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar mobileNavOpen={mobileNavOpen} onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>

        {!isPlatformAdmin && <OnboardingTutorial />}

        <footer className="border-t border-slate-200 bg-[#F5F7FA] px-6 py-3 text-center text-xs text-slate-500">
          <p className="font-semibold text-slate-700">{PLATFORM_NAME}</p>
          <p>{PLATFORM_ATTRIBUTION}</p>
        </footer>
      </div>
    </div>
  )
}
