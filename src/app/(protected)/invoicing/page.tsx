'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, CheckCircle2, Clock, XCircle, AlertCircle, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../../lib/supabase/client'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { primaryButtonClass, cardClass, fieldClass } from '@/src/lib/ui-classes'

type Invoice = {
  id: string
  invoice_number: string | null
  invoice_type: 'Proforma' | 'Factura'
  status: string
  cliente_nombre: string | null
  issue_date: string | null
  due_date: string | null
  total: number
  currency: string
  quotation_id: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  Borrador: { label: 'Borrador', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <FileText className="h-3 w-3" /> },
  Enviada: { label: 'Enviada', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: <Clock className="h-3 w-3" /> },
  Aprobada: { label: 'Aprobada', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  Pagada: { label: 'Pagada', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  Vencida: { label: 'Vencida', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300', icon: <AlertCircle className="h-3 w-3" /> },
  Anulada: { label: 'Anulada', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500 line-through', icon: <XCircle className="h-3 w-3" /> },
}

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function formatUSD(amount: number, currency = 'USD') {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function InvoicingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'Proforma' | 'Factura'>('all')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => { fetchInvoices() }, [])

  const fetchInvoices = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, status, cliente_nombre, issue_date, due_date, total, currency, quotation_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) { toast.error('Error al cargar facturas'); setLoading(false); return }
    setInvoices((data || []) as Invoice[])
    setLoading(false)
  }

  const filtered = invoices.filter((inv) => {
    if (filterType !== 'all' && inv.invoice_type !== filterType) return false
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const matchNum = inv.invoice_number?.toLowerCase().includes(q)
      const matchClient = inv.cliente_nombre?.toLowerCase().includes(q)
      if (!matchNum && !matchClient) return false
    }
    return true
  })

  const totals = {
    pendiente: invoices.filter((i) => ['Enviada', 'Aprobada'].includes(i.status)).reduce((s, i) => s + i.total, 0),
    pagado: invoices.filter((i) => i.status === 'Pagada').reduce((s, i) => s + i.total, 0),
    vencido: invoices.filter((i) => i.status === 'Vencida').reduce((s, i) => s + i.total, 0),
  }

  if (loading) return <PageSkeleton cards={3} rows={6} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Finanzas
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Facturación</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Gestión de proformas y facturas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/invoicing/new')}
          className={primaryButtonClass}
        >
          <Plus className="h-4 w-4" />
          Nueva factura
        </button>
      </div>

      {/* KPI mini cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          <p className="text-xs text-slate-500 dark:text-slate-400">Por cobrar</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{formatUSD(totals.pendiente)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-800/50 dark:bg-emerald-950/30">
          <p className="text-xs text-slate-500 dark:text-slate-400">Cobrado</p>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatUSD(totals.pagado)}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-800/50 dark:bg-rose-950/30">
          <p className="text-xs text-slate-500 dark:text-slate-400">Vencido</p>
          <p className="mt-1 text-xl font-bold text-rose-700 dark:text-rose-300">{formatUSD(totals.vencido)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="all">Todos los tipos</option>
          <option value="Proforma">Proforma</option>
          <option value="Factura">Factura</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        >
          <option value="all">Todos los estados</option>
          {Object.keys(STATUS_CONFIG).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className={`${cardClass} py-16 text-center`}>
          <DollarSign className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
            {invoices.length === 0 ? 'No hay facturas aún.' : 'Sin resultados para los filtros aplicados.'}
          </p>
          {invoices.length === 0 && (
            <button
              type="button"
              onClick={() => router.push('/invoicing/new')}
              className={`mt-4 ${primaryButtonClass}`}
            >
              <Plus className="h-4 w-4" />
              Crear primera factura
            </button>
          )}
        </div>
      ) : (
        <div className={cardClass}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3 pr-4">Número</th>
                  <th className="pb-3 pr-4">Tipo</th>
                  <th className="pb-3 pr-4">Cliente</th>
                  <th className="pb-3 pr-4">Emisión</th>
                  <th className="pb-3 pr-4">Vencimiento</th>
                  <th className="pb-3 pr-4">Estado</th>
                  <th className="pb-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG['Borrador']
                  const isOverdue = inv.status === 'Enviada' && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`/invoicing/${inv.id}`)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-3 pr-4 font-semibold text-blue-600 dark:text-blue-400">
                        {inv.invoice_number || <span className="text-slate-400 italic">Sin número</span>}
                      </td>
                      <td className="pr-4">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          inv.invoice_type === 'Proforma'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}>
                          {inv.invoice_type}
                        </span>
                      </td>
                      <td className="pr-4 text-slate-700 dark:text-slate-300">
                        {inv.cliente_nombre || '—'}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-400">
                        {formatDate(inv.issue_date)}
                      </td>
                      <td className={`pr-4 ${isOverdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {formatDate(inv.due_date)}
                        {isOverdue && <span className="ml-1 text-xs">⚠</span>}
                      </td>
                      <td className="pr-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${sc.color}`}>
                          {sc.icon}
                          {sc.label}
                        </span>
                      </td>
                      <td className="text-right font-semibold text-slate-900 dark:text-white">
                        {formatUSD(inv.total, inv.currency)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
