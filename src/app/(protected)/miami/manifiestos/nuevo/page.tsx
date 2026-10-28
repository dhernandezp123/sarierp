'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { useMiamiCarriers } from '@/src/hooks/useMiamiCarriers'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { Breadcrumbs } from '@/src/components/ui/Breadcrumbs'
import { NewCarrierModal } from '@/src/components/miami/NewCarrierModal'

export default function NuevoManifiestoPage() {
  const router = useRouter()
  const { user } = useUser()
  const { carriers, reload: reloadCarriers } = useMiamiCarriers()
  const [carrier, setCarrier] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [carrierModalOpen, setCarrierModalOpen] = useState(false)

  const handleCreate = async () => {
    if (!carrier) { toast.error('Selecciona el transportista del lote'); return }
    setSaving(true)
    try {
      const { data: manifestNumber } = await supabase.rpc('next_manifest_number')

      const { data, error } = await supabase
        .from('miami_manifests')
        .insert({
          manifest_number: manifestNumber,
          status: 'Abierto',
          carrier,
          notes: notes || null,
          received_by: user?.id ?? null,
        })
        .select('id')
        .single()

      if (error) throw error

      toast.success(`Manifiesto ${manifestNumber} creado`)
      router.push(`/miami/manifiestos/${data.id}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear el manifiesto')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[
        { label: 'Miami Bodega', href: '/miami' },
        { label: 'Manifiestos', href: '/miami/manifiestos' },
        { label: 'Nuevo' },
      ]} />

      <div>
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Nuevo Manifiesto</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          El número de manifiesto se genera automáticamente con la fecha de hoy.
          Después de crearlo podrás escanear los paquetes del lote.
        </p>
      </div>

      <div className={cardClass}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Transportista del lote <span className="text-red-500">*</span>
            </label>
            <select
              value={carrier}
              onChange={e => {
                if (e.target.value === 'Otro') { setCarrierModalOpen(true); return }
                setCarrier(e.target.value)
              }}
              className={fieldClass}
            >
              <option value="">Seleccionar transportista...</option>
              {carriers.map(c => (
                <option key={c} value={c}>{c === 'Otro' ? 'Otro (agregar nuevo...)' : c}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              Un manifiesto corresponde a un solo transportista; todos los paquetes escaneados lo heredan.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Notas del lote (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Ej: Recepción de UPS del 18/06, 3 cajas grandes..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950"
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
            El manifiesto se abrirá en modo de escaneo. Puedes añadir todos los paquetes del lote
            y cerrar el manifiesto cuando termines. La asignación a clientes se hace después.
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.push('/miami/manifiestos')} className={secondaryButtonClass}>
          Cancelar
        </button>
        <button type="button" onClick={handleCreate} disabled={saving || !carrier} className={primaryButtonClass}>
          {saving ? 'Creando...' : 'Crear y escanear paquetes'}
        </button>
      </div>

      <NewCarrierModal
        open={carrierModalOpen}
        onClose={() => setCarrierModalOpen(false)}
        carriers={carriers}
        onCreated={async (name) => {
          await reloadCarriers()
          setCarrier(name)
        }}
      />
    </div>
  )
}
