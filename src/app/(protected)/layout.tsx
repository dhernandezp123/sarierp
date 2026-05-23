'use client'

import Sidebar from '@/src/components/layout/sidebar'
import Topbar from '@/src/components/layout/topbar'
import { useUser } from '@/src/hooks/useUser'
import { canAccessPath } from '@/src/lib/permissions'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { toast } from 'sonner'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { profile } = useUser()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (profile && !canAccessPath(profile.rol, pathname)) {
      toast.error('No tienes permisos para acceder a esta sección')
      router.replace('/dashboard')
    }
  }, [pathname, profile, router])

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#020817] dark:text-slate-100">
      <Sidebar role={profile?.rol} />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 p-6">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-6 py-3 text-center text-xs text-slate-500">
          Sistema desarrollado por{' '}
          <span className="font-semibold text-slate-700">DHER Solutions</span>{' '}
          para{' '}
          <span className="font-semibold text-slate-700">Sari Express</span>. 2026
        </footer>
      </div>
    </div>
  )
}
