'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Plus } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type Incidencia = {
  id: string
  tipo: string
  descripcion: string | null
  status: string
  resolucion: string | null
  created_at: string
  package_id: string
  tracking_number?: string
}

const STATUS_FILTERS = ['Todos', 'Abierta', 'En revisión', 'Resuelta', 'Cerrada']

const statusColors: Record<string, string> = {
  'Abierta':     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'En revisión': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Resuelta':    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Cerrada':     'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

export default function PortalIncidenciasPage() {
  const { profile } = useUser()
  const router = useRouter()
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')

  const loadIncidencias = async (clientId: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('miami_incidencias')
      .select('id, tipo, descripcion, status, resolucion, created_at, package_id')
      .eq('cliente_id', clientId)
      .order('created_at', { ascending: false })

    const incs = (data ?? []) as Incidencia[]

    // Fetch tracking numbers for context
    const packageIds = [...new Set(incs.map(i => i.package_id))]
    if (packageIds.length > 0) {
      const { data: pkgs } = await supabase
        .from('miami_packages')
        .select('id, tracking_number')
        .in('id', packageIds)
      const pkgMap = Object.fromEntries((pkgs ?? []).map(p => [p.id, p.tracking_number]))
      incs.forEach(i => { i.tracking_number = pkgMap[i.package_id] })
    }

    setIncidencias(incs)
    setLoading(false)
  }

  useEffect(() => {
    const clientId = profile?.cliente_id
    if (!clientId) return
    const timeout = window.setTimeout(() => void loadIncidencias(clientId), 0)
    return () => window.clearTimeout(timeout)
  }, [profile?.cliente_id])

  const filtered = statusFilter === 'Todos' ? incidencias : incidencias.filter(i => i.status === statusFilter)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Incidencias</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Problemas reportados con tus paquetes</p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/portal/incidencias/nueva')}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          <Plus className="h-4 w-4" />
          Reportar
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
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {incidencias.length === 0 ? 'No tienes incidencias reportadas' : 'Sin resultados'}
            </p>
            {incidencias.length === 0 && (
              <p className="mt-1 text-xs text-slate-400">¡Genial! Eso significa que todo va bien con tus paquetes.</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(inc => (
              <div key={inc.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[inc.status] ?? statusColors['Cerrada']}`}>
                        {inc.status}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{inc.tipo}</span>
                    </div>
                    {inc.tracking_number && (
                      <button
                        type="button"
                        onClick={() => router.push(`/portal/paquetes/${inc.package_id}`)}
                        className="mt-1 font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {inc.tracking_number}
                      </button>
                    )}
                    {inc.descripcion && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{inc.descripcion}</p>
                    )}
                    {inc.resolucion && (
                      <div className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20">
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Resolución: <span className="font-normal">{inc.resolucion}</span></p>
                      </div>
                    )}
                  </div>
                  <p className="shrink-0 text-xs text-slate-400">
                    {new Date(inc.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
