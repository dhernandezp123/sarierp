'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, AlertTriangle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

type PackageOption = {
  id: string
  tracking_number: string
  warehouse_number: string | null
  carrier: string | null
  status: string
}

const TIPOS = [
  'Dañado',
  'Incompleto',
  'No reconozco este paquete',
  'Pérdida',
  'Otro',
]

export default function NuevaIncidenciaPage() {
  const { profile } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedId = searchParams.get('packageId')

  const [packages, setPackages] = useState<PackageOption[]>([])
  const [pkgSearch, setPkgSearch] = useState('')
  const [selectedPkg, setSelectedPkg] = useState<PackageOption | null>(null)
  const [showPkgList, setShowPkgList] = useState(false)
  const [tipo, setTipo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.cliente_id) return
    loadPackages()
  }, [profile?.cliente_id])

  const loadPackages = async () => {
    const { data } = await supabase
      .from('miami_packages')
      .select('id, tracking_number, warehouse_number, carrier, status')
      .eq('cliente_id', profile.cliente_id)
      .neq('status', 'Entregado')
      .order('received_at', { ascending: false })

    const pkgs = (data ?? []) as PackageOption[]
    setPackages(pkgs)

    if (preselectedId) {
      const found = pkgs.find(p => p.id === preselectedId)
      if (found) setSelectedPkg(found)
    }
    setLoading(false)
  }

  const filteredPkgs = pkgSearch.trim()
    ? packages.filter(p =>
        p.tracking_number.toLowerCase().includes(pkgSearch.toLowerCase()) ||
        (p.warehouse_number ?? '').toLowerCase().includes(pkgSearch.toLowerCase())
      )
    : packages

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPkg) { toast.error('Selecciona un paquete'); return }
    if (!tipo)         { toast.error('Selecciona el tipo de problema'); return }
    if (!descripcion.trim()) { toast.error('Describe el problema'); return }

    setSaving(true)
    try {
      const { error } = await supabase.from('miami_incidencias').insert({
        package_id:  selectedPkg.id,
        cliente_id:  profile.cliente_id,
        tipo,
        descripcion: descripcion.trim(),
        status:      'Abierta',
      })

      if (error) throw error

      // Update package status
      await supabase
        .from('miami_packages')
        .update({ status: 'Con incidencia' })
        .eq('id', selectedPkg.id)

      toast.success('Incidencia reportada. Te contactaremos pronto.')
      router.replace('/portal/incidencias')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al reportar')
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Reportar Problema</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Cuéntanos qué pasó con tu paquete</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Package selector */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-white">
            ¿Con cuál paquete tienes el problema? <span className="text-red-500">*</span>
          </label>

          {selectedPkg ? (
            <div className="flex items-start justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{selectedPkg.tracking_number}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedPkg.carrier ?? 'Sin carrier'}
                  {selectedPkg.warehouse_number && <span> · WH: {selectedPkg.warehouse_number}</span>}
                </p>
              </div>
              <button type="button" onClick={() => { setSelectedPkg(null); setPkgSearch('') }} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={pkgSearch}
                onChange={e => { setPkgSearch(e.target.value); setShowPkgList(true) }}
                onFocus={() => setShowPkgList(true)}
                placeholder="Buscar por tracking o WH#..."
                className={`${fieldClass} pl-9`}
                autoFocus={!preselectedId}
              />
              {showPkgList && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {loading ? (
                    <div className="p-3 text-xs text-slate-400">Cargando...</div>
                  ) : filteredPkgs.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400">Sin paquetes disponibles</div>
                  ) : (
                    filteredPkgs.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPkg(p); setShowPkgList(false); setPkgSearch('') }}
                        className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">{p.tracking_number}</p>
                        <p className="text-xs text-slate-400">
                          {p.carrier ?? 'Sin carrier'}
                          {p.warehouse_number && ` · WH: ${p.warehouse_number}`}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tipo de problema */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-white">
            ¿Qué tipo de problema es? <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIPOS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${
                  tipo === t
                    ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60'
                }`}
              >
                <AlertTriangle className={`h-4 w-4 shrink-0 ${tipo === t ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="mb-3 block text-sm font-semibold text-slate-900 dark:text-white">
            Describe el problema con detalle <span className="text-red-500">*</span>
          </label>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={4}
            placeholder="Ej: El paquete llegó con el exterior golpeado, la caja estaba abierta y faltaban 2 artículos..."
            required
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950"
          />
          <p className="mt-2 text-xs text-slate-400">Mientras más detalles des, más rápido podemos ayudarte.</p>
        </div>

        {/* Note about photos */}
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-5 py-4 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Si tienes fotos del problema, puedes enviarlas directamente a tu agente de carga por WhatsApp o correo electrónico junto con el número de tracking.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !selectedPkg || !tipo || !descripcion.trim()}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Enviando...' : 'Reportar problema'}
          </button>
        </div>
      </form>
    </div>
  )
}
