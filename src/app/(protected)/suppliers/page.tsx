'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'

type Proveedor = {
  id: string
  nombre: string
  tipo: string
  contacto: string | null
  email: string | null
  moneda: string
  terminos_pago: number
  is_active: boolean
  pais: string | null
  agents: { name: string } | null
}

const SUPPLIER_TYPES = ['Agente', 'Carrier', 'Aduanal', 'Transporte', 'Almacen', 'Courier', 'Otro']

const TIPO_COLORS: Record<string, string> = {
  Agente: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Carrier: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  Aduanal: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Transporte: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Almacen: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  Courier: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  Otro: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

export default function SuppliersPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('Todos')
  const [showInactive, setShowInactive] = useState(false)

  const fetchProveedores = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('proveedores')
      .select('id, nombre, tipo, contacto, email, moneda, terminos_pago, is_active, pais, agents(name)')
      .order('nombre', { ascending: true })

    if (error) {
      toast.error(error.message)
    } else {
      setProveedores((data || []) as unknown as Proveedor[])
    }
    setLoading(false)
  }

  useEffect(() => { fetchProveedores() }, [])

  const filtered = proveedores.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch = p.nombre.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.contacto?.toLowerCase().includes(q)
    const matchTipo = tipoFilter === 'Todos' || p.tipo === tipoFilter
    const matchActive = showInactive ? true : p.is_active
    return matchSearch && matchTipo && matchActive
  })

  const metrics = {
    total: proveedores.filter((p) => p.is_active).length,
    byTipo: Object.fromEntries(
      ['Agente', 'Carrier', 'Aduanal', 'Transporte'].map((t) => [
        t, proveedores.filter((p) => p.tipo === t && p.is_active).length,
      ])
    ),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Agentes, carriers, aduanales y otros proveedores de servicio.
          </p>
        </div>
        <Link href="/suppliers/new" className={primaryButtonClass}>
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total activos', value: metrics.total, color: 'text-slate-900 dark:text-white' },
          { label: 'Agentes', value: metrics.byTipo.Agente ?? 0, color: 'text-blue-700 dark:text-blue-300' },
          { label: 'Carriers', value: metrics.byTipo.Carrier ?? 0, color: 'text-violet-700 dark:text-violet-300' },
          { label: 'Aduanales', value: metrics.byTipo.Aduanal ?? 0, color: 'text-amber-700 dark:text-amber-300' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
          className={`${fieldClass} w-40`}
        >
          <option value="Todos">Todos los tipos</option>
          {SUPPLIER_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      <div className={cardClass}>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="No hay proveedores"
            description="Agrega un agente, carrier u otro proveedor para registrar cuentas por pagar."
            action={{ label: 'Nuevo proveedor', href: '/suppliers/new' }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Proveedor', 'Tipo', 'Contacto', 'Credito', 'Moneda', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{p.nombre}</div>
                      {p.pais && <div className="text-xs text-slate-400">{p.pais}</div>}
                      {p.agents && <div className="text-xs text-blue-500">Agente ERP: {(p.agents as any).name}</div>}
                      {!p.is_active && <span className="text-xs italic text-slate-400">Inactivo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIPO_COLORS[p.tipo] ?? TIPO_COLORS.Otro}`}>
                        {p.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300">{p.contacto || '-'}</div>
                      <div className="text-xs text-slate-400">{p.email || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {p.terminos_pago} dias
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.moneda}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/suppliers/${p.id}`}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-800">
              <p className="text-xs text-slate-400">{filtered.length} de {proveedores.length} proveedores</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
