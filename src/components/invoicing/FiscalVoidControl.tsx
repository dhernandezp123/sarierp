'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { canRequestFiscalVoid, canReviewFiscalVoid, fiscalVoidDocumentHref, type FiscalDocumentTable, type FiscalVoidRequest } from '@/src/lib/fiscal-void'
import { formatDate, formatDateTime, formatMoney } from '@/src/lib/format'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

export function FiscalVoidReview({ request, onChanged }: { request: FiscalVoidRequest; onChanged: () => void }) {
  const { user, profile } = useUser()
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${request.id}`
  const owner = useRef(context), lock = useRef('')
  const [open, setOpen] = useState(''), [reason, setReason] = useState(''), [originals, setOriginals] = useState(false), [busyFor, setBusy] = useState('')
  const busy = busyFor === context
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  const allowed = canReviewFiscalVoid(profile, user?.id)
  async function decide(approve: boolean) {
    if (!allowed || lock.current === context || !reason.trim() || (approve && request.document_type !== 'Proforma' && !originals)) return
    lock.current = context; setBusy(context)
    try {
      const { error } = await supabase.rpc('review_fiscal_void', { p_request_id: request.id, p_approve: approve, p_reason: reason.trim(), p_originals_confirmed: originals })
      if (error) throw error
      if (owner.current === context) { toast.success(approve ? 'Anulación aprobada y registrada.' : 'Solicitud rechazada; el documento conserva su estado.'); setOpen(''); onChanged() }
    } catch (error) { if (owner.current === context) toast.error((error as Error).message || 'No se pudo confirmar la decisión. Reintenta la misma operación.') }
    finally { if (lock.current === context) lock.current = ''; if (owner.current === context) setBusy('') }
  }
  if (!allowed || request.status !== 'Pendiente') return null
  return <><button type="button" className={secondaryButtonClass} onClick={() => { setReason(''); setOriginals(false); setOpen(context) }}>Revisar anulación</button>
    <Dialog open={open === context} onOpenChange={next => { if (!busy) setOpen(next ? context : '') }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader>
      <DialogTitle>Decisión de Contabilidad</DialogTitle><DialogDescription>La aprobación anula el documento y conserva su contenido, numeración e historial. Si tiene partida, registra su reverso en un período abierto.</DialogDescription>
    </DialogHeader><div className="space-y-2 text-sm"><p className="font-semibold">{request.document_type} · {request.document_number}</p>
      <p>{request.point_of_sale || 'Sin oficina'} · Emisión {formatDate(request.issue_date)} · {formatMoney(Number(request.total), request.currency)}</p><p>CAI: {request.cai || 'No aplica'}</p>
      <p>Solicitó {request.requested_by_name} · {formatDateTime(request.requested_at)}</p><p className="whitespace-pre-wrap">Motivo: {request.reason}</p>
      <Link className="text-blue-700 underline" href={fiscalVoidDocumentHref(request)} target="_blank" rel="noopener noreferrer">Consultar documento original</Link>
      <p>Para devoluciones o ajustes posteriores de una venta, utiliza una nota de crédito vinculada a la factura.</p>
      {request.document_type !== 'Proforma' && <label className="flex items-start gap-2"><input type="checkbox" checked={originals} disabled={busy} onChange={e => setOriginals(e.target.checked)} />Confirmo que se trata de un error de emisión y que se resguardarán original y copia con la leyenda ANULADA.</label>}
    </div><label className="text-sm font-medium" htmlFor={`void-review-${request.id}`}>Motivo de la decisión</label><textarea id={`void-review-${request.id}`} className={fieldClass} value={reason} maxLength={1000} disabled={busy} onChange={e => setReason(e.target.value)} />
      <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setOpen('')}>Cerrar</button><button type="button" className={secondaryButtonClass} disabled={busy || !reason.trim()} onClick={() => void decide(false)}>Rechazar solicitud</button><button type="button" className={primaryButtonClass} disabled={busy || !reason.trim() || (request.document_type !== 'Proforma' && !originals)} onClick={() => void decide(true)}>{busy ? 'Guardando…' : 'Aprobar anulación'}</button></div>
    </DialogContent></Dialog></>
}

export function FiscalVoidControl({ table, documentId, status, onChanged, requestDisabled = false }: { table: FiscalDocumentTable; documentId: string; status: string; onChanged: () => void; requestDisabled?: boolean }) {
  const { user, profile } = useUser(), allowed = canRequestFiscalVoid(profile, user?.id)
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${table}:${documentId}`
  const owner = useRef(context), version = useRef(0), lock = useRef(''), attempt = useRef({ signature: '', id: '' })
  const [state, setState] = useState<{ context: string; rows: FiscalVoidRequest[]; error: string } | null>(null)
  const [open, setOpen] = useState(''), [reason, setReason] = useState(''), [busyFor, setBusy] = useState('')
  const busy = busyFor === context
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  const reload = useCallback(async () => {
    if (!allowed) return
    const run = ++version.current, current = () => owner.current === context && version.current === run
    try {
      const rows = await readAllReportRows<FiscalVoidRequest>((from, to) => supabase.from('fiscal_void_requests').select('*').eq('document_table', table).eq('document_id', documentId).order('requested_at', { ascending: false }).order('id').range(from, to), { label: 'historial de anulaciones', isCurrent: current })
      if (current()) setState({ context, rows, error: '' })
    } catch (error) { if (current()) setState({ context, rows: [], error: (error as Error).message }) }
  }, [allowed, context, documentId, table])
  useEffect(() => { const timer = setTimeout(() => void reload(), 0); return () => clearTimeout(timer) }, [reload])
  const current = state?.context === context ? state : null
  async function request() {
    if (!allowed || requestDisabled || lock.current === context || !reason.trim() || !current || current.error || current.rows.some(r => r.status === 'Pendiente')) return
    lock.current = context; setBusy(context)
    const signature = `${context}:${reason.trim()}`
    if (attempt.current.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() }
    try {
      const { error } = await supabase.rpc('request_fiscal_void', { p_table: table, p_document_id: documentId, p_request_key: attempt.current.id, p_reason: reason.trim() })
      if (error) throw error
      if (owner.current === context) { attempt.current = { signature: '', id: '' }; toast.success('Solicitud enviada a Contabilidad. El documento conserva su estado hasta la aprobación.'); setOpen(''); setReason(''); await reload() }
    } catch (error) { if (owner.current === context) toast.error((error as Error).message || 'No se pudo confirmar la solicitud. Reintenta sin cambiar el motivo.') }
    finally { if (lock.current === context) lock.current = ''; if (owner.current === context) setBusy('') }
  }
  if (!allowed) return null
  return <section className={`${cardClass} space-y-3`}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Anulación y registro</h2><Link className="text-sm text-blue-700 underline" href="/invoicing/voids">Ver registro de anulaciones</Link></div>
    {!current ? <p>Cargando historial…</p> : current.error ? <p role="alert">{current.error} <button type="button" className={secondaryButtonClass} onClick={() => void reload()}>Reintentar</button></p> : <>
      {status !== 'Anulada' && !requestDisabled && !current.rows.some(r => r.status === 'Pendiente') && <button type="button" className={secondaryButtonClass} onClick={() => { setReason(''); setOpen(context) }}>Solicitar anulación</button>}
      {!current.rows.length && <p className="text-sm text-slate-500">{status === 'Anulada' ? 'Documento anulado antes de este flujo; no hay una aprobación registrada en estas solicitudes.' : 'La anulación requiere un motivo y aprobación de Contabilidad. El documento no se elimina.'}</p>}
      {current.rows.map(row => <div key={row.id} className="space-y-1 border-t pt-3 text-sm"><p className="font-semibold">{row.status} · {row.requested_by_name} · {formatDateTime(row.requested_at)}</p><p className="whitespace-pre-wrap">{row.reason}</p>
        {row.reviewed_at && <p>{row.reviewed_by_name} · {formatDateTime(row.reviewed_at)} · {row.review_reason}</p>}
        {row.accounting_result && <p>Registro contable: {row.accounting_result}{row.accounting_result === 'Sin asiento previo' ? '. No existía una partida que revertir; se conserva el registro fiscal.' : ''}</p>}
        <FiscalVoidReview request={row} onChanged={() => { void reload(); onChanged() }} />
      </div>)}
    </>}
    <Dialog open={open === context} onOpenChange={next => { if (!busy) setOpen(next ? context : '') }}><DialogContent><DialogHeader><DialogTitle>Solicitar anulación</DialogTitle><DialogDescription>Contabilidad revisará el motivo. No se cambia el estado ni el saldo hasta que se apruebe. Los pagos y notas activos deben resolverse antes de anular.</DialogDescription></DialogHeader>
      <label htmlFor={`void-reason-${documentId}`} className="text-sm font-medium">Motivo</label><textarea id={`void-reason-${documentId}`} className={fieldClass} value={reason} maxLength={1000} disabled={busy} onChange={e => setReason(e.target.value)} />
      <div className="flex gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setOpen('')}>Cancelar</button><button type="button" className={primaryButtonClass} disabled={busy || !reason.trim()} onClick={() => void request()}>{busy ? 'Enviando…' : 'Enviar a Contabilidad'}</button></div>
    </DialogContent></Dialog>
  </section>
}
