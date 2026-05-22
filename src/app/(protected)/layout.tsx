'use client'

import Sidebar from '@/src/components/layout/sidebar'
import Topbar from '@/src/components/layout/topbar'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#020817] dark:text-slate-100">
      <Sidebar />

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
