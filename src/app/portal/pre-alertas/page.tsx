'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Plus, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { formatDateShort } from '@/src/lib/format'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

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

const STATUS_FILTERS = ['Todos', 'Pendiente', 'Recibido', 'Cancelado']

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'Pendiente':  { label: 'Pendiente',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',     icon: <Clock className="h-3 w-3" /> },
  'Recibido':   { label: 'Recibido',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  'Cancelado':  { label: 'Cancelado',  color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',        icon: <XCircle className="h-3 w-3" /> },
}

export default function PortalPreAlertasPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [alerts, setAlerts] = useState<PreAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')

  const loadAlerts = async (clientId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('miami_pre_alerts')
      .select('id, tracking_number, carrier, description, expected_date, status, created_at, matched_package_id')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    setAlerts((data ?? []) as PreAlert[])
    setLoading(false)
  }

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadAlerts(clientId), 0)
    return () => window.clearTimeout(timeout)
  }, [profile?.cliente_id])

  const filtered = statusFilter === 'Todos' ? alerts : alerts.filter(a => a.status === statusFilter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Pre-alertas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Paquetes que has notificado que vienen en camino</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/portal/pre-alertas/nueva')}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nueva
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              statusFilter === s
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {alerts.length === 0 ? 'No tienes pre-alertas registradas' : 'Sin resultados'}
            </p>
            {alerts.length === 0 && (
              <>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Registra una pre-alerta para notificar que un paquete viene en camino
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/portal/pre-alertas/nueva')}
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Registrar primera pre-alerta
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(a => {
              const cfg = statusConfig[a.status]
              return (
                <div key={a.id} className="flex items-start gap-4 px-5 py-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                    <Bell className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{a.tracking_number}</p>
                      <span className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.color}`}>
                        {cfg.icon}{cfg.label}
                      </span>
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
      </div>
    </div>
  )
}
