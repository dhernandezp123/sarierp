'use client'

import Sidebar from './sidebar'

interface Props {
  children: React.ReactNode
  role: string
}

export default function AppLayout({ children, role }: Props) {
  return (
    <div className="flex">
      <Sidebar role={role} />

      <main className="flex-1 p-8 bg-zinc-50 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
