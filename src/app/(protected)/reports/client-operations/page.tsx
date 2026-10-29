'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, FileText, LoaderCircle, PackageOpen, RefreshCw, Search, Ship, UsersRound } from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import { useBillingClients as useClientDirectory } from '@/src/hooks/useBillingClients'
import { canViewClientOperationsReport } from '@/src/lib/permissions'
import { clientOperationsReport, filterClientOperations, loadClientOperations, type ClientOperationRow, type OperationReportMode, type OperationReportScope } from '@/src/lib/client-operations-report'
import { formatDateTime } from '@/src/lib/format'
import { cardClass, fieldClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { Pagination } from '@/src/components/ui/Pagination'

export default function ClientOperationsPage() {
  const { user, profile, loading } = useUser()
  if (loading) return <PageSkeleton cards={3} rows={5} />
  if (!user || !canViewClientOperationsReport(profile?.rol)) return <EmptyState icon={<UsersRound className="h-6 w-6" />} title="Reporte no disponible" description="Este reporte está disponible para Ventas, Operaciones y Administración." />
  const context = `${user.id}:${profile?.tenant_id}`
  return <ClientOperationsWorkspace key={context} context={context} />
}

export function ClientOperationsWorkspace({ context }: { context: string }) {
  const { clients, loading: clientsLoading, error: clientsError, reload: reloadClients } = useClientDirectory(context)
  const [client, setClient] = useState(''), [scope, setScope] = useState<OperationReportScope>('all'), [mode, setMode] = useState<OperationReportMode>('all')
  const [revision, setRevision] = useState(0), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25)
  const [snapshot, setSnapshot] = useState<{ key: string; rows: ClientOperationRow[]; generatedAt: string; error: string } | null>(null)
  const customer = clients.find(c => c.id === client)
  const key = `${context}:${client}:${revision}`
  const current = snapshot?.key === key ? snapshot : null
  const loading = Boolean(customer && !current)

  useEffect(() => {
    if (!customer) return
    let active = true
    const timer = setTimeout(() => {
      void loadClientOperations(customer.id, () => active)
        .then(rows => { if (active) setSnapshot({ key, rows, generatedAt: new Date().toISOString(), error: '' }) })
        .catch(error => { if (active) setSnapshot({ key, rows: [], generatedAt: '', error: error instanceof Error ? error.message : 'No se pudo consultar el reporte. Reintenta la consulta.' }) })
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [customer, key])

  const rows = useMemo(() => filterClientOperations(current?.rows || [], scope, mode), [current, scope, mode])
  const report = customer && current && !current.error ? clientOperationsReport(customer, rows, scope, mode, current.generatedAt) : null
  const exportName = `operaciones-cliente-${(customer?.codigo_cliente || client).replace(/[^a-zA-Z0-9_-]/g, '-')}-${current?.generatedAt.slice(0, 10) || ''}`
  const counts = [{ label: 'Registros del reporte', value: rows.length, icon: ClipboardList }, { label: 'Contenedor completo · FCL', value: rows.filter(row => row.modality === 'FCL').length, icon: Ship }, { label: 'Carga consolidada · LCL', value: rows.filter(row => row.modality === 'LCL').length, icon: PackageOpen }]

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><Link href="/reports" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#B3282D] dark:text-slate-400"><ArrowLeft className="h-3.5 w-3.5" />Reportes</Link>
        <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-[#B3282D] dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><Ship className="h-6 w-6" /></span><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#B3282D] dark:text-rose-300">Seguimiento para clientes</p><h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">Operaciones aprobadas y activas</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">Prepara el detalle de las cargas de un cliente y compártelo en PDF o Excel.</p></div></div>
      </div>
      {report && <div className="flex flex-wrap items-center gap-2 sm:pt-9"><button type="button" className={`${secondaryButtonClass} inline-flex items-center gap-2`} onClick={() => { setRevision(v => v + 1); setPage(1) }}><RefreshCw className="h-4 w-4" />Actualizar</button><FinancialReportExport data={report} filename={exportName} disabled={!rows.length} /></div>}
    </header>

    <section className={`${cardClass} !p-0`} aria-labelledby="client-operations-filters">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-[#B3282D] dark:bg-rose-950/30 dark:text-rose-300"><UsersRound className="h-4 w-4" /></span><div><h2 id="client-operations-filters" className="text-sm font-bold text-slate-900 dark:text-white">Elige al cliente y el alcance</h2><p className="mt-0.5 text-xs text-slate-500">El reporte incluye el estado actual de las operaciones, sin límite por fecha de creación.</p></div></div>{customer && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Un solo cliente</span>}</div>
      <div className="grid min-w-0 gap-4 p-5 md:grid-cols-2 sm:p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2 md:col-span-2 xl:col-span-1"><label htmlFor="operation-report-client" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Cliente</label><ClienteCombobox id="operation-report-client" clientes={clients} value={client} onChange={id => { setClient(id); setPage(1) }} loading={clientsLoading} disabled={Boolean(clientsError)} placeholder="Buscar por nombre, código o RTN…" className={`${fieldClass} h-auto min-h-16 py-3`} /></div>
        <div className="space-y-2"><label htmlFor="operation-report-scope" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Operaciones a incluir</label><select id="operation-report-scope" className={`${fieldClass} h-16 text-xs`} value={scope} onChange={e => { setScope(e.target.value as OperationReportScope); setPage(1) }}><option value="all">Aprobadas y activas</option><option value="active">Solo operaciones en curso</option><option value="approved">Aprobadas pendientes de operación</option></select></div>
        <div className="space-y-2"><label htmlFor="operation-report-mode" className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Modalidad</label><select id="operation-report-mode" className={`${fieldClass} h-16 text-xs`} value={mode} onChange={e => { setMode(e.target.value as OperationReportMode); setPage(1) }}><option value="all">Todas las modalidades</option><option value="FCL">FCL · Contenedor completo</option><option value="LCL">LCL · Carga consolidada</option><option value="other">Otras modalidades</option></select></div>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 sm:px-6">Aprobadas: cotizaciones Ganadas sin operación creada. Activas: operaciones en curso. Se excluyen las finalizadas y canceladas. Los datos aún no registrados aparecen como pendientes de confirmar.</p>
      {clientsError && <div role="alert" className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="h-4 w-4" /><span className="flex-1">{clientsError}</span><button type="button" className="font-semibold underline" onClick={reloadClients}>Reintentar clientes</button></div>}
    </section>

    {!customer && !clientsError && <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900/30"><Search className="mx-auto h-9 w-9 text-[#B3282D] dark:text-rose-300" /><h2 className="mt-5 text-lg font-bold text-slate-900 dark:text-white">Sus operaciones, listas para compartir</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">Busca al cliente para consultar el origen, consignatario, modalidad y cotización de cada carga.</p></div>}
    {loading && <p role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900"><LoaderCircle className="h-5 w-5 animate-spin text-[#B3282D]" />Consultando las operaciones del cliente…</p>}
    {current?.error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="h-5 w-5" /><span className="flex-1">{current.error}</span><button type="button" className="font-semibold underline" onClick={() => setRevision(v => v + 1)}>Reintentar reporte</button></div>}

    {report && <>
      <section aria-label="Resumen del reporte" className="grid gap-4 sm:grid-cols-3">{counts.map(({ label, value, icon: Icon }) => <div key={label} className={`${cardClass} flex items-center justify-between gap-3`}><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-[#B3282D] dark:bg-rose-950/30 dark:text-rose-300"><Icon className="h-5 w-5" /></span></div>)}</section>
      <section className={`${cardClass} !p-0`} aria-labelledby="client-operations-results"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800"><div><h2 id="client-operations-results" className="text-sm font-bold text-slate-900 dark:text-white">{customer?.nombre}</h2><p className="mt-1 text-xs text-slate-500">{rows.length} registros · Consultado el {formatDateTime(current?.generatedAt)}</p></div><p className="inline-flex items-center gap-2 text-[11px] text-slate-500"><FileText className="h-4 w-4" />La exportación incluye todo el resultado filtrado.</p></div>
        {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60"><tr>{report.columns.map(column => <th key={column.key} scope="col" className="px-5 py-3">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.slice((page - 1) * pageSize, page * pageSize).map(row => <tr key={row.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40"><td className="px-5 py-5 font-semibold text-slate-900 dark:text-white">{row.quotationId ? <Link href={`/quotations/${row.quotationId}`} className="underline-offset-4 hover:text-[#B3282D] hover:underline">{row.quotation}</Link> : row.quotation}</td><td className="px-5 py-5">{row.instructionId ? <Link href={`/operations/shipping-instructions/${row.instructionId}`} className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-[#B3282D] dark:text-slate-200">{row.operation}<ArrowRight className="h-3 w-3" /></Link> : <span className="text-slate-500">{row.operation}</span>}</td><td className="max-w-xs px-5 py-5 leading-relaxed">{row.origin}</td><td className="max-w-sm px-5 py-5 leading-relaxed">{row.consignee}</td><td className="px-5 py-5"><span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{row.modality}</span></td><td className="px-5 py-5"><span className={`inline-flex rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${row.phase === 'approved' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>{row.status}</span></td></tr>)}</tbody></table></div> : <div className="px-6 py-12 text-center"><PackageOpen className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-100">Sin operaciones para estos filtros</h3><p className="mt-2 text-xs text-slate-500">Prueba otra modalidad o cambia el alcance del reporte.</p></div>}
        {rows.length > 0 && <div className="border-t border-slate-100 p-4 dark:border-slate-800"><Pagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} /></div>}
      </section>
    </>}
  </div>
}
