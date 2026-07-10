'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Ship, Plane, Truck, Package,
  MapPin, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import {
  PortalCard,
  PortalEmptyState,
  PortalFilterPills,
  PortalPageHeader,
  PortalSearchInput,
  PortalStatusBadge,
} from '@/src/components/portal/PortalUI'

type Shipment = {
  id: string
  routing_number: string
  shipment_status: string
  carrier: string | null
  etd: string | null
  eta: string | null
  created_at: string
  service_product: string | null
  origen: string | null
  destino: string | null
  quotation_number: string | null
}

const SERVICE_LABELS: Record<string, string> = {
  miami_lcl:         'LCL Miami',
  miami_air:         'Aéreo Miami',
  other_origin_fcl:  'FCL',
  other_origin_lcl:  'LCL Internacional',
  other_origin_air:  'Aéreo Consolidado',
  usa_ltl_ftl:       'Terrestre USA',
  courier:           'Courier',
}

const SERVICE_ICON: Record<string, React.ReactNode> = {
  miami_lcl:         <Ship className="h-4 w-4" />,
  miami_air:         <Plane className="h-4 w-4" />,
  other_origin_fcl:  <Ship className="h-4 w-4" />,
  other_origin_lcl:  <Ship className="h-4 w-4" />,
  other_origin_air:  <Plane className="h-4 w-4" />,
  usa_ltl_ftl:       <Truck className="h-4 w-4" />,
  courier:           <Package className="h-4 w-4" />,
}

const SERVICE_COLOR: Record<string, string> = {
  miami_lcl:         'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  miami_air:         'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',
  other_origin_fcl:  'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300',
  other_origin_lcl:  'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300',
  other_origin_air:  'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300',
  usa_ltl_ftl:       'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
  courier:           'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
}

function fmt(date: string | null) {
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const FILTERS = ['Todos', 'FCL', 'LCL', 'Aéreo', 'Terrestre'] as const
type Filter = (typeof FILTERS)[number]

function matchesFilter(sp: string | null | undefined, filter: Filter): boolean {
  if (filter === 'Todos') return true
  if (filter === 'FCL') return sp === 'other_origin_fcl'
  if (filter === 'LCL') return sp === 'miami_lcl' || sp === 'other_origin_lcl'
  if (filter === 'Aéreo') return sp === 'miami_air' || sp === 'other_origin_air'
  if (filter === 'Terrestre') return sp === 'usa_ltl_ftl'
  return true
}

export default function EnviosPage() {
  const [all, setAll]       = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('Todos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.rpc('get_client_shipments', {
        p_shipment_id: null,
        p_include_completed: false,
      })
      if (error) toast.error('No se pudieron cargar tus envíos')
      setAll((data ?? []) as unknown as Shipment[])
      setLoading(false)
    }
    void load()
  }, [])

  const filtered = all.filter(s => {
    const sp = s.service_product
    if (!matchesFilter(sp, filter)) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        s.routing_number.toLowerCase().includes(q) ||
        (s.origen ?? '').toLowerCase().includes(q) ||
        (s.destino ?? '').toLowerCase().includes(q) ||
        (s.carrier ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="Mis Envíos"
        subtitle="Contenedores, carga LCL, aérea y terrestre"
      />

      <PortalSearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por routing, origen, destino..."
      />

      <PortalFilterPills options={FILTERS} value={filter} onChange={setFilter} />

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <PortalCard>
          <PortalEmptyState
            icon={<Ship className="h-10 w-10" />}
            title={all.length === 0 ? 'No tienes envíos activos' : 'Sin resultados'}
            description={all.length === 0
              ? 'Aquí verás tus contenedores, carga LCL y aérea.'
              : 'Intenta con otro filtro o búsqueda.'}
          />
        </PortalCard>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const sp = s.service_product ?? ''
            return (
              <Link
                key={s.id}
                href={`/portal/envios/${s.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Service type icon */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SERVICE_COLOR[sp] ?? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                      {SERVICE_ICON[sp] ?? <Ship className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                          {s.routing_number}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {SERVICE_LABELS[sp] ?? sp}
                        </span>
                      </div>
                      {s.origen && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {s.origen} → {s.destino ?? '—'}
                        </p>
                      )}
                    </div>
                  </div>
                  <PortalStatusBadge status={s.shipment_status} className="shrink-0 py-1" />
                </div>

                {/* Dates row */}
                {(s.etd || s.eta) && (
                  <div className="mt-3 flex gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {s.etd && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">ETD</span>
                        {fmt(s.etd)}
                      </div>
                    )}
                    {s.eta && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-700 dark:text-slate-300">ETA</span>
                        {fmt(s.eta)}
                      </div>
                    )}
                    {s.carrier && (
                      <span className="ml-auto text-xs text-slate-400">{s.carrier}</span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          {filtered.length} envío{filtered.length !== 1 ? 's' : ''} activo{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
