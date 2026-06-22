'use client'

import Sidebar from '@/src/components/layout/sidebar'
import Topbar from '@/src/components/layout/topbar'
import { ErrorBoundary } from '@/src/components/ui/error-boundary'
import OnboardingTutorial from '@/src/components/onboarding/OnboardingTutorial'
import { useUser } from '@/src/hooks/useUser'
import { canAccessPath, getDefaultPathForRole } from '@/src/lib/permissions'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile, loading } = useUser()
  const pathname = usePathname()
  const router = useRouter()
  const hasValidProfile =
    !!profile && profile.status === 'Aprobado' && profile.is_active === true
  const hasPathAccess = hasValidProfile && canAccessPath(profile.rol, pathname)

  useEffect(() => {
    if (loading) return

    if (!user || !profile || profile.status !== 'Aprobado' || profile.is_active !== true) {
      router.replace('/login')
      return
    }

    if (!canAccessPath(profile.rol, pathname)) {
      toast.error('No tienes permisos para acceder a esta sección')
      router.replace(getDefaultPathForRole(profile.rol))
    }
  }, [loading, pathname, profile, router, user])

  if (loading || !user || !profile || !hasValidProfile || !hasPathAccess) {
    return null
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F7FA] text-slate-900 transition-colors dark:bg-[#020817] dark:text-slate-100">
      <Sidebar role={profile?.rol} />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>

        <OnboardingTutorial />

        <footer className="border-t border-slate-200 bg-[#F5F7FA] px-6 py-3 text-center text-xs text-slate-500">
          Sistema desarrollado por{' '}
          <span className="font-semibold text-slate-700">DHER Solutions</span>{' '}
          para{' '}
          <span className="font-semibold text-slate-700">Sari Express</span>. 2026
        </footer>
      </div>
    </div>
  )
}
