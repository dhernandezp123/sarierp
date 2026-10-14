'use client'

import { formatSupplierAmount, loadSupplierPayables, supplierPayableIssue, supplierPayableSummary, type SupplierPayable } from '@/src/lib/supplier-payables'
import { formatDate as fmtDate, formatMoney as fmtMoney } from '@/src/lib/format'
import { useUser } from '@/src/hooks/useUser'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, AlertCircle, Clock } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'

type CuentaPagar = SupplierPayable

const STATUS_COLOR: Record<string, string> = {
  Pendiente: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Parcialmente Pagada': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Pagada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Vencida: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  Anulada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const isOverdue = (c: CuentaPagar) => c.days_overdue > 0

export default function AccountsPayablePage() {
  const { user, profile } = useUser()
  const context = `${profile?.tenant_id || ''}:${user?.id || ''}`
  const loadVersion = useRef(0)
  const [loadedContext, setLoadedContext] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cuentas, setCuentas] = useState<CuentaPagar[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Pendientes')
  const [monedaFilter, setMonedaFilter] = useState('USD')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    const isCurrent = () => version === loadVersion.current
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await loadSupplierPayables(supabase, { isCurrent })
      if (isCurrent()) {
        setCuentas(rows.sort((a, b) => (a.fecha_vencimiento || '9999-12-31').localeCompare(b.fecha_vencimiento || '9999-12-31') || a.id.localeCompare(b.id)))
        setLoadedContext(context)
        setLoading(false)
      }
    } catch (error) {
      if (isCurrent()) { setLoadError(error instanceof Error ? error.message : 'No se pudieron cargar los saldos'); setLoading(false) }
    }
  }, [context])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => { clearTimeout(timer); loadVersion.current += 1 }
  }, [load])

  const filtered = cuentas.filter((c) => {
    const q = search.toLowerCase()
    const prov = c.proveedores?.nombre?.toLowerCase() || ''
    const desc = c.descripcion.toLowerCase()
    const matchSearch = prov.includes(q) || desc.includes(q) || c.numero_factura_proveedor?.toLowerCase().includes(q)
    const matchMon = c.moneda === monedaFilter
    const matchStatus =
      statusFilter === 'Todos' ? true :
      statusFilter === 'Pendientes' ? ['Pendiente', 'Parcialmente Pagada', 'Vencida'].includes(c.status) :
      statusFilter === 'Vencidas' ? isOverdue(c) :
      statusFilter === 'Revisar' ? c.needs_reconciliation :
      c.status === statusFilter
    return matchSearch && matchMon && matchStatus
  })

  const paginatedCuentas = filtered.slice((page - 1) * pageSize, page * pageSize)

  const totals = supplierPayableSummary(cuentas, monedaFilter)
  const { pending: totalPendiente, overdue: totalVencido, paidThisMonth: totalPagadoMes } = totals
  const currencies = Array.from(new Set(['USD', 'HNL', ...cuentas.map(row => row.moneda)]))

  if (loadError) return <div className={cardClass}><p role="alert">{loadError}</p><button type="button" onClick={() => void load()} className={secondaryButtonClass}>Reintentar</button></div>
  if (loading || loadedContext !== context) return <TableSkeleton rows={6} cols={5} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Cuentas por Pagar</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Obligaciones con agentes, carriers y otros proveedores.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className={secondaryButtonClass}>Actualizar saldos</button>
        <Link href="/suppliers" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Ver proveedores
        </Link>
      </div>

      {/* Moneda selector */}
      <div className="flex gap-2">
        {currencies.map((m) => (
          <button key={m} type="button" onClick={() => { setMonedaFilter(m); setPage(1) }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${monedaFilter === m ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'}`}>
            {m}
          </button>
        ))}
      </div>

      {totals.reconciliationCount > 0 && <p role="status" className="rounded-xl border border-amber-300 p-3 text-sm text-amber-700 dark:text-amber-300">
        {totals.reconciliationCount} cuenta(s) requieren conciliacion. Sobrepagos: {fmtMoney(totals.overpaid, monedaFilter)}.
        {' '}Los sobrepagos se muestran separados; los totales excluyen saldos con movimientos inconsistentes u obligaciones negativas.
      </p>}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`rounded-2xl border p-5 shadow-sm ${totalVencido > 0 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'}`}>
          <p className={`text-sm ${totalVencido > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>Por pagar ({monedaFilter})</p>
          <p className={`mt-2 text-2xl font-bold ${totalVencido > 0 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {fmtMoney(totalPendiente, monedaFilter)}
          </p>
        </div>
        <div className={`rounded-2xl border p-5 shadow-sm ${totalVencido > 0 ? 'border-red-300 bg-red-100 dark:border-red-800/40 dark:bg-red-950/30' : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'}`}>
          <p className={`text-sm ${totalVencido > 0 ? 'text-red-700 dark:text-red-400 flex items-center gap-1' : 'text-slate-500'}`}>
            {totalVencido > 0 && <AlertCircle className="h-3.5 w-3.5" />}
            Vencido ({monedaFilter})
          </p>
          <p className={`mt-2 text-2xl font-bold ${totalVencido > 0 ? 'text-red-800 dark:text-red-300' : 'text-slate-400'}`}>
            {fmtMoney(totalVencido, monedaFilter)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Pagado este mes ({monedaFilter})</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{fmtMoney(totalPagadoMes, monedaFilter)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Buscar proveedor, descripción..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={`${fieldClass} w-44`}>
          <option value="Pendientes">Pendientes</option>
          <option value="Vencidas">Vencidas</option>
          <option value="Pagada">Pagadas</option>
          <option value="Revisar">Por conciliar</option>
          <option value="Todos">Todos</option>
        </select>
      </div>

      {/* Table */}
      <div className={cardClass}>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Clock className="h-6 w-6" />} title="Sin cuentas por pagar" description="Crea una cuenta por pagar desde el detalle del proveedor." action={{ label: 'Ver proveedores', href: '/suppliers' }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Proveedor / Descripción', 'Factura', 'Total ajustado / Saldo', 'Vencimiento', 'Estado', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedCuentas.map((c) => {
                  const overdue = isOverdue(c)
                  const dias = c.days_overdue
                  const displayStatus = c.status
                  return (
                    <tr key={c.id} className={`border-b border-slate-100 dark:border-slate-800 ${overdue ? 'bg-red-50/40 dark:bg-red-950/10' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/20'}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{c.proveedores?.nombre || '-'}</div>
                        <div className="text-xs text-slate-500">{c.descripcion}</div>
                        {c.quotations && <div className="text-xs text-blue-500">Cot. {c.quotations.quotation_number}</div>}
                        {c.needs_reconciliation && <p className="text-xs text-amber-700 dark:text-amber-300">{supplierPayableIssue(c)}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.numero_factura_proveedor || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {formatSupplierAmount(c.total_adjusted, c.moneda)}
                        <p className="text-xs font-normal">Saldo: {formatSupplierAmount(c.pending_balance, c.moneda)}</p>
                        <p className="text-xs font-normal">Pagado: {formatSupplierAmount(c.paid_total, c.moneda)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className={`text-xs ${overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                          {fmtDate(c.fecha_vencimiento)}
                        </div>
                        {overdue && <div className="text-xs text-red-500">{dias} día{dias !== 1 ? 's' : ''} vencida</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[displayStatus] ?? ''}`}>
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/accounts-payable/${c.id}`}
                          className="rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          Ver
                        </Link>
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
