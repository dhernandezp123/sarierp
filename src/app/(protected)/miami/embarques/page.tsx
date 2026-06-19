'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plane, Ship, CheckSquare, Square, SendHorizonal } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'

// ─── Types ───────────────────────────────────────────────────────────────────

type Pkg = {
  id: string
  tracking_number: string
  carrier: string | null
  tipo_carga: string | null
  cargo_status: string | null
  weight_lbs: number | null
  warehouse_number: string | null
  received_at: string
  clientes?: { nombre: string | null; codigo_cliente: string | null } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmbarquesPage() {
  const [packages, setPackages]     = useState<Pkg[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [dispatching, setDispatching] = useState(false)
  const [filterTipo, setFilterTipo] = useState('Todos')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    // Only show packages that are ready to dispatch (in bodega, not yet in transit)
    const { data, error } = await supabase
      .from('miami_packages')
      .select('id, tracking_number, carrier, tipo_carga, cargo_status, weight_lbs, warehouse_number, received_at, clientes(nombre, codigo_cliente)')
      .in('cargo_status', ['Recibido en Miami', 'En Consolidación'])
      .order('received_at', { ascending: true })
      .limit(500)
    if (error) toast.error('Error al cargar paquetes')
    setPackages((data || []) as unknown as Pkg[])
    setLoading(false)
    setSelected(new Set())
  }

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((p) => p.id)))
    }
  }

  const dispatchSelected = async () => {
    if (selected.size === 0) { toast.info('Selecciona al menos un paquete'); return }
    setDispatching(true)
    const { error } = await supabase
      .from('miami_packages')
      .update({ cargo_status: 'En Tránsito' })
      .in('id', Array.from(selected))
    setDispatching(false)
    if (error) { toast.error(error.message); return }
    toast.success(`${selected.size} paquete${selected.size !== 1 ? 's' : ''} marcado${selected.size !== 1 ? 's' : ''} En Tránsito`)
    load()
  }

  const printList = () => {
    const items = filtered.filter((p) => selected.has(p.id))
    if (items.length === 0) { toast.info('Selecciona paquetes para imprimir la lista'); return }

    const today = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const totalWeight = items.reduce((s, p) => s + Number(p.weight_lbs || 0), 0)

    const rows = items.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.warehouse_number || '—'}</td>
        <td>${p.tracking_number}</td>
        <td>${(p.clientes as any)?.nombre || '—'}</td>
        <td>${(p.clientes as any)?.codigo_cliente || '—'}</td>
        <td>${p.tipo_carga || 'Paquetería'}</td>
        <td>${p.weight_lbs ? `${p.weight_lbs} lbs` : '—'}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Lista de Embarque</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
      h2 { color: #0038BD; margin-bottom: 4px; }
      p { margin: 2px 0; color: #555; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { background: #0f172a; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
      td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      tr:nth-child(even) td { background: #f8fafc; }
      .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      @media print { body { margin: 10mm; } }
    </style></head><body>
    <h2>SARI EXPRESS S DE R.L. DE C.V.</h2>
    <p>Lista de Embarque — Miami → Honduras</p>
    <p>Fecha: ${today} &nbsp;|&nbsp; Total paquetes: ${items.length} &nbsp;|&nbsp; Peso total: ${totalWeight.toFixed(2)} lbs</p>
    <table><thead><tr><th>#</th><th>WH #</th><th>Tracking</th><th>Cliente</th><th>Código</th><th>Tipo</th><th>Peso</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Generado: ${today} — Forwarders ERP</div>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) { toast.error('Permite ventanas emergentes para imprimir'); return }
    win.document.write(html)
    win.document.close()
    win.print()
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = packages.filter((p) =>
    filterTipo === 'Todos' || p.tipo_carga === filterTipo
  )

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const totalWeightSelected = filtered
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + Number(p.weight_lbs || 0), 0)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Miami Bodega
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">Lista de Embarque</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Selecciona los paquetes listos para despachar a Honduras. Se marcarán "En Tránsito".
          </p>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {selected.size} seleccionado{selected.size !== 1 ? 's' : ''} · {totalWeightSelected.toFixed(1)} lbs
            </span>
            <button type="button" onClick={printList} className={secondaryButtonClass}>
              Imprimir lista
            </button>
            <button type="button" onClick={dispatchSelected} disabled={dispatching} className={primaryButtonClass}>
              <SendHorizonal className="h-4 w-4" />
              {dispatching ? 'Despachando...' : 'Marcar En Tránsito'}
            </button>
          </div>
        )}
      </div>

      {/* Filtro tipo */}
      <div className={`${cardClass} py-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {['Todos', 'Paquetería', 'LCL', 'Aéreo Consolidado'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterTipo(t)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  filterTipo === t
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {t === 'Todos' ? <><Ship className="mr-1 inline h-3 w-3" />Todos</> : t}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-slate-400">{filtered.length} paquete{filtered.length !== 1 ? 's' : ''} listos para despacho</span>
        </div>
      </div>

      {/* Table */}
      <div className={`${cardClass} overflow-hidden p-0`}>
        {loading ? (
          <div className="p-6"><TableSkeleton rows={6} cols={7} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Plane className="h-6 w-6" />}
            title="Sin paquetes pendientes de despacho"
            description='Todos los paquetes en "Recibido en Miami" o "En Consolidación" aparecerán aquí.'
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  <th className="w-10 px-4 py-3">
                    <button type="button" onClick={toggleAll} className="text-slate-300 hover:text-white transition">
                      {allSelected
                        ? <CheckSquare className="h-4 w-4 text-blue-400" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </th>
                  {['WH #', 'Tracking', 'Cliente', 'Tipo', 'Estado actual', 'Peso', 'Recibido'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isSelected = selected.has(p.id)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => toggleSelect(p.id)}
                      className={`cursor-pointer border-b border-slate-100 transition dark:border-slate-800 ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-950/20'
                          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20'
                      }`}
                    >
                      <td className="px-4 py-3">
                        {isSelected
                          ? <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          : <Square className="h-4 w-4 text-slate-300" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {p.warehouse_number || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{p.tracking_number}</p>
                        {p.carrier && <p className="text-xs text-slate-400">{p.carrier}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {(p.clientes as any)?.nombre || <span className="text-slate-300 text-xs">Sin cliente</span>}
                        {(p.clientes as any)?.codigo_cliente && (
                          <p className="text-xs text-slate-400">{(p.clientes as any).codigo_cliente}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {p.tipo_carga || 'Paquetería'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          p.cargo_status === 'En Consolidación'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                        }`}>
                          {p.cargo_status || 'Recibido en Miami'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {p.weight_lbs ? `${p.weight_lbs} lbs` : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                        {fmtDate(p.received_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
