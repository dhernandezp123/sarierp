'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Ship, Plane, Truck, Package,
  MapPin, Calendar, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

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

function statusColor(status: string): string {
  if (['En Tránsito', 'Embarcado'].includes(status))
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  if (status === 'Arribado')
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
  if (status === 'Booking Confirmado')
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
  if (status === 'Listo para Embarque')
    return 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Mis Envíos</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Contenedores, carga LCL, aérea y terrestre
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por routing, origen, destino…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-center dark:border-slate-800 dark:bg-slate-900">
          <Ship className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">
            {all.length === 0 ? 'No tienes envíos activos' : 'Sin resultados'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {all.length === 0
              ? 'Aquí verás tus contenedores, carga LCL y aérea'
              : 'Intenta con otro filtro o búsqueda'}
          </p>
        </div>
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
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor(s.shipment_status)}`}>
                    {s.shipment_status}
                  </span>
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
