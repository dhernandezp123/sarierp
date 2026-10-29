'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { FileClock, Plus, RefreshCw } from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import { useBillingClients } from '@/src/hooks/useBillingClients'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { draftLabel, type InvoiceDraft } from '@/src/lib/invoice-drafts'
import { formatDateTime } from '@/src/lib/format'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { Pagination } from '@/src/components/ui/Pagination'
type DraftRow = Pick<InvoiceDraft, 'id' | 'status' | 'revision' | 'invoice_id' | 'source_invoice_id' | 'updated_at'> & { client_id: string | null; currency: string | null; original_number: string | null }
export default function InvoiceDraftsPage() {
  const { user, profile } = useUser(), context = `${user?.id}:${profile?.tenant_id}`
  return <DraftsWorkspace key={context} context={context} />
}
function DraftsWorkspace({ context }: { context: string }) {
  const { clients } = useBillingClients(context)
  const [revision, setRevision] = useState(0), [filter, setFilter] = useState('Pendientes'), [search, setSearch] = useState(''), [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25)
  const [state, setState] = useState<{ revision: number; rows: DraftRow[]; error: string } | null>(null)
  useEffect(() => {
    let active = true
    void readAllReportRows<DraftRow>((from, to) => supabase.from('invoice_drafts').select('id,status,revision,invoice_id,source_invoice_id,updated_at,client_id:invoice_payload->>cliente_id,currency:invoice_payload->>currency,original_number:source_snapshot->>invoice_number').order('updated_at', { ascending: false }).order('id').range(from, to), { label: 'borradores y correcciones', isCurrent: () => active })
      .then(rows => { if (active) setState({ revision, rows, error: '' }) }).catch(error => { if (active) setState({ revision, rows: [], error: (error as Error).message }) })
    return () => { active = false }
  }, [revision])
  const current = state?.revision === revision ? state : null
  const names = useMemo(() => new Map(clients.map(client => [client.id, client.nombre])), [clients])
  const rows = (current?.rows || []).filter(row => (filter === 'Todos' || (filter === 'Pendientes' ? !['Emitida','Descartada'].includes(row.status) : filter === 'Correcciones' ? Boolean(row.source_invoice_id) : row.status === filter)) && `${draftLabel(row.id)} ${names.get(row.client_id || '') || ''} ${row.original_number || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  return <div className="space-y-6"><FinancePageHeader eyebrow="Finanzas · Facturación" title="Borradores y correcciones" description="Confirma datos antes de consumir el correlativo fiscal." icon={FileClock} actions={<><Link href="/invoicing" className={financeActionClass}>Facturación</Link><Link href="/invoicing/new" className={`${primaryButtonClass} inline-flex items-center gap-2`}><Plus className="h-4 w-4" />Nueva factura</Link></>} />
    <section className={`${cardClass} flex flex-wrap gap-3`}><label className="min-w-0 flex-1 text-xs font-semibold">Buscar borrador, cliente o factura original<input type="search" className={fieldClass} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} /></label><label className="text-xs font-semibold">Estado<select className={fieldClass} value={filter} onChange={e => { setFilter(e.target.value); setPage(1) }}>{['Pendientes','Correcciones','Borrador','Pendiente de aprobación','Aprobada','Rechazada','Emitida','Todos'].map(value => <option key={value}>{value}</option>)}</select></label><button type="button" disabled={!current} className={`${secondaryButtonClass} inline-flex items-center gap-2 self-end`} onClick={() => { setRevision(v => v + 1); setPage(1) }}><RefreshCw className="h-4 w-4" />Actualizar</button></section>
    {!current ? <p role="status">Consultando borradores…</p> : current.error ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{current.error}<button type="button" className="ml-3 underline" onClick={() => setRevision(v => v + 1)}>Reintentar</button></p> : <section className={`${cardClass} !p-0`}><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr>{['Borrador','Cliente','Estado','Versión','Actualización','Acción'].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead><tbody>{rows.slice((page - 1) * pageSize, page * pageSize).map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-4 font-semibold">{draftLabel(row.id)}{row.original_number && <p className="mt-1 text-xs font-normal text-slate-500">Corrección de {row.original_number}</p>}</td><td className="p-4">{names.get(row.client_id || '') || 'Cliente por confirmar'}<p className="text-xs text-slate-500">{row.currency || 'Moneda por confirmar'}</p></td><td className="p-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs dark:bg-slate-800">{row.status}</span></td><td className="p-4">{row.revision}</td><td className="p-4 text-xs text-slate-500">{formatDateTime(row.updated_at)}</td><td className="p-4"><Link href={row.invoice_id ? `/invoicing/${row.invoice_id}` : `/invoicing/new?draft=${row.id}`} className="font-semibold text-[#B3282D] underline dark:text-rose-300">{row.invoice_id ? 'Ver factura emitida' : 'Continuar'}</Link></td></tr>)}</tbody></table></div>{!rows.length && <p className="p-10 text-center text-sm text-slate-500">No hay borradores para estos filtros.</p>}<Pagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} /></section>}
  </div>
}
