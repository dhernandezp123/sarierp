'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { canRequestFiscalVoid, fiscalVoidDocumentHref, fiscalVoidReport, type FiscalVoidRequest } from '@/src/lib/fiscal-void'
import { formatDate, formatDateTime, formatMoney } from '@/src/lib/format'
import { FiscalVoidReview } from '@/src/components/invoicing/FiscalVoidControl'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import { FinancePageHeader, financeActionClass, financeLinkClass } from '@/src/components/invoicing/FinanceWorkspace'
import { Pagination } from '@/src/components/ui/Pagination'
import { Ban, RefreshCw } from 'lucide-react'

export default function FiscalVoidsPage() {
  const { user, profile } = useUser(), allowed = canRequestFiscalVoid(profile, user?.id)
  const [status, setStatus] = useState('Pendiente'), [from, setFrom] = useState(''), [to, setTo] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(0), [pageSize, setPageSize] = useState(25)
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${status}:${from}:${to}`
  const owner = useRef(context), version = useRef(0)
  const [state, setState] = useState<{ context: string; rows: FiscalVoidRequest[]; error: string } | null>(null)
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  const reload = useCallback(async () => {
    if (!allowed) return
    const run = ++version.current, current = () => owner.current === context && version.current === run
    setState(null)
    try {
      if (from && to && from > to) throw new Error('La fecha inicial debe ser anterior o igual a la final.')
      const rows = await readAllReportRows<FiscalVoidRequest>((a, b) => {
        let query = supabase.from('fiscal_void_requests').select('*').order('requested_at', { ascending: false }).order('id')
        if (status) query = query.eq('status', status)
        if (from) query = query.gte('requested_at', `${from}T00:00:00-06:00`)
        if (to) query = query.lte('requested_at', `${to}T23:59:59.999999-06:00`)
        return query.range(a, b)
      }, { label: 'solicitudes de anulación', isCurrent: current })
      if (current()) { setState({ context, rows, error: '' }); setPage(0) }
    } catch (error) { if (current()) setState({ context, rows: [], error: (error as Error).message }) }
  }, [allowed, context, from, status, to])
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer) }, [reload])
  const current = state?.context === context ? state : null
  const rows = current?.rows.filter(row => `${row.document_number} ${row.document_type} ${row.point_of_sale || ''} ${row.reason}`.toLowerCase().includes(search.toLowerCase())) || []
  if (!allowed) return <p>Se requiere una sesión financiera activa.</p>
  return <div className="space-y-6"><FinancePageHeader eyebrow="Finanzas · Facturación" title="Anulaciones de documentos" description="Solicitudes, decisiones de Contabilidad y trazabilidad fiscal y contable." icon={Ban} actions={<><Link className={financeActionClass} href="/invoicing">Facturación</Link><button type="button" className={financeActionClass} onClick={() => void reload()}><RefreshCw className="h-4 w-4" />Actualizar</button></>} />
    <section className={`${cardClass} grid gap-3 md:grid-cols-4`}><label className="text-sm">Estado<select aria-label="Estado de solicitud" className={fieldClass} value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{['Pendiente', 'Aprobada', 'Rechazada'].map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">Solicitadas desde<input type="date" className={fieldClass} value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-sm">Hasta<input type="date" className={fieldClass} value={to} onChange={e => setTo(e.target.value)} /></label><label className="text-sm">Documento, oficina o motivo<input className={fieldClass} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label></section>
    {!current ? <p>Cargando registro…</p> : current.error ? <p role="alert">{current.error}</p> : <>
      <FinancialReportExport filename="registro-anulaciones" data={fiscalVoidReport(rows, [`Estado: ${status || 'Todos'}`, `Desde: ${from ? formatDate(from) : 'Sin límite'} · Hasta: ${to ? formatDate(to) : 'Sin límite'}`, `Búsqueda: ${search || 'Todas'}`])} />
      <div className={`${cardClass} overflow-x-auto`}><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Documento</th><th className="p-2">Solicitud</th><th className="p-2">Decisión</th><th className="p-2">Contabilidad</th></tr></thead><tbody>{rows.slice(page * pageSize, (page + 1) * pageSize).map(row => <tr key={row.id} className="border-b align-top"><td className="space-y-1 p-2"><Link className={financeLinkClass} href={fiscalVoidDocumentHref(row)}>{row.document_number}</Link><p>{row.document_type} · {row.point_of_sale || '—'}</p><p>CAI: {row.cai || 'No aplica'}</p><p>{formatMoney(Number(row.total), row.currency)}</p></td><td className="max-w-sm whitespace-pre-wrap p-2"><p>{formatDateTime(row.requested_at)} · {row.requested_by_name}</p><p>{row.reason}</p></td><td className="max-w-sm whitespace-pre-wrap p-2"><p className="font-semibold">{row.status}</p>{row.reviewed_at && <><p>{formatDateTime(row.reviewed_at)} · {row.reviewed_by_name}</p><p>{row.review_reason}</p></>}<FiscalVoidReview request={row} onChanged={() => void reload()} /></td><td className="p-2"><p>{row.accounting_result || 'Sin decisión'}</p>{row.reversal_entry_id && <Link className={financeLinkClass} href="/accounting/journal">Ver diario y reversos</Link>}</td></tr>)}</tbody></table>{!rows.length && <p className="py-5">Sin solicitudes para estos filtros.</p>}<Pagination page={page + 1} pageSize={pageSize} total={rows.length} onPageChange={p => setPage(p - 1)} onPageSizeChange={size => { setPageSize(size); setPage(0) }} /></div>
    </>}
  </div>
}
