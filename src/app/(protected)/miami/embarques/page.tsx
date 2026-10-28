'use client'

import { withDemoPrintWatermark } from '@/src/lib/demo-print'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plane, Ship, CheckSquare, Square, SendHorizonal, PackageCheck } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import {
  type CompanyBranding,
  getCompanyDisplayName,
  getCompanyTradeName,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'
import { loadMiamiDispatch } from '@/src/lib/miami-reads'
import { useUser } from '@/src/hooks/useUser'
import { Pagination } from '@/src/components/ui/Pagination'

import { loadCurrentCompanySettings } from '@/src/lib/company-settings'

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

type ShipmentRow = {
  id: string
  shipment_number: string
  transport_mode: string | null
  status: string
  total_packages: number
  total_weight_lbs: number
  dispatched_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmbarquesPage() {
  const { profile, user } = useUser()
  const context = (profile?.tenant_id || '') + ':' + (user?.id || '')
  const loadVersion = useRef(0)
  const activeContext = useRef<string | null>(context)
  const [loadedContext, setLoadedContext] = useState('')
  const [loadError, setLoadError] = useState('')
  const [packagePage, setPackagePage] = useState(1)
  const [packagePageSize, setPackagePageSize] = useState(25)
  const [shipmentPage, setShipmentPage] = useState(1)
  const [shipmentPageSize, setShipmentPageSize] = useState(25)
  const [packages, setPackages]     = useState<Pkg[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [dispatching, setDispatching] = useState(false)
  const [filterTipo, setFilterTipo] = useState('Todos')
  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [transportMode, setTransportMode] = useState('Maritimo')
  const [companyBranding, setCompanyBranding] =
    useState<CompanyBranding>(normalizeCompanyBranding(null))

  const load = useCallback(async () => {
    if (activeContext.current !== context) return
    const version = ++loadVersion.current
    const isCurrent = () => version === loadVersion.current && activeContext.current === context
    setLoading(true)
    setLoadError('')
    try {
      const [rows, company] = await Promise.all([loadMiamiDispatch(supabase, isCurrent), loadCurrentCompanySettings(supabase)])
      if (!isCurrent()) return
      if (company.error) throw new Error('No se pudo cargar la informacion de la empresa.')
      setPackages(rows.packages as unknown as Pkg[])
      setShipments(rows.shipments as ShipmentRow[])
      setCompanyBranding(normalizeCompanyBranding(company.data))
      setSelected(new Set())
      setLoadedContext(context)
    } catch (error) {
      if (isCurrent()) setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los paquetes y embarques.')
    } finally { if (isCurrent()) setLoading(false) }
  }, [context])

  useEffect(() => {
    activeContext.current = context
    const timeout = window.setTimeout(() => void load(), 0)
    return () => { window.clearTimeout(timeout); activeContext.current = null; loadVersion.current += 1 }
  }, [load, context])

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () => {
    setSelected(previous => {
      const next = new Set(previous)
      const remove = filtered.every(row => next.has(row.id))
      for (const row of filtered) { if (remove) next.delete(row.id); else next.add(row.id) }
      return next
    })
  }

  const dispatchSelected = async () => {
    if (selected.size === 0) { toast.info('Selecciona al menos un paquete'); return }
    setDispatching(true)
    const { data, error } = await supabase.rpc('create_miami_shipment', {
      p_package_ids: Array.from(selected),
      p_transport_mode: transportMode,
      p_notes: null,
    })
    setDispatching(false)
    if (error) { toast.error(error.message); return }
    const result = Array.isArray(data) ? data[0] : null
    const shipmentNumber = result?.shipment_number ? ` (${result.shipment_number})` : ''
    if (shipmentNumber) {
      toast.success(`${selected.size} paquete${selected.size !== 1 ? 's' : ''} despachado${selected.size !== 1 ? 's' : ''}${shipmentNumber}`)
      load()
      return
    }
    toast.success(`${selected.size} paquete${selected.size !== 1 ? 's' : ''} marcado${selected.size !== 1 ? 's' : ''} En Tránsito`)
    load()
  }

  const printList = () => {
    const items = packages.filter((p) => selected.has(p.id))
    if (items.length === 0) { toast.info('Selecciona paquetes para imprimir la lista'); return }

    const today = new Date().toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const totalWeight = items.reduce((s, p) => s + Number(p.weight_lbs || 0), 0)
    const companyName = getCompanyDisplayName(companyBranding)
    const tradeName = getCompanyTradeName(companyBranding)

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
    <h2>${companyName}</h2>
    <p>Lista de Embarque — Miami → Honduras</p>
    <p>Fecha: ${today} &nbsp;|&nbsp; Total paquetes: ${items.length} &nbsp;|&nbsp; Peso total: ${totalWeight.toFixed(2)} lbs</p>
    <table><thead><tr><th>#</th><th>WH #</th><th>Tracking</th><th>Cliente</th><th>Código</th><th>Tipo</th><th>Peso</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="footer">Generado: ${today} — ${tradeName} ERP</div>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) { toast.error('Permite ventanas emergentes para imprimir'); return }
    win.document.write(withDemoPrintWatermark(html))
    win.document.close()
    win.print()
  }

  // ── Filters ───────────────────────────────────────────────────────────────
  const filtered = packages.filter((p) =>
    filterTipo === 'Todos' || p.tipo_carga === filterTipo
  )

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))
  const visiblePackagePage = Math.min(packagePage, Math.max(1, Math.ceil(filtered.length / packagePageSize)))
  const visibleShipmentPage = Math.min(shipmentPage, Math.max(1, Math.ceil(shipments.length / shipmentPageSize)))
  const totalWeightSelected = packages
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + Number(p.weight_lbs || 0), 0)

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loadError) return <div className={cardClass}><p role="alert">{loadError}</p><button type="button" onClick={() => void load()} className={fieldClass}>Reintentar</button></div>
  if (loading || loadedContext !== context) return <TableSkeleton rows={6} cols={6} />

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
            <select
              value={transportMode}
              onChange={(event) => setTransportMode(event.target.value)}
              className={`${fieldClass} h-9 w-32 py-1 text-xs`}
            >
              <option value="Maritimo">Maritimo</option>
              <option value="Aereo">Aereo</option>
              <option value="Terrestre">Terrestre</option>
              <option value="Courier">Courier</option>
            </select>
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

      <div className={`${cardClass} p-0`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Embarques recientes</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Despachos Miami persistentes creados desde esta lista.
            </p>
          </div>
          <PackageCheck className="h-5 w-5 text-slate-400" />
        </div>
        {shipments.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-500 dark:text-slate-400">
            Aun no hay embarques Miami creados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60">
                  {['Embarque', 'Modo', 'Estado', 'Paquetes', 'Peso', 'Fecha'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shipments.slice((visibleShipmentPage - 1) * shipmentPageSize, visibleShipmentPage * shipmentPageSize).map((shipment) => (
                  <tr key={shipment.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {shipment.shipment_number}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {shipment.transport_mode || 'Pendiente'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {shipment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{shipment.total_packages}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {Number(shipment.total_weight_lbs || 0).toFixed(1)} lbs
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {fmtDate(shipment.dispatched_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={visibleShipmentPage} pageSize={shipmentPageSize} total={shipments.length} onPageChange={setShipmentPage} onPageSizeChange={setShipmentPageSize} />
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
                onClick={() => { setFilterTipo(t); setPackagePage(1) }}
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
                {filtered.slice((visiblePackagePage - 1) * packagePageSize, visiblePackagePage * packagePageSize).map((p) => {
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
            <Pagination page={visiblePackagePage} pageSize={packagePageSize} total={filtered.length} onPageChange={setPackagePage} onPageSizeChange={setPackagePageSize} />
          </div>
        )}
      </div>

    </div>
  )
}
