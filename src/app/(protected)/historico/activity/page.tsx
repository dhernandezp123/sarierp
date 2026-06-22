'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { filterSelectClass } from '@/src/lib/ui-classes'

type ActivityLog = {
  id: string
  module: string
  action: string
  description: string | null
  created_at: string
  user?: {
    nombre: string | null
    apellido: string | null
  } | null
}

export default function ActivityCenterPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState('Todos')
  const [search, setSearch] = useState('')

  const loadLogs = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('activity_logs')
      .select(`
        *,
        user:profiles!activity_logs_user_id_fkey (
          nombre,
          apellido
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data) {
      setLogs(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [])

  const modules = ['Todos', ...Array.from(new Set(logs.map((log) => log.module)))]

  const filteredLogs = logs.filter((log) => {
    const userName = `${log.user?.nombre || ''} ${log.user?.apellido || ''}`.toLowerCase()
    const query = search.toLowerCase()

    const matchesSearch =
      log.description?.toLowerCase().includes(query) ||
      log.action.toLowerCase().includes(query) ||
      log.module.toLowerCase().includes(query) ||
      userName.includes(query)

    const matchesModule =
      moduleFilter === 'Todos' || log.module === moduleFilter

    return matchesSearch && matchesModule
  })

  if (loading) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando actividad...</p>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Activity Center
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Bitácora global de acciones del ERP.
        </p>
      </div>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar actividad..."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white md:max-w-sm"
        />

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className={filterSelectClass}
        >
          {modules.map((module) => (
            <option key={module} value={module}>
              {module}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
        <div className="space-y-3">
          {filteredLogs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay actividad para mostrar.
            </p>
          ) : (
            filteredLogs.map((log) => {
              const userName =
                log.user?.nombre || log.user?.apellido
                  ? `${log.user?.nombre || ''} ${log.user?.apellido || ''}`.trim()
                  : 'Sistema'

              return (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/70"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-slate-950">
                          {log.module}
                        </span>

                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {log.action}
                        </span>
                      </div>

                      <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                        {log.description || 'Actividad registrada'}
                      </p>

                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Por {userName}
                      </p>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
