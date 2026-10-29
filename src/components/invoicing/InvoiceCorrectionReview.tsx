'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, History } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { useInvoiceMaster } from '@/src/hooks/useInvoiceMaster'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDateTime, formatMoney } from '@/src/lib/format'
import type { InvoiceDraft } from '@/src/lib/invoice-drafts'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'

type Event = { id: string; action: string; reason: string | null; actor_name: string; created_at: string }
export function InvoiceCorrectionReview({ draft, dirty, onChanged }: { draft: InvoiceDraft; dirty: boolean; onChanged: (draft: InvoiceDraft) => void }) {
  const { user, profile } = useUser(), { isMaster, error: masterError } = useInvoiceMaster()
  const context = `${user?.id}:${profile?.tenant_id}:${draft.id}:${draft.revision}`, owner = useRef(context), lock = useRef(false)
  const [open, setOpen] = useState<'request' | 'approve' | 'reject' | ''>(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<{ context: string; rows: Event[]; error: boolean } | null>(null)
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  useEffect(() => {
    let active = true
    void readAllReportRows<Event>((from, to) => supabase.from('invoice_workflow_events').select('id,action,reason,actor_name,created_at').eq('draft_id', draft.id).order('created_at', { ascending: false }).order('id').range(from, to), { label: 'historial del borrador', isCurrent: () => active })
      .then(rows => { if (active) setHistory({ context, rows, error: false }) }).catch(() => { if (active) setHistory({ context, rows: [], error: true }) })
    return () => { active = false }
  }, [context, draft.id, draft.status])
  async function decide() {
    if (!open || !reason.trim() || dirty || lock.current) return
    lock.current = true; setBusy(true)
    try {
      const result = open === 'request' ? await supabase.rpc('submit_invoice_correction', { p_id: draft.id, p_revision: draft.revision, p_reason: reason.trim() })
        : await supabase.rpc('review_invoice_correction', { p_id: draft.id, p_revision: draft.revision, p_approve: open === 'approve', p_reason: reason.trim() })
      if (result.error || !result.data) throw new Error(result.error?.message || 'No se pudo confirmar la decisión.')
      if (owner.current === context) { onChanged(result.data as InvoiceDraft); setOpen(''); setReason(''); toast.success('Decisión registrada en el historial de la corrección.') }
    } catch (error) { if (owner.current === context) toast.error((error as Error).message) }
    finally { lock.current = false; if (owner.current === context) setBusy(false) }
  }
  const source = draft.source_snapshot
  return <section className={`${cardClass} space-y-4 border-rose-200 dark:border-rose-900`}>
    <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[#B3282D]" /><div><h2 className="font-bold">Corrección con aprobación master</h2><p className="mt-1 text-xs text-slate-500">Propuesta revisión {draft.revision} · {draft.status}</p></div></div>
    <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><div><p className="text-xs text-slate-500">Factura original</p><Link href={`/invoicing/${draft.source_invoice_id}`} className="mt-1 block font-semibold text-[#B3282D] underline underline-offset-4 dark:text-rose-300">{String(source?.invoice_number || 'Ver original')}</Link><p className="mt-1">{String(source?.cliente_nombre || '')}</p></div><div><p className="text-xs text-slate-500">Importe original</p><p className="mt-1 font-semibold">{formatMoney(Number(source?.total || 0), String(source?.currency || 'HNL'))}</p></div><Link href={`/invoicing/${draft.source_invoice_id}`} className="self-center text-xs font-semibold underline">Ver y solicitar anulación del original</Link></div>
    <p className="text-xs leading-relaxed text-slate-500">Revisa todos los datos y líneas del formulario. La aprobación corresponde a esta revisión. Para emitir la sustitución, Contabilidad debe aprobar la anulación del original y el master debe confirmar la emisión; se asignará un correlativo nuevo. Los pagos y notas activos deben conciliarse antes de anular.</p>
    {dirty && <p role="status" className="text-xs font-semibold text-amber-700">Hay cambios sin guardar. Guardarlos invalida cualquier aprobación anterior.</p>}
    {masterError && <p role="alert" className="text-sm text-rose-700">No se pudo verificar el permiso master. Recarga antes de aprobar o emitir.</p>}
    {draft.reason && <p className="whitespace-pre-wrap text-sm">Motivo: {draft.reason}</p>}
    {draft.review_reason && <p className="whitespace-pre-wrap text-sm">Decisión: {draft.review_reason} · {formatDateTime(draft.reviewed_at)}</p>}
    <div className="flex flex-wrap gap-2">{!['Pendiente de aprobación','Emitida','Descartada'].includes(draft.status) && <button type="button" disabled={dirty || busy} className={secondaryButtonClass} onClick={() => { setReason(''); setOpen('request') }}>{draft.status === 'Aprobada' ? 'Solicitar nueva revisión' : 'Solicitar aprobación master'}</button>}
      {isMaster && draft.status === 'Pendiente de aprobación' && <><button type="button" disabled={dirty || busy} className={primaryButtonClass} onClick={() => { setReason(''); setOpen('approve') }}>Revisar y aprobar</button><button type="button" disabled={dirty || busy} className={secondaryButtonClass} onClick={() => { setReason(''); setOpen('reject') }}>Rechazar propuesta</button></>}</div>
    <details><summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-500"><History className="h-4 w-4" />Historial de esta propuesta</summary><div className="mt-3 space-y-3">{history?.context !== context ? <p className="text-xs">Cargando historial…</p> : history.error ? <p role="alert" className="text-xs">No se pudo cargar el historial. Recarga para reintentar.</p> : history.rows.map(event => <div key={event.id} className="border-t pt-2 text-xs"><p className="font-semibold">{event.action} · {event.actor_name} · {formatDateTime(event.created_at)}</p>{event.reason && <p className="mt-1 whitespace-pre-wrap">{event.reason}</p>}</div>)}</div></details>
    <Dialog open={Boolean(open)} onOpenChange={next => { if (!busy && !next) setOpen('') }}><DialogContent><DialogHeader><DialogTitle>{open === 'request' ? 'Enviar propuesta al master' : open === 'approve' ? 'Aprobar esta corrección' : 'Rechazar esta corrección'}</DialogTitle><DialogDescription>La factura original se conserva. La decisión se registra con usuario, fecha, motivo y versión de la propuesta.</DialogDescription></DialogHeader><label htmlFor="invoice-correction-reason" className="text-sm font-semibold">Motivo de la decisión</label><textarea id="invoice-correction-reason" className={`${fieldClass} h-auto min-h-28 py-3`} value={reason} disabled={busy} maxLength={1000} onChange={e => setReason(e.target.value)} /><div className="flex justify-end gap-2"><button type="button" disabled={busy} className={secondaryButtonClass} onClick={() => setOpen('')}>Cancelar</button><button type="button" disabled={busy || !reason.trim() || dirty} className={primaryButtonClass} onClick={() => void decide()}>{busy ? 'Registrando…' : 'Confirmar decisión'}</button></div></DialogContent></Dialog>
  </section>
}
