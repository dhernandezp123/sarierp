'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, secondaryButtonClass } from '@/src/lib/ui-classes'
export function InvoiceCorrectionLinks({ invoiceId, original }: { invoiceId: string; original?: { invoice_id?: string | null; invoice_number?: string | null } | null }) {
  const { user, profile } = useUser(), context = `${user?.id}:${profile?.tenant_id}:${invoiceId}`
  const [state, setState] = useState<{ context: string; replacement: string | null; error: boolean } | null>(null)
  useEffect(() => {
    let active = true
    void supabase.from('invoice_drafts').select('invoice_id').eq('source_invoice_id', invoiceId).eq('status', 'Emitida').maybeSingle()
      .then(({ data, error }) => { if (active) setState({ context, replacement: data?.invoice_id || null, error: Boolean(error) }) })
    return () => { active = false }
  }, [context, invoiceId])
  const current = state?.context === context ? state : null
  return <section className={`${cardClass} space-y-4`}><div><h2 className="font-semibold">Corrección y trazabilidad</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">La propuesta permite corregir los datos con aprobación y emisión del master. La anulación del original requiere aprobación de Contabilidad.</p></div>
    {original?.invoice_id && <p className="text-sm">Sustituye la factura anulada <Link className="font-semibold text-blue-700 underline" href={`/invoicing/${original.invoice_id}`}>{original.invoice_number || 'Ver original'}</Link>.</p>}
    {!current ? <p role="status" className="text-xs text-slate-500">Consultando sustituciones…</p> : current.error ? <p role="alert" className="text-sm text-rose-700">No se pudo consultar la trazabilidad. Recarga para reintentar.</p> : current.replacement ? <Link href={`/invoicing/${current.replacement}`} className={secondaryButtonClass}>Ver factura sustituta emitida</Link> : <Link href={`/invoicing/new?correct=${invoiceId}`} className={secondaryButtonClass}>Preparar corrección</Link>}
  </section>
}
