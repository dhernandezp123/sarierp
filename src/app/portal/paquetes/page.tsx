'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Package, ChevronRight } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { formatMiamiDateTime } from '@/src/lib/format'
import { portalPackageStatus, portalTrackingFilter } from '@/src/lib/portal'
import { PortalError } from '@/src/components/portal/PortalFeedback'
import { PortalButton, PortalCard, PortalEmptyState, PortalFilterPills, PortalPageHeader, PortalSearchInput, PortalStatusBadge } from '@/src/components/portal/PortalUI'
type PackageRow = { id: string; tracking_number: string; carrier: string | null; warehouse_number: string | null; status: string; cargo_status: string | null; received_at: string }
const FILTERS = ['Todos', 'Activos', 'Entregado', 'Con incidencia'] as const
const PAGE_SIZE = 20
function PackagesContent() {
  const { profile } = useUser()
  const params = useSearchParams()
  const search = params.get('q') || ''
  const status = FILTERS.find(value => value === params.get('estado')) || 'Todos'
  const rawPage = Number(params.get('pagina'))
  const page = Number.isFinite(rawPage) ? Math.max(0, Math.floor(rawPage)) : 0
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([profile?.cliente_id, search, status, page, retry])
  const [result, setResult] = useState<{ key: string; rows: PackageRow[]; count: number; error: boolean }>({ key: '', rows: [], count: 0, error: false })
  const loading = result.key !== key
  function filter(values: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    Object.entries(values).forEach(([name, value]) => value ? next.set(name, value) : next.delete(name))
    window.history.replaceState(null, '', `/portal/paquetes?${next}`)
  }
  useEffect(() => {
    if (!profile?.cliente_id) return
    const controller = new AbortController()
    const clientId = profile.cliente_id
    const timer = window.setTimeout(async () => {
      try {
        let query = supabase.from('miami_packages').select('id, tracking_number, carrier, warehouse_number, status, cargo_status, received_at', { count: 'exact' }).eq('cliente_id', clientId)
        if (status === 'Activos') query = query.neq('status', 'Entregado')
        else if (status !== 'Todos') query = query.eq('status', status)
        if (search.trim()) query = query.or(portalTrackingFilter(search))
        const { data, count, error } = await query.order('received_at', { ascending: false }).order('id', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).abortSignal(controller.signal)
        if (error) throw error
        if (!controller.signal.aborted) setResult({ key, rows: (data || []) as PackageRow[], count: count || 0, error: false })
      } catch {
        if (!controller.signal.aborted) setResult({ key, rows: [], count: 0, error: true })
      }
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, profile?.cliente_id, search, status, page])
  return <div className="space-y-5">
    <PortalPageHeader title="Mis paquetes" subtitle="Busca en todos tus paquetes por tracking o referencia de bodega." action={<Link className="inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white" href="/portal/pre-alertas/nueva">Crear prealerta</Link>} />
    <PortalSearchInput value={search} onChange={q => filter({ q, pagina: '' })} placeholder="Buscar tracking o referencia de bodega" />
    <PortalFilterPills options={FILTERS} value={status} onChange={estado => filter({ estado, pagina: '' })} labelFor={value => value === 'Entregado' ? 'Entregados' : value} />
    {loading ? <p role="status" className="p-5 text-sm text-slate-500">Buscando paquetes…</p> : result.error ? <PortalError onRetry={() => setRetry(value => value + 1)} /> : <>
      <PortalCard>{result.rows.length === 0 ? <PortalEmptyState icon={<Package className="h-8 w-8" />} title={search || status !== 'Todos' || page ? 'Sin resultados' : 'No tienes paquetes aún'} description={search || status !== 'Todos' ? 'Prueba otro tracking o cambia el filtro.' : 'Tus paquetes aparecerán aquí cuando lleguen a bodega.'} /> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{result.rows.map(pkg => <Link key={pkg.id} href={`/portal/paquetes/${pkg.id}?returnTo=${encodeURIComponent(`/portal/paquetes?${params}`)}`} className="flex items-start gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800">
        <Package className="mt-1 h-5 w-5 shrink-0 text-slate-400" /><div className="min-w-0 flex-1 space-y-1"><p className="break-all font-mono text-sm font-semibold">{pkg.tracking_number}</p><p className="break-words text-xs text-slate-500">{pkg.carrier || 'Transportista por confirmar'}{pkg.warehouse_number ? ` · ${pkg.warehouse_number}` : ''}</p><p className="text-xs text-slate-500">{formatMiamiDateTime(pkg.received_at)}</p><PortalStatusBadge status={portalPackageStatus(pkg)} />{pkg.status === 'Con incidencia' && <span className="ml-2 text-xs text-red-600">Con incidencia</span>}</div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
      </Link>)}</div>}</PortalCard>
      <div className="flex flex-wrap items-center justify-between gap-3"><p aria-live="polite" className="text-xs text-slate-500">{result.count} paquetes · Página {page + 1}</p><div className="flex gap-2"><PortalButton variant="secondary" disabled={page === 0} onClick={() => filter({ pagina: String(page - 1) })}>Anterior</PortalButton><PortalButton variant="secondary" disabled={(page + 1) * PAGE_SIZE >= result.count} onClick={() => filter({ pagina: String(page + 1) })}>Siguiente</PortalButton></div></div>
    </>}
  </div>
}
export default function PortalPaquetesPage() { return <Suspense fallback={<p>Cargando paquetes…</p>}><PackagesContent /></Suspense> }
