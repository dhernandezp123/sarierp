'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ScanLine, X, Search, CheckCircle2, Lock, Package } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { notifyClientPackageAssigned } from '@/src/lib/client-notifications'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'

const CARRIERS = ['UPS', 'FedEx', 'DHL', 'USPS', 'Amazon Logistics', 'OnTrac', 'LaserShip', 'Otro']

type Manifest = {
  id: string
  manifest_number: string
  status: 'Abierto' | 'Cerrado'
  total_packages: number
  notes: string | null
  created_at: string
  closed_at: string | null
}

type PackageRow = {
  id: string
  tracking_number: string
  carrier: string | null
  weight_lbs: number | null
  ft3: number | null
  status: string
  warehouse_number: string | null
  cliente_id: string | null
  cliente_nombre?: string | null
  received_at: string
}

type ClienteOption = { id: string; nombre: string; codigo_cliente: string | null }

export default function ManifiestoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()
  const trackingRef = useRef<HTMLInputElement>(null)

  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scanTracking, setScanTracking] = useState('')
  const [scanCarrier, setScanCarrier] = useState('')
  const [scanWeight, setScanWeight] = useState('')
  const [scanning, setScanning] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)

  // Assign modal state
  const [assignPackageId, setAssignPackageId] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ClienteOption[]>([])
  const [selectedClient, setSelectedClient] = useState<ClienteOption | null>(null)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => { loadData() }, [id])

  // Auto-focus scan input when manifest is open
  useEffect(() => {
    if (manifest?.status === 'Abierto') trackingRef.current?.focus()
  }, [manifest?.status])

  // Client search debounce
  useEffect(() => {
    if (!assignPackageId || clientSearch.trim().length < 2) { setClientResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, codigo_cliente')
        .ilike('nombre', `%${clientSearch}%`)
        .is('deleted_at', null)
        .limit(8)
      setClientResults((data ?? []) as ClienteOption[])
    }, 250)
    return () => clearTimeout(t)
  }, [clientSearch, assignPackageId])

  const loadData = async () => {
    setLoading(true)
    const [{ data: mData, error: mErr }, { data: pkgData, error: pkgErr }] = await Promise.all([
      supabase.from('miami_manifests').select('*').eq('id', id).single(),
      supabase
        .from('miami_packages')
        .select('id, tracking_number, carrier, weight_lbs, ft3, status, warehouse_number, cliente_id, received_at')
        .eq('manifest_id', id)
        .order('received_at', { ascending: false }),
    ])

    if (mErr) { toast.error('Manifiesto no encontrado'); router.push('/miami/manifiestos'); return }
    setManifest(mData as Manifest)

    // Fetch client names
    const pkgs = (pkgData ?? []) as PackageRow[]
    const clientIds = [...new Set(pkgs.filter(p => p.cliente_id).map(p => p.cliente_id!))]
    if (clientIds.length > 0) {
      const { data: clientes } = await supabase.from('clientes').select('id, nombre').in('id', clientIds)
      const clientMap = Object.fromEntries((clientes ?? []).map(c => [c.id, c.nombre]))
      pkgs.forEach(p => { if (p.cliente_id) p.cliente_nombre = clientMap[p.cliente_id] ?? null })
    }

    setPackages(pkgs)
    setLoading(false)
  }

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanTracking.trim()) return
    setScanning(true)
    try {
      const { error } = await supabase.from('miami_packages').insert({
        tracking_number: scanTracking.trim().toUpperCase(),
        carrier: scanCarrier || null,
        weight_lbs: parseFloat(scanWeight) || null,
        weight_kg: parseFloat(scanWeight) ? parseFloat((parseFloat(scanWeight) * 0.453592).toFixed(2)) : null,
        manifest_id: id,
        received_by: user?.id ?? null,
        status: 'Sin asignar',
      })
      if (error) throw error
      toast.success(`${scanTracking.trim().toUpperCase()} añadido al manifiesto`)
      setScanTracking('')
      setScanWeight('')
      trackingRef.current?.focus()
      await loadData()
    } catch (err: any) {
      toast.error(err.message ?? 'Error al añadir paquete')
    } finally {
      setScanning(false)
    }
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      const { error } = await supabase
        .from('miami_manifests')
        .update({ status: 'Cerrado', closed_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      toast.success('Manifiesto cerrado')
      setManifest(prev => prev ? { ...prev, status: 'Cerrado', closed_at: new Date().toISOString() } : prev)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cerrar manifiesto')
    } finally {
      setClosing(false)
      setConfirmClose(false)
    }
  }

  const handleAssign = async () => {
    if (!assignPackageId || !selectedClient) return
    setAssigning(true)
    try {
      const { data: whData } = await supabase.rpc('next_warehouse_number')
      const { error } = await supabase.from('miami_packages').update({
        cliente_id: selectedClient.id,
        warehouse_number: whData,
        status: 'Asignado',
        assigned_at: new Date().toISOString(),
        assigned_by: user?.id ?? null,
      }).eq('id', assignPackageId)
      if (error) throw error

      // Find tracking number for notification
      const pkg = packages.find(p => p.id === assignPackageId)
      if (pkg) {
        await notifyClientPackageAssigned({
          clienteId:       selectedClient.id,
          packageId:       assignPackageId,
          trackingNumber:  pkg.tracking_number,
          warehouseNumber: whData,
        })
      }

      toast.success(`Asignado a ${selectedClient.nombre} — WH: ${whData}`)
      setAssignPackageId(null)
      setSelectedClient(null)
      setClientSearch('')
      await loadData()
    } catch (err: any) {
      toast.error(err.message ?? 'Error al asignar')
    } finally {
      setAssigning(false)
    }
  }

  if (loading) return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
      <div className={`${cardClass} p-6`}><TableSkeleton rows={6} cols={5} /></div>
    </div>
  )

  if (!manifest) return null
  const isOpen = manifest.status === 'Abierto'

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Miami Bodega', href: '/miami' },
        { label: 'Manifiestos', href: '/miami/manifiestos' },
        { label: manifest.manifest_number },
      ]} />

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Cerrar manifiesto"
        description={`Cerrar ${manifest.manifest_number} con ${manifest.total_packages} paquetes. No podrás añadir más paquetes después.`}
        confirmLabel="Cerrar manifiesto"
        danger
        onConfirm={handleClose}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{manifest.manifest_number}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isOpen
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              {manifest.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {manifest.total_packages} paquetes · Creado {new Date(manifest.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' })}
            {manifest.closed_at && ` · Cerrado ${new Date(manifest.closed_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`}
          </p>
          {manifest.notes && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 italic">{manifest.notes}</p>}
        </div>
        {isOpen && (
          <button
            type="button"
            onClick={() => setConfirmClose(true)}
            disabled={closing}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Lock className="h-4 w-4" />
            Cerrar manifiesto
          </button>
        )}
      </div>

      {/* Scan form — only when open */}
      {isOpen && (
        <div className={cardClass}>
          <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">
            Escanear paquetes
          </h2>
          <form onSubmit={handleScan} className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[280px] flex-1">
              <ScanLine className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                ref={trackingRef}
                value={scanTracking}
                onChange={e => setScanTracking(e.target.value)}
                placeholder="Escanea o escribe el tracking..."
                className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 font-mono text-sm font-semibold uppercase text-slate-900 outline-none placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
                autoComplete="off"
              />
            </div>
            <div className="w-36">
              <select value={scanCarrier} onChange={e => setScanCarrier(e.target.value)} className={fieldClass}>
                <option value="">Carrier...</option>
                {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="w-28">
              <input
                type="number"
                step="0.01"
                min="0"
                value={scanWeight}
                onChange={e => setScanWeight(e.target.value)}
                placeholder="Peso lbs"
                className={fieldClass}
              />
            </div>
            <button
              type="submit"
              disabled={scanning || !scanTracking.trim()}
              className={primaryButtonClass}
            >
              {scanning ? '...' : 'Añadir'}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Presiona Enter después de escanear para añadir el paquete y el campo se limpia automáticamente.
          </p>
        </div>
      )}

      {/* Package list */}
      <div className={`${cardClass} p-0`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white">Paquetes en este manifiesto</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{packages.length} paquetes</p>
          </div>
        </div>

        {packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isOpen ? 'Escanea el primer paquete arriba.' : 'Este manifiesto no tiene paquetes.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 dark:bg-[#081120]">
                  {['Tracking', 'Carrier', 'Peso', 'FT³', 'Estado', 'WH#', 'Cliente', 'Acción'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packages.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-white">{p.tracking_number}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.carrier ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.weight_lbs ? `${p.weight_lbs} lbs` : '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.ft3 ? p.ft3.toFixed(3) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.status === 'Sin asignar'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">{p.warehouse_number ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{p.cliente_nombre ?? <span className="text-slate-400">Sin asignar</span>}</td>
                    <td className="px-4 py-3 text-right">
                      {p.status === 'Sin asignar' ? (
                        <button
                          type="button"
                          onClick={() => { setAssignPackageId(p.id); setSelectedClient(null); setClientSearch('') }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Asignar
                        </button>
                      ) : (
                        <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign modal */}
      {assignPackageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#0b1220]">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white">Asignar a cliente</h3>
              <button type="button" onClick={() => { setAssignPackageId(null); setSelectedClient(null); setClientSearch('') }}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            <p className="mb-4 rounded-xl bg-slate-50 px-4 py-2 font-mono text-sm font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {packages.find(p => p.id === assignPackageId)?.tracking_number}
            </p>

            {selectedClient ? (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div className="flex-1">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">{selectedClient.nombre}</p>
                  {selectedClient.codigo_cliente && <p className="text-xs text-emerald-600 dark:text-emerald-400">{selectedClient.codigo_cliente}</p>}
                </div>
                <button type="button" onClick={() => { setSelectedClient(null); setClientSearch('') }}>
                  <X className="h-4 w-4 text-emerald-600" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  autoFocus
                  placeholder="Buscar cliente por nombre..."
                  className={`${fieldClass} pl-9`}
                />
                {clientResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {clientResults.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setSelectedClient(c); setClientSearch(c.nombre) }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.nombre}</p>
                          {c.codigo_cliente && <p className="text-xs text-slate-500">{c.codigo_cliente}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Se generará un número WH (SPS-NNNNN) automáticamente al asignar.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setAssignPackageId(null); setSelectedClient(null); setClientSearch('') }}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!selectedClient || assigning}
                className={primaryButtonClass}
              >
                {assigning ? 'Asignando...' : 'Confirmar asignación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
