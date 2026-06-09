'use client'

import Sidebar from './sidebar'

interface Props {
  children: React.ReactNode
  role: string
}

export default function AppLayout({ children, role }: Props) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} />

      <main className="flex-1 overflow-y-auto bg-zinc-50 p-8">
        {children}
      </main>
    </div>
  )
}
