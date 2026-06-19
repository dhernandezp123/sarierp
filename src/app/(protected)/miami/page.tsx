'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, ClipboardList, CheckCircle2, AlertCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'

type ManifesteRow = {
  id: string
  manifest_number: string
  status: string
  total_packages: number
  created_at: string
  received_by: string | null
}

type PackageRow = {
  id: string
  tracking_number: string
  carrier: string | null
  weight_lbs: number | null
  status: string
  received_at: string
  warehouse_number: string | null
}

type Metrics = {
  sinAsignar: number
  asignadosHoy: number
  manifiestoAbiertos: number
  recibidosHoy: number
}

export default function MiamiDashboardPage() {
  const router = useRouter()
  const [metrics, setMetrics] = useState<Metrics>({ sinAsignar: 0, asignadosHoy: 0, manifiestoAbiertos: 0, recibidosHoy: 0 })
  const [openManifests, setOpenManifests] = useState<ManifesteRow[]>([])
  const [unassignedPackages, setUnassignedPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      const [
        { count: sinAsignar },
        { count: asignadosHoy },
        { count: manifiestoAbiertos },
        { count: recibidosHoy },
        { data: manifests },
        { data: packages },
      ] = await Promise.all([
        supabase.from('miami_packages').select('id', { count: 'exact', head: true }).eq('status', 'Sin asignar'),
        supabase.from('miami_packages').select('id', { count: 'exact', head: true }).eq('status', 'Asignado').gte('assigned_at', today),
        supabase.from('miami_manifests').select('id', { count: 'exact', head: true }).eq('status', 'Abierto'),
        supabase.from('miami_packages').select('id', { count: 'exact', head: true }).gte('received_at', today),
        supabase.from('miami_manifests').select('id, manifest_number, status, total_packages, created_at, received_by').eq('status', 'Abierto').order('created_at', { ascending: false }).limit(10),
        supabase.from('miami_packages').select('id, tracking_number, carrier, weight_lbs, status, received_at, warehouse_number').eq('status', 'Sin asignar').order('received_at', { ascending: false }).limit(15),
      ])

      setMetrics({
        sinAsignar: sinAsignar ?? 0,
        asignadosHoy: asignadosHoy ?? 0,
        manifiestoAbiertos: manifiestoAbiertos ?? 0,
        recibidosHoy: recibidosHoy ?? 0,
      })
      setOpenManifests((manifests ?? []) as ManifesteRow[])
      setUnassignedPackages((packages ?? []) as PackageRow[])
    } catch {
      toast.error('Error cargando datos del dashboard')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" />
          ))}
        </div>
        <div className={`${cardClass} p-6`}>
          <TableSkeleton rows={5} cols={5} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Bodega Miami</p>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Dashboard de Operaciones</h1>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push('/miami/ingreso')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            Ingreso individual
          </button>
          <button
            type="button"
            onClick={() => router.push('/miami/manifiestos/nuevo')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ClipboardList className="h-4 w-4" />
            Nuevo manifiesto
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Sin asignar" value={metrics.sinAsignar} icon={<AlertCircle className="h-5 w-5" />} tone="amber" />
        <MetricCard label="Asignados hoy" value={metrics.asignadosHoy} icon={<CheckCircle2 className="h-5 w-5" />} tone="emerald" />
        <MetricCard label="Manifiestos abiertos" value={metrics.manifiestoAbiertos} icon={<ClipboardList className="h-5 w-5" />} tone="blue" />
        <MetricCard label="Recibidos hoy" value={metrics.recibidosHoy} icon={<Package className="h-5 w-5" />} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Manifiestos abiertos */}
        <div className={`${cardClass} p-0`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Manifiestos abiertos</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Lotes de carga pendientes de cierre</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/miami/manifiestos')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Ver todos
            </button>
          </div>

          {openManifests.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
              <ClipboardList className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay manifiestos abiertos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 dark:bg-[#081120]">
                    {['Manifiesto', 'Paquetes', 'Apertura', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openManifests.map(m => (
                    <tr
                      key={m.id}
                      onClick={() => router.push(`/miami/manifiestos/${m.id}`)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{m.manifest_number}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.total_packages}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {new Date(m.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Abierto</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Paquetes sin asignar */}
        <div className={`${cardClass} p-0`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="font-semibold text-slate-950 dark:text-white">Paquetes sin asignar</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Últimos recibidos pendientes de cliente</p>
            </div>
          </div>

          {unassignedPackages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Todos los paquetes están asignados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 dark:bg-[#081120]">
                    {['Tracking', 'Carrier', 'Peso', 'Recibido'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unassignedPackages.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-white">{p.tracking_number}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.carrier ?? 'N/A'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.weight_lbs ? `${p.weight_lbs} lbs` : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {new Date(p.received_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'amber' | 'emerald' | 'blue' | 'slate' }) {
  const tones = {
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200',
    blue:    'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200',
    slate:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <span className={`rounded-xl p-2 ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}
