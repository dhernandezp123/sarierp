'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { Pagination } from '@/src/components/ui/Pagination'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog'
import { FormField } from '@/src/components/ui/form-field'
import { fieldClassSm, secondaryButtonClass } from '@/src/lib/ui-classes'
import { formatDateTime } from '@/src/lib/format'
import { getClientRateChanges, type ClientRateBatch } from '@/src/lib/client-rate-history'

const emptyFilters = { from: '', to: '', actor: '', rate: '' }
type Filters = typeof emptyFilters
type Result = { request: string; rows: ClientRateBatch[]; error: boolean }

function BatchRows({ rows }: { rows: ClientRateBatch[] }) {
  return <div className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map(batch => (
    <details key={batch.event_id} className="group p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4">
        <span className="min-w-0 break-words text-sm">
          <span className="font-semibold">{batch.actor_name}</span> · {batch.changes.length === 1 ? '1 tarifa modificada' : `${batch.changes.length} tarifas modificadas`}
          <time dateTime={batch.changed_at} className="mt-1 block text-xs text-slate-500">{formatDateTime(batch.changed_at)}</time>
        </span>
        <span className="text-xs font-medium text-slate-500"><span className="group-open:hidden">Ver cambios</span><span className="hidden group-open:inline">Ocultar cambios</span></span>
      </summary>
      <div className="mt-4 space-y-4">{batch.changes.map(event => (
        <div key={event.event_id} className="min-w-0 text-sm">
          <p className="mb-2 break-words font-medium">{event.after_values?.rate_label || event.before_values?.rate_label || event.rate_code}
            <span className="font-normal text-slate-500"> · {event.destination === 'SPS' ? 'San Pedro Sula' : event.destination === 'TGU' ? 'Tegucigalpa' : 'Global'} · {!event.before_values ? 'Alta' : !event.after_values ? 'Eliminación' : 'Modificación'}</span>
          </p>
          {getClientRateChanges(event.before_values, event.after_values).map(change => (
            <div key={change.field} className="mt-1 grid gap-1 rounded-lg bg-slate-50 p-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] dark:bg-slate-900">
              <span className="font-medium">{change.label}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-slate-500">Antes: {change.before}</span>
              <span className="min-w-0 whitespace-pre-wrap break-words">Después: {change.after}</span>
            </div>
          ))}
        </div>
      ))}</div>
    </details>
  ))}</div>
}

export function ClientRateHistory({ clienteId, refreshKey }: { clienteId: string; refreshKey: number }) {
  const { profile } = useUser()
  const id = useId()
  const fullButton = useRef<HTMLButtonElement>(null)
  const owner = `${profile?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${clienteId}:${refreshKey}`
  const [view, setView] = useState({ owner, expanded: false, full: false })
  const expanded = view.owner === owner && view.expanded
  const full = view.owner === owner && view.full
  const [query, setQuery] = useState({ owner, page: 1, size: 25, filters: emptyFilters })
  const page = query.owner === owner ? query.page : 1
  const filters = query.owner === owner ? query.filters : emptyFilters
  const [draft, setDraft] = useState({ owner, filters: emptyFilters })
  const draftFilters = draft.owner === owner ? draft.filters : emptyFilters
  const [attempt, setAttempt] = useState(0)
  const [preview, setPreview] = useState<Result | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const previewRequest = `${owner}:${attempt}`
  const request = JSON.stringify([owner, page, query.size, filters, attempt, full])

  useEffect(() => {
    let active = true
    if (!profile?.id || !profile.tenant_id) return
    void supabase.rpc('get_client_rate_history_batches', { p_cliente_id: clienteId, p_limit: 5, p_offset: 0 }).then(
      ({ data, error }) => { if (active) setPreview({ request: previewRequest, rows: error ? [] : (data || []) as ClientRateBatch[], error: !!error }) },
      () => { if (active) setPreview({ request: previewRequest, rows: [], error: true }) },
    )
    return () => { active = false }
  }, [clienteId, profile?.id, profile?.tenant_id, previewRequest])

  useEffect(() => {
    let active = true
    if (!full || !profile?.id || !profile.tenant_id) return
    void supabase.rpc('get_client_rate_history_batches', {
      p_cliente_id: clienteId, p_limit: query.size, p_offset: (page - 1) * query.size,
      p_from: filters.from || null, p_to: filters.to || null, p_actor: filters.actor || null, p_rate: filters.rate || null,
    }).then(
      ({ data, error }) => { if (active) setResult({ request, rows: error ? [] : (data || []) as ClientRateBatch[], error: !!error }) },
      () => { if (active) setResult({ request, rows: [], error: true }) },
    )
    return () => { active = false }
  }, [clienteId, full, page, query.size, filters, profile?.id, profile?.tenant_id, request])

  const currentPreview = preview?.request === previewRequest ? preview : null
  const current = result?.request === request ? result : null
  const latest = currentPreview?.rows[0]
  const renderRows = (value: Result | null, isFull = false) => !value ? <p role="status" className="p-4 text-sm text-slate-500">Cargando historial…</p> : value.error ? (
    <div role="alert" className="space-y-3 p-4"><p className="text-sm text-red-600">No se pudo cargar el historial de tarifas.</p><button type="button" className={secondaryButtonClass} onClick={() => setAttempt(v => v + 1)}>Reintentar</button></div>
  ) : value.rows.length === 0 ? <EmptyState title="Sin cambios registrados" description={isFull ? 'No hay movimientos para los filtros seleccionados.' : 'Los próximos cambios de tarifas aparecerán aquí con su autor.'} /> : <BatchRows rows={value.rows} />
  const updateDraft = (field: keyof Filters, value: string) => setDraft({ owner, filters: { ...draftFilters, [field]: value } })

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">Historial de tarifas</h3>
        <p className="mt-1 break-words text-xs text-slate-500">{!currentPreview ? 'Consultando última actualización…' : currentPreview.error ? 'No se pudo consultar la última actualización.' : latest ? <>Última actualización: {formatDateTime(latest.changed_at)} · {latest.actor_name}</> : 'Sin cambios registrados.'}</p>
      </div>
      <button type="button" className={secondaryButtonClass} aria-expanded={expanded} aria-controls={id} onClick={() => setView({ owner, expanded: !expanded, full: false })}>{expanded ? 'Ocultar historial' : 'Ver historial'}</button>
    </div>
    {expanded && <div id={id} className="border-t border-slate-100 dark:border-slate-800">
      <p className="px-4 pt-3 text-xs text-slate-500">Últimos 5 movimientos. Cada movimiento agrupa los cambios de un guardado.</p>
      {renderRows(currentPreview)}
      <div className="px-4 pb-4"><button ref={fullButton} type="button" className={secondaryButtonClass} onClick={() => setView({ owner, expanded: true, full: true })}>Ver historial completo</button></div>
    </div>}
    <Dialog open={full} onOpenChange={open => setView({ owner, expanded, full: open })}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl" onCloseAutoFocus={event => { event.preventDefault(); fullButton.current?.focus() }}>
        <DialogHeader><DialogTitle>Historial completo de tarifas</DialogTitle><DialogDescription>Consulta por guardado. Los registros de auditoría se conservan íntegros. Fechas según Honduras.</DialogDescription></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); setQuery({ owner, page: 1, size: query.size, filters: { ...draftFilters } }) }}>
          <FormField label="Desde"><input aria-label="Desde" type="date" className={fieldClassSm} value={draftFilters.from} onChange={e => updateDraft('from', e.target.value)} /></FormField>
          <FormField label="Hasta"><input aria-label="Hasta" type="date" className={fieldClassSm} min={draftFilters.from || undefined} value={draftFilters.to} onChange={e => updateDraft('to', e.target.value)} /></FormField>
          <FormField label="Usuario"><input aria-label="Usuario" className={fieldClassSm} value={draftFilters.actor} onChange={e => updateDraft('actor', e.target.value)} placeholder="Nombre del usuario" /></FormField>
          <FormField label="Tarifa"><input aria-label="Tarifa" className={fieldClassSm} value={draftFilters.rate} onChange={e => updateDraft('rate', e.target.value)} placeholder="Concepto o código" /></FormField>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className={secondaryButtonClass}>Aplicar filtros</button><button type="button" className={secondaryButtonClass} onClick={() => { setDraft({ owner, filters: emptyFilters }); setQuery({ owner, page: 1, size: query.size, filters: emptyFilters }) }}>Limpiar filtros</button></div>
        </form>
        {renderRows(current, true)}
        {current && !current.error && current.rows.length > 0 && <Pagination page={page} pageSize={query.size} total={Number(current.rows[0].total_count)} onPageChange={value => setQuery({ owner, page: value, size: query.size, filters })} onPageSizeChange={size => setQuery({ owner, page: 1, size, filters })} />}
      </DialogContent>
    </Dialog>
  </section>
}
