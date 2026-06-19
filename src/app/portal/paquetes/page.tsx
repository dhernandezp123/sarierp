'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, ChevronRight, CheckCircle2, Clock, AlertTriangle, Search } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type PackageRow = {
  id: string
  tracking_number: string
  carrier: string | null
  warehouse_number: string | null
  weight_lbs: number | null
  status: string
  received_at: string
}

const STATUS_FILTERS = ['Todos', 'Asignado', 'Entregado', 'Con incidencia', 'Sin asignar']

const statusConfig: Record<string, { label: string; color: string }> = {
  'Sin asignar':    { label: 'Pendiente',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  'Asignado':       { label: 'En bodega',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  'Entregado':      { label: 'Entregado',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  'Con incidencia': { label: 'Incidencia',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

export default function PortalPaquetesPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!profile?.cliente_id) return
    loadPackages()
  }, [profile?.cliente_id])

  const loadPackages = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('miami_packages')
      .select('id, tracking_number, carrier, warehouse_number, weight_lbs, status, received_at')
      .eq('cliente_id', profile.cliente_id)
      .order('received_at', { ascending: false })

    setPackages((data ?? []) as PackageRow[])
    setLoading(false)
  }

  const filtered = packages.filter(p => {
    const matchStatus = statusFilter === 'Todos' || p.status === statusFilter
    const matchSearch = !search.trim() || p.tracking_number.toLowerCase().includes(search.toLowerCase()) || (p.warehouse_number ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Mis Paquetes</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Historial de paquetes recibidos en bodega Miami</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tracking o WH#..."
          className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-blue-400"
        />
      </div>

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              statusFilter === s
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {s === 'Asignado' ? 'En bodega' : s}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {packages.length === 0 ? 'No tienes paquetes aún' : 'Sin resultados para ese filtro'}
            </p>
            {packages.length === 0 && (
              <p className="mt-1 text-xs text-slate-400">Tus paquetes aparecerán aquí cuando lleguen a bodega</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(p => {
              const cfg = statusConfig[p.status] ?? { label: p.status, color: 'bg-slate-100 text-slate-600' }
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => router.push(`/portal/paquetes/${p.id}`)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Package className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{p.tracking_number}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {p.carrier ?? 'Sin carrier'}
                      {p.warehouse_number && <span className="text-slate-500"> · WH: {p.warehouse_number}</span>}
                      {p.weight_lbs && <span> · {p.weight_lbs} lbs</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(p.received_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2.5 dark:border-slate-800">
            <p className="text-xs text-slate-400">{filtered.length} de {packages.length} paquetes</p>
          </div>
        )}
      </div>
    </div>
  )
}
