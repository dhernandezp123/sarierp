'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ScanLine, X, Search, CheckCircle2, Lock, Package, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { useMiamiCarriers } from '@/src/hooks/useMiamiCarriers'
import { notifyClientPackageAssigned } from '@/src/lib/client-notifications'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { NewCarrierModal } from '@/src/components/miami/NewCarrierModal'

type Manifest = {
  id: string
  manifest_number: string
  status: 'Abierto' | 'Cerrado'
  carrier: string | null
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
  const { user, profile } = useUser()
  const trackingRef = useRef<HTMLInputElement>(null)

  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [scanTracking, setScanTracking] = useState('')
  const [scanWeight, setScanWeight] = useState('')
  const [updatingCarrier, setUpdatingCarrier] = useState(false)
  const [scanWeightUnit, setScanWeightUnit] = useState<'lbs' | 'kg'>('lbs')
  const [scanning, setScanning] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [deletePackage, setDeletePackage] = useState<PackageRow | null>(null)
  const { carriers, reload: reloadCarriers } = useMiamiCarriers()
  const [carrierModalOpen, setCarrierModalOpen] = useState(false)
  const [deleteManifestOpen, setDeleteManifestOpen] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [deletingManifest, setDeletingManifest] = useState(false)

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
    const tracking = scanTracking.trim().toUpperCase()
    if (!tracking) return

    if (!manifest?.carrier) {
      toast.error('Selecciona el transportista del manifiesto antes de escanear')
      return
    }

    if (packages.some(p => p.tracking_number.toUpperCase() === tracking)) {
      toast.warning(`${tracking} ya está en este manifiesto — escaneo duplicado`)
      setScanTracking('')
      trackingRef.current?.focus()
      return
    }

    setScanning(true)
    try {
      const weightInput = parseFloat(scanWeight) || null
      const weight_lbs = weightInput === null ? null :
        scanWeightUnit === 'lbs' ? weightInput : parseFloat((weightInput * 2.20462).toFixed(2))
      const weight_kg = weightInput === null ? null :
        scanWeightUnit === 'kg' ? weightInput : parseFloat((weightInput * 0.453592).toFixed(2))

      const { error } = await supabase.rpc('scan_miami_manifest_package', {
        p_manifest_id: id,
        p_tracking: tracking,
        p_weight_lbs: weight_lbs,
        p_weight_kg: weight_kg,
      })
      if (error) throw error
      toast.success(`${tracking} añadido al manifiesto`)
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

  const handleDelete = async () => {
    if (!deletePackage) return
    try {
      const { data, error } = await supabase.rpc('delete_miami_manifest_package', {
        p_package_id: deletePackage.id,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      toast.success(`${row?.tracking_number ?? deletePackage.tracking_number} eliminado del manifiesto`)
      await loadData()
    } catch (err: any) {
      toast.error(err.message ?? 'Error al eliminar el paquete')
    } finally {
      setDeletePackage(null)
    }
  }

  const handleSetManifestCarrier = async (newCarrier: string) => {
    if (!manifest || !newCarrier || newCarrier === manifest.carrier) return
    setUpdatingCarrier(true)
    try {
      const { data, error } = await supabase.rpc('update_miami_manifest_carrier', {
        p_manifest_id: id,
        p_carrier: newCarrier,
      })
      if (error) throw error

      setManifest(prev => prev ? { ...prev, carrier: newCarrier } : prev)
      const row = Array.isArray(data) ? data[0] : data
      const updated = row?.updated_packages ?? 0
      toast.success(`Transportista del manifiesto: ${newCarrier}${updated ? ` · ${updated} paquete(s) alineado(s)` : ''}`)
      await loadData()
      trackingRef.current?.focus()
    } catch (err: any) {
      toast.error(err.message ?? 'Error al actualizar el transportista')
    } finally {
      setUpdatingCarrier(false)
    }
  }

  const handleCarrierCreated = async (name: string) => {
    await reloadCarriers()
    if (manifest?.status === 'Abierto') await handleSetManifestCarrier(name)
  }

  const handleDeleteManifest = async () => {
    if (!deleteReason.trim()) {
      toast.error('Indica el motivo de la eliminación')
      return
    }
    setDeletingManifest(true)
    try {
      const { data, error } = await supabase.rpc('delete_miami_manifest', {
        p_manifest_id: id,
        p_reason: deleteReason.trim(),
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      toast.success(`Manifiesto ${row?.manifest_number ?? ''} eliminado; queda registro en auditoría`)
      router.push('/miami/manifiestos')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al eliminar el manifiesto')
      setDeletingManifest(false)
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
  const isAdmin = profile?.rol === 'Admin'

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

      <ConfirmDialog
        open={!!deletePackage}
        onOpenChange={(open) => { if (!open) setDeletePackage(null) }}
        title="Eliminar paquete del manifiesto"
        description={`Se eliminará el tracking ${deletePackage?.tracking_number ?? ''} de forma permanente. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar paquete"
        danger
        onConfirm={handleDelete}
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
            {manifest.carrier && `${manifest.carrier} · `}
            {manifest.total_packages} paquetes · Creado {new Date(manifest.created_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' })}
            {manifest.closed_at && ` · Cerrado ${new Date(manifest.closed_at).toLocaleDateString('es-HN', { day: '2-digit', month: 'short' })}`}
          </p>
          {manifest.notes && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 italic">{manifest.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isOpen && (
            <>
              <button
                type="button"
                onClick={() => setCarrierModalOpen(true)}
                className={`${secondaryButtonClass} inline-flex items-center gap-2`}
              >
                <Truck className="h-4 w-4" />
                Nuevo transportista
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(true)}
                disabled={closing}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <Lock className="h-4 w-4" />
                Cerrar manifiesto
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setDeleteManifestOpen(true); setDeleteReason('') }}
              title="Eliminar manifiesto (solo Admin, queda registro)"
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar manifiesto
            </button>
          )}
        </div>
      </div>

      {/* Scan form — only when open */}
      {isOpen && (
        <div className={cardClass}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Escanear paquetes
            </h2>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-400" />
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Transportista del manifiesto
              </label>
              <select
                value={manifest.carrier ?? ''}
                onChange={e => {
                  if (e.target.value === 'Otro') { setCarrierModalOpen(true); return }
                  handleSetManifestCarrier(e.target.value)
                }}
                disabled={updatingCarrier}
                className={`${fieldClass} w-auto ${!manifest.carrier ? 'border-amber-400 dark:border-amber-600' : ''}`}
              >
                <option value="" disabled>Seleccionar...</option>
                {carriers.map(c => (
                  <option key={c} value={c}>{c === 'Otro' ? 'Otro (agregar nuevo...)' : c}</option>
                ))}
              </select>
            </div>
          </div>
          {!manifest.carrier && (
            <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              Selecciona el transportista del lote para empezar a escanear — todos los paquetes de este manifiesto lo heredan.
            </p>
          )}
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
            <div className="w-28">
              <input
                type="number"
                step="0.01"
                min="0"
                value={scanWeight}
                onChange={e => setScanWeight(e.target.value)}
                placeholder="Peso"
                className={fieldClass}
              />
            </div>
            <div className="w-20">
              <select
                value={scanWeightUnit}
                onChange={e => setScanWeightUnit(e.target.value as 'lbs' | 'kg')}
                className={fieldClass}
              >
                <option value="lbs">lbs</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={scanning || !scanTracking.trim() || !manifest.carrier}
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
                      <div className="flex items-center justify-end gap-1.5">
                        {p.status === 'Sin asignar' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => { setAssignPackageId(p.id); setSelectedClient(null); setClientSearch('') }}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Asignar
                            </button>
                            {isOpen && (
                              <button
                                type="button"
                                onClick={() => setDeletePackage(p)}
                                title="Eliminar paquete del manifiesto"
                                className="rounded-lg border border-red-200 p-1.5 text-red-600 transition hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewCarrierModal
        open={carrierModalOpen}
        onClose={() => setCarrierModalOpen(false)}
        carriers={carriers}
        onCreated={handleCarrierCreated}
      />

      {/* Delete manifest modal (Admin) */}
      {deleteManifestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#0b1220]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600 dark:text-red-400">
                  Eliminar manifiesto
                </p>
                <h2 className="mt-1 font-mono text-base font-semibold text-slate-900 dark:text-white">
                  {manifest.manifest_number}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Se eliminarán el manifiesto y sus {packages.length} paquete(s) escaneados.
                  Solo es posible si ninguno fue asignado a cliente. Queda registro permanente en auditoría.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setDeleteManifestOpen(false); setDeleteReason('') }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Motivo de la eliminación <span className="text-red-500">*</span>
            </label>
            <textarea
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              rows={3}
              autoFocus
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-red-400 dark:focus:ring-red-950"
              placeholder="Ej. Manifiesto de prueba, lote duplicado por error..."
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setDeleteManifestOpen(false); setDeleteReason('') }}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteManifest}
                disabled={deletingManifest || !deleteReason.trim()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingManifest ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

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
