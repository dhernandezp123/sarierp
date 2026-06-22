'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Package, Search } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'

// ─── Types ───────────────────────────────────────────────────────────────────

type Pkg = {
  id: string
  tracking_number: string
  carrier: string | null
  tipo_carga: string | null
  cargo_status: string | null
  status: string
  weight_lbs: number | null
  warehouse_number: string | null
  received_at: string
  clientes?: { nombre: string | null } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CARGO_STATUSES = [
  'Recibido en Miami',
  'En Consolidación',
  'En Tránsito',
  'Llegado Honduras',
  'Entregado',
] as const

type CargoStatus = typeof CARGO_STATUSES[number]

const STATUS_CLS: Record<CargoStatus, string> = {
  'Recibido en Miami':  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'En Consolidación':   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'En Tránsito':        'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Llegado Honduras':   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Entregado':          'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })

const nextStatus = (current: CargoStatus | string | null): CargoStatus | null => {
  if (!current) return 'En Consolidación'
  const idx = CARGO_STATUSES.indexOf(current as CargoStatus)
  if (idx === -1 || idx === CARGO_STATUSES.length - 1) return null
  return CARGO_STATUSES[idx + 1]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventarioPage() {
  const [packages, setPackages] = useState<Pkg[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [filterCargo, setFilterCargo]   = useState<string>('En bodega')
  const [filterTipo, setFilterTipo]     = useState<string>('Todos')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [updatingId, setUpdatingId]     = useState<string | null>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('miami_packages')
      .select('id, tracking_number, carrier, tipo_carga, cargo_status, status, weight_lbs, warehouse_number, received_at, clientes(nombre)')
      .order('received_at', { ascending: false })
    if (error) toast.error('Error al cargar inventario')
    setPackages((data || []) as unknown as Pkg[])
    setLoading(false)
  }

  const advanceStatus = async (pkg: Pkg) => {
    const next = nextStatus(pkg.cargo_status)
    if (!next) return
    setUpdatingId(pkg.id)
    const { error } = await supabase
      .from('miami_packages')
      .update({ cargo_status: next, cargo_status_updated_at: new Date().toISOString() })
      .eq('id', pkg.id)
    setUpdatingId(null)
    if (error) { toast.error(error.message); return }
    toast.success(`Estado actualizado: ${next}`)
    load()
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis: Record<string, number> = {}
  CARGO_STATUSES.forEach((s) => { kpis[s] = packages.filter((p) => p.cargo_status === s).length })

  // ── Filters ───────────────────────────────────────────────────────────────
  const inBodega: CargoStatus[] = ['Recibido en Miami', 'En Consolidación']

  const filtered = packages.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      p.tracking_number.toLowerCase().includes(q) ||
      p.warehouse_number?.toLowerCase().includes(q) ||
      (p.clientes as any)?.nombre?.toLowerCase().includes(q)

    const cs = p.cargo_status as CargoStatus | null
    const matchCargo =
      filterCargo === 'Todos' ? true :
      filterCargo === 'En bodega' ? (cs ? inBodega.includes(cs) : true) :
      p.cargo_status === filterCargo

    const matchTipo = filterTipo === 'Todos' || p.tipo_carga === filterTipo

    return matchSearch && matchCargo && matchTipo
  })

  const paginatedPackages = filtered.slice((page - 1) * pageSize, page * pageSize)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
          Miami Bodega
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">Inventario</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Toda la carga en el sistema — filtra por estatus, tipo y búsqueda.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {CARGO_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setFilterCargo(s); setPage(1) }}
            className={`rounded-2xl border p-3 text-left transition ${
              filterCargo === s
                ? 'border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700/60 dark:bg-[#0b1220] dark:hover:border-slate-600'
            }`}
          >
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{s}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{kpis[s] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className={`${cardClass} py-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Tracking, WH, cliente..."
              className={`${fieldClass} pl-9`}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['En bodega', 'Todos', ...CARGO_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setFilterCargo(s); setPage(1) }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filterCargo === s
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setPage(1) }} className={`${fieldClass} w-auto`}>
            <option value="Todos">Todos los tipos</option>
            <option>Paquetería</option>
            <option>LCL</option>
            <option>Aéreo Consolidado</option>
          </select>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} paquete{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Table */}
      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6"><TableSkeleton rows={8} cols={7} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package className="h-6 w-6" />} title="Sin resultados" description="Ajusta los filtros para ver paquetes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  {['WH #', 'Tracking', 'Cliente', 'Tipo', 'Peso', 'Recibido', 'Estado', 'Avanzar'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedPackages.map((p) => {
                  const cs = (p.cargo_status || 'Recibido en Miami') as CargoStatus
                  const next = nextStatus(cs)
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {p.warehouse_number || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{p.tracking_number}</p>
                        {p.carrier && <p className="text-xs text-slate-400">{p.carrier}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {(p.clientes as any)?.nombre || <span className="text-slate-300 text-xs">Sin asignar</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {p.tipo_carga || 'Paquetería'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {p.weight_lbs ? `${p.weight_lbs} lbs` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                        {fmtDate(p.received_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CLS[cs] || 'bg-slate-100 text-slate-600'}`}>
                          {cs}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {next && (
                          <button
                            type="button"
                            disabled={updatingId === p.id}
                            onClick={() => advanceStatus(p)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {updatingId === p.id ? '...' : `→ ${next}`}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>

    </div>
  )
}
