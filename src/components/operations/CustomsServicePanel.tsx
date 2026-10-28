'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { nextCustomsStatus } from '@/src/lib/customs-quotation'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { formatDate } from '@/src/lib/format'

export function CustomsServicePanel({ id, number, status, updatedAt, quotation, canManage, reload }: {
  id: string; number: string; status: string; updatedAt: string | null
  quotation: { id?: string; quotation_number?: string; commodity?: string; puerto_destino?: string; delivery_address?: string }
  canManage: boolean; reload: () => Promise<void>
}) {
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [delivery, setDelivery] = useState<boolean | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; event_label: string; notes: string | null; occurred_at: string }>>([])
  const [loadError, setLoadError] = useState(false)
  const load = useCallback(async () => {
    const [items, events] = await Promise.all([
      supabase.from('pricing_items').select('rate_code,sale_amount').eq('quotation_id', quotation.id).is('deleted_at', null),
      supabase.from('operational_events').select('id,event_label,notes,occurred_at').eq('shipping_instruction_id', id).order('occurred_at'),
    ])
    if (items.error || events.error) { setLoadError(true); return }
    setLoadError(false)
    setDelivery((items.data || []).some(item => item.rate_code === 'customs_delivery' && Number(item.sale_amount) > 0))
    setHistory(events.data || [])
  }, [id, quotation.id])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  const next = delivery === null ? null : nextCustomsStatus(status, delivery)
  const advance = async (target = next) => {
    if (saving || !target || !notes.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc('advance_customs_service', {
        p_shipping_instruction_id: id, p_expected_updated_at: updatedAt, p_next_status: target, p_notes: notes.trim(),
      })
      if (error) throw new Error(error.message)
      setNotes('')
      await reload()
      await load()
      toast.success('Servicio de Aduanas actualizado')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'No se pudo avanzar el servicio') }
    finally { setSaving(false) }
  }
  return <div className="max-w-5xl space-y-5">
    <Link href="/operations/shipping-instructions" className={secondaryButtonClass}>Volver a operaciones</Link>
    <section className={cardClass}>
      <h1 className="text-2xl font-bold">Servicio de Aduanas · {number}</h1>
      <p className="mt-2 font-semibold">{status}</p>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-slate-500">Cotización</dt><dd><Link href={`/quotations/${quotation.id}`}>{quotation.quotation_number || 'Ver cotización'}</Link></dd></div>
        <div><dt className="text-sm text-slate-500">Aduana de despacho</dt><dd>{quotation.puerto_destino}</dd></div>
        <div><dt className="text-sm text-slate-500">Mercancía</dt><dd>{quotation.commodity}</dd></div>
        <div><dt className="text-sm text-slate-500">Entrega final</dt><dd>{delivery === null ? 'Cargando...' : delivery ? quotation.delivery_address : 'No incluida'}</dd></div>
      </dl>
      {loadError && <div role="alert" className="mt-4"><p>No se pudieron cargar los cargos o el historial del servicio.</p><button className={secondaryButtonClass} onClick={load}>Reintentar</button></div>}
      {canManage && next && !loadError && <div className="mt-6 space-y-3">
        <label className="block space-y-1 text-sm"><span>Evidencia / referencia de la gestión *</span><textarea className={`${fieldClass} min-h-24`} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Documento de liberación, referencia de entrega o detalle de la gestión realizada..." /></label>
        <div className="flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={saving || !notes.trim()} onClick={() => advance()}>{saving ? 'Guardando...' : `Registrar: ${next}`}</button>
        <button className={secondaryButtonClass} disabled={saving || !notes.trim()} onClick={() => advance('Cancelada')}>Cancelar servicio con motivo</button></div>
      </div>}
      {status === 'Finalizado' && <p className="mt-5 text-sm">Expediente cerrado. Continúa con la validación de costos y facturación.</p>}
    </section>
    <section className={cardClass}><h2 className="font-semibold">Historial del servicio</h2><ol className="mt-4 space-y-3">{history.map(event => <li key={event.id}><p className="font-medium">{formatDate(event.occurred_at)} · {event.event_label}</p><p className="text-sm text-slate-500">{event.notes}</p></li>)}</ol></section>
  </div>
}
