'use client'

import Sidebar from './sidebar'
import {
  LayoutDashboard,
  Users,
  FileText,
  History,
  Scale,
  DollarSign,
} from 'lucide-react'

interface Props {
  children: React.ReactNode
  role: string
}

export default function AppLayout({ children, role }: Props) {
  return (
    <div className="flex">
      <Sidebar role={role} />

      <main className="flex-1 bg-gray-100 min-h-screen p-8">
        {children}
      </main>
    </div>
  )
}