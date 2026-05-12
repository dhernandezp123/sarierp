'use client'

import Link from 'next/link'
import {
  LayoutDashboard,
  Users,
  FileText,
  History,
  Scale,
  DollarSign,
} from 'lucide-react'

interface SidebarProps {
  role: string
}

export default function Sidebar({
  role
}: SidebarProps) {

  const canViewCosts =
    ['Admin', 'Pricing', 'Contabilidad']
      .includes(role)

  return (
  <aside className="w-72 h-screen bg-zinc-950 text-white p-6 border-r border-zinc-800">

    <div className="mb-10">

      <h2 className="text-2xl font-bold tracking-tight">
        Sari Express
      </h2>

      <p className="text-zinc-400 text-sm mt-1">
        Freight Management System
      </p>

    </div>

    <nav className="space-y-2">

      <Link
        href="/dashboard"
        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition"
      >
        <LayoutDashboard size={18} />
        Dashboard
      </Link>

      <Link
        href="/clientes"
        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition"
      >
        <Users size={18} />
        Clientes
      </Link>

      <Link
        href="/quotations/new"
        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition"
      >
        <FileText size={18} />
        Nueva Cotización
      </Link>

      <Link
        href="/historico"
        className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition"
      >
        <History size={18} />
        Histórico
      </Link>

      {canViewCosts && (
        <>
          <Link
            href="/pricing-comparison"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition"
          >
            <Scale size={18} />
            Comparativo
          </Link>

          <Link
            href="/cost-validation"
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-800 transition"
          >
            <DollarSign size={18} />
            Validación
          </Link>
        </>
      )}

    </nav>

  </aside>
)
}