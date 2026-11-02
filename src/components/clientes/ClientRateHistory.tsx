'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { Pagination } from '@/src/components/ui/Pagination'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { secondaryButtonClass } from '@/src/lib/ui-classes'
import { formatDateTime } from '@/src/lib/format'
import { getClientRateChanges, type ClientRateEvent } from '@/src/lib/client-rate-history'

export function ClientRateHistory({ clienteId, refreshKey }: { clienteId: string; refreshKey: number }) {
  const { profile } = useUser()
  const owner = `${profile?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${clienteId}:${refreshKey}`
  const [paging, setPaging] = useState({ owner, page: 1, size: 25 })
  const page = paging.owner === owner ? paging.page : 1
  const [attempt, setAttempt] = useState(0)
  const request = `${owner}:${page}:${paging.size}:${attempt}`
  const [result, setResult] = useState<{ request: string; rows: ClientRateEvent[]; error: string | null } | null>(null)

  useEffect(() => {
    let active = true
    if (!profile?.id || !profile.tenant_id) return
    void supabase.rpc('get_client_rate_history', {
      p_cliente_id: clienteId, p_limit: paging.size, p_offset: (page - 1) * paging.size,
    }).then(({ data, error }) => {
      if (active) setResult({ request, rows: error ? [] : (data || []) as ClientRateEvent[],
        error: error ? 'No se pudo cargar el historial de tarifas.' : null })
    }, () => {
      if (active) setResult({ request, rows: [], error: 'No se pudo cargar el historial de tarifas.' })
    })
    return () => { active = false }
  }, [clienteId, page, paging.size, profile?.id, profile?.tenant_id, request])

  const current = result?.request === request ? result : null
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]">
      <div className="border-b border-slate-100 p-6 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Historial de tarifas</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Usuario, fecha y valores anteriores y nuevos. Se muestran los cambios registrados desde la habilitación de la auditoría.
        </p>
      </div>
      {!current ? <p className="p-6 text-sm text-slate-500">Cargando historial…</p> : current.error ? (
        <div role="alert" className="space-y-3 p-6">
          <p className="text-sm text-red-600 dark:text-red-400">{current.error}</p>
          <button type="button" className={secondaryButtonClass} onClick={() => setAttempt((value) => value + 1)}>Reintentar</button>
        </div>
      ) : current.rows.length === 0 ? (
        <EmptyState title="Sin cambios registrados" description="Los próximos cambios de tarifas aparecerán aquí con su autor." />
      ) : (
        <>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {current.rows.map((event) => (
              <article key={event.event_id} className="space-y-3 p-6">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {event.after_values?.rate_label || event.before_values?.rate_label || event.rate_code}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {event.actor_name} · {event.destination === 'SPS' ? 'San Pedro Sula' : event.destination === 'TGU' ? 'Tegucigalpa' : 'Global'}
                      {' · '}{!event.before_values ? 'Alta' : !event.after_values ? 'Eliminación' : 'Modificación'}
                    </p>
                  </div>
                  <time dateTime={event.changed_at} className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(event.changed_at)}</time>
                </header>
                <div className="space-y-2 text-sm">
                  {getClientRateChanges(event.before_values, event.after_values).map((change) => (
                    <div key={change.field} className="grid gap-1 rounded-lg bg-slate-50 p-3 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] dark:bg-slate-900">
                      <span className="font-medium text-slate-700 dark:text-slate-200">{change.label}</span>
                      <span className="min-w-0 whitespace-pre-wrap break-words text-slate-500 dark:text-slate-400">Antes: {change.before}</span>
                      <span className="min-w-0 whitespace-pre-wrap break-words text-slate-900 dark:text-white">Después: {change.after}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} pageSize={paging.size} total={Number(current.rows[0].total_count)}
            onPageChange={(value) => setPaging({ owner, page: value, size: paging.size })}
            onPageSizeChange={(size) => setPaging({ owner, page: 1, size })} />
        </>
      )}
    </section>
  )
}
