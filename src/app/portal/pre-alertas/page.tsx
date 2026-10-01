'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Plus, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { formatDateShort } from '@/src/lib/format'
import { PortalError } from '@/src/components/portal/PortalFeedback'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import {
  PortalSearchInput,
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalFilterPills,
  PortalPageHeader,
  PortalStatusBadge,
} from '@/src/components/portal/PortalUI'

type PreAlert = {
  id: string
  tracking_number: string
  carrier: string | null
  description: string | null
  expected_date: string | null
  status: 'Pendiente' | 'Recibido' | 'Cancelado'
  created_at: string
  matched_package_id: string | null
}

const STATUS_FILTERS = ['Todos', 'Pendiente', 'Recibido', 'Cancelado'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const statusIcon: Record<string, React.ReactNode> = {
  Pendiente: <Clock className="h-3 w-3" />,
  Recibido: <CheckCircle2 className="h-3 w-3" />,
  Cancelado: <XCircle className="h-3 w-3" />,
}

export default function PortalPreAlertasPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [alerts, setAlerts] = useState<PreAlert[]>([])
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Todos')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const loadVersion = useRef(0)
  const loadAlerts = useCallback(async (clientId: string) => {
    const version = ++loadVersion.current
    setLoadError(false)
    try {
    setLoading(true)
    let query = supabase
      .from('miami_pre_alerts')
      .select('id, tracking_number, carrier, description, expected_date, status, created_at, matched_package_id', { count: 'exact' })
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'Todos') query = query.eq('status', statusFilter)
    if (search.trim()) query = query.ilike('tracking_number', `%${search.trim().replace(/[\\%_]/g, char => '\\' + char)}%`)
    const { data, error, count } = await query.range(page * 20, (page + 1) * 20 - 1)
    if (version !== loadVersion.current) return
    if (error) throw error
    setTotal(count || 0)
    setAlerts((data ?? []) as PreAlert[])
    setLoading(false)
    } catch { if (version === loadVersion.current) setLoadError(true) } finally { if (version === loadVersion.current) setLoading(false) }
  }, [page, statusFilter, search])

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadAlerts(clientId), 0)
    return () => { window.clearTimeout(timeout); loadVersion.current += 1 }
  }, [profile?.cliente_id, loadAlerts])

  const filtered = statusFilter === 'Todos' ? alerts : alerts.filter(a => a.status === statusFilter)

  if (loadError) return <PortalError onRetry={() => profile?.cliente_id && void loadAlerts(profile.cliente_id)} />

  return (
    <div className="space-y-5">
      <PortalPageHeader
        title="Pre-alertas"
        subtitle="Paquetes que has notificado que vienen en camino"
        action={(
          <PortalButton onClick={() => router.push('/portal/pre-alertas/nueva')}>
            <Plus className="h-4 w-4" />
            Nueva
          </PortalButton>
        )}
      />

      <PortalSearchInput value={search} onChange={value => { setSearch(value); setPage(0) }} placeholder="Buscar prealerta por tracking" />
      <PortalFilterPills options={STATUS_FILTERS} value={statusFilter} onChange={value => { setStatusFilter(value); setPage(0) }} />

      {/* List */}
      <PortalCard>
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <PortalEmptyState
            icon={<Bell className="h-8 w-8" />}
            title={search || statusFilter !== 'Todos' ? 'Sin resultados' : 'No tienes pre-alertas registradas'}
            description={alerts.length === 0 ? 'Registra una pre-alerta para notificar que un paquete viene en camino.' : undefined}
            action={alerts.length === 0 ? (
              <PortalButton onClick={() => router.push('/portal/pre-alertas/nueva')}>
                Registrar primera pre-alerta
              </PortalButton>
            ) : undefined}
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(a => {
              return (
                <div key={a.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Bell className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{a.tracking_number}</p>
                      <PortalStatusBadge status={a.status} icon={statusIcon[a.status]} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {a.carrier ?? 'Sin carrier'}
                      {a.description && <span> · {a.description}</span>}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                      <span>Creada {new Date(a.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}</span>
                      {a.expected_date && (
                        <span className="text-amber-500">
                          Est. {formatDateShort(a.expected_date)}
                        </span>
                      )}
                    </div>
                    {a.status === 'Recibido' && a.matched_package_id && (
                      <button
                        type="button"
                        onClick={() => router.push(`/portal/paquetes/${a.matched_package_id}`)}
                        className="mt-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Ver paquete recibido →
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PortalCard>
      {!loading && <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{total} prealertas · Página {page + 1}</p><div className="flex gap-2"><PortalButton variant="secondary" disabled={!page} onClick={() => setPage(v => v - 1)}>Anterior</PortalButton><PortalButton variant="secondary" disabled={(page + 1) * 20 >= total} onClick={() => setPage(v => v + 1)}>Siguiente</PortalButton></div></div>}
    </div>
  )
}
