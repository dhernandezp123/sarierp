'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Sidebar from '@/src/components/layout/sidebar'
import Topbar from '@/src/components/layout/topbar'
import { ErrorBoundary } from '@/src/components/ui/error-boundary'
import OnboardingTutorial from '@/src/components/onboarding/OnboardingTutorial'
import { useUser } from '@/src/hooks/useUser'
import { canAccessPath, getDefaultPathForRole } from '@/src/lib/permissions'

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const { profile } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const hasPathAccess = Boolean(profile && canAccessPath(profile.rol, pathname))
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    if (!profile || hasPathAccess) return

    toast.error('No tienes permisos para acceder a esta sección')
    router.replace(getDefaultPathForRole(profile.rol))
  }, [hasPathAccess, profile, router])

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

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-slate-950/60"
          />
          <div className="absolute inset-y-0 left-0 h-full overflow-y-auto shadow-2xl">
            <Sidebar role={profile.rol} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>

        <OnboardingTutorial />

        <footer className="border-t border-slate-200 bg-[#F5F7FA] px-6 py-3 text-center text-xs text-slate-500">
          Sistema desarrollado por{' '}
          <span className="font-semibold text-slate-700">DHER Solutions</span>{' '}
          para <span className="font-semibold text-slate-700">Sari Express</span>. 2026
        </footer>
      </div>
    </div>
  )
}
