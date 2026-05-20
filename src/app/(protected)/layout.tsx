'use client'

import Sidebar from '@/src/components/layout/sidebar'
import Topbar from '@/src/components/layout/topbar'

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}