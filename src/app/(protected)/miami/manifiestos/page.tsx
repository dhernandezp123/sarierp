'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { ClipboardList } from 'lucide-react'

type ManifestRow = {
  id: string
  manifest_number: string
  status: 'Abierto' | 'Cerrado'
  total_packages: number
  notes: string | null
  created_at: string
  closed_at: string | null
}

export default function ManifestosPage() {
  const router = useRouter()
  const [manifests, setManifests] = useState<ManifestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Todos')

  useEffect(() => { loadManifests() }, [])

  const loadManifests = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('miami_manifests')
      .select('id, manifest_number, status, total_packages, notes, created_at, closed_at')
      .order('created_at', { ascending: false })

    if (error) { toast.error(error.message); setLoading(false); return }
    setManifests((data ?? []) as ManifestRow[])
    setLoading(false)
  }

  const filtered = statusFilter === 'Todos' ? manifests : manifests.filter(m => m.status === statusFilter)

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Miami Bodega', href: '/miami' }, { label: 'Manifiestos' }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Manifiestos de Ingreso</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Lotes de carga recibidos en bodega Miami.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/miami/manifiestos/nuevo')}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
          Nuevo manifiesto
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        {['Todos', 'Abierto', 'Cerrado'].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              statusFilter === s
                ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-950'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="sr-only">
          {['Todos', 'Abierto', 'Cerrado'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className={`${cardClass} p-0`}>
        {loading ? (
          <div className="p-6"><TableSkeleton rows={6} cols={5} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-6 w-6" />}
            title={manifests.length === 0 ? 'Sin manifiestos' : 'Sin resultados'}
            description={manifests.length === 0 ? 'Crea el primer manifiesto para comenzar el ingreso por lotes.' : 'No hay manifiestos con ese estado.'}
            action={manifests.length === 0 ? { label: 'Nuevo manifiesto', onClick: () => router.push('/miami/manifiestos/nuevo') } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  {['Manifiesto', 'Paquetes', 'Estado', 'Apertura', 'Cierre', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/miami/manifiestos/${m.id}`)}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{m.manifest_number}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.total_packages}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        m.status === 'Abierto'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(m.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {m.closed_at ? new Date(m.closed_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); router.push(`/miami/manifiestos/${m.id}`) }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {filtered.length} de {manifests.length} manifiestos
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
