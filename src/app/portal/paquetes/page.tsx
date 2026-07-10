'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, ChevronRight } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import {
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalFilterPills,
  PortalPageHeader,
  PortalSearchInput,
  PortalStatusBadge,
} from '@/src/components/portal/PortalUI'

type PackageRow = {
  id: string
  tracking_number: string
  carrier: string | null
  warehouse_number: string | null
  weight_lbs: number | null
  status: string
  received_at: string
}

const STATUS_FILTERS = ['Todos', 'Asignado', 'Entregado', 'Con incidencia', 'Sin asignar'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]
const PAGE_SIZE = 20

const statusLabel: Record<string, string> = {
  'Sin asignar': 'Pendiente',
  Asignado: 'En bodega',
  Entregado: 'Entregado',
  'Con incidencia': 'Incidencia',
}

export default function PortalPaquetesPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos')
  const [search, setSearch] = useState('')

  const loadPackages = async (clientId: string, reset: boolean) => {
    if (reset) setLoading(true)
    else setLoadingMore(true)

    const from = reset ? 0 : packages.length
    const { data } = await supabase
      .from('miami_packages')
      .select('id, tracking_number, carrier, warehouse_number, weight_lbs, status, received_at')
      .eq('cliente_id', clientId)
      .order('received_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    const rows = (data ?? []) as PackageRow[]
    setHasMore(rows.length === PAGE_SIZE)

    if (reset) {
      setPackages(rows)
      setLoading(false)
    } else {
      setPackages(prev => [...prev, ...rows])
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadPackages(clientId, true), 0)
    return () => window.clearTimeout(timeout)
  }, [profile?.cliente_id])

  const filtered = packages.filter(p => {
    const matchStatus = statusFilter === 'Todos' || p.status === statusFilter
    const matchSearch = !search.trim() || p.tracking_number.toLowerCase().includes(search.toLowerCase()) || (p.warehouse_number ?? '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="Mis Paquetes"
        subtitle="Historial de paquetes recibidos en bodega Miami"
      />

      <PortalSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por tracking o WH#..."
      />

      <PortalFilterPills
        options={STATUS_FILTERS}
        value={statusFilter}
        onChange={setStatusFilter}
        labelFor={(status) => status === 'Asignado' ? 'En bodega' : status}
      />

      {/* List */}
      <PortalCard>
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <PortalEmptyState
            icon={<Package className="h-8 w-8" />}
            title={packages.length === 0 ? 'No tienes paquetes aún' : 'Sin resultados para ese filtro'}
            description={packages.length === 0 ? 'Tus paquetes aparecerán aquí cuando lleguen a bodega.' : undefined}
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(p => {
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
                    <PortalStatusBadge status={p.status} label={statusLabel[p.status] ?? p.status} />
                    <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && hasMore && !search.trim() && statusFilter === 'Todos' && (
          <div className="border-t border-slate-100 p-4 dark:border-slate-800">
            <PortalButton
              variant="secondary"
              onClick={() => profile?.cliente_id && loadPackages(profile.cliente_id, false)}
              disabled={loadingMore}
              className="w-full"
            >
              {loadingMore ? 'Cargando...' : 'Cargar más paquetes'}
            </PortalButton>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-2.5 dark:border-slate-800">
            <p className="text-xs text-slate-400">{filtered.length} paquetes cargados</p>
          </div>
        )}
      </PortalCard>
    </div>
  )
}
