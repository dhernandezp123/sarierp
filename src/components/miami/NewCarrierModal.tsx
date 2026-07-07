'use client'

import { useState } from 'react'
import { Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

// Modal para agregar un transportista al catálogo miami_carriers.
// onCreated recibe el nombre ya guardado (p. ej. para auto-seleccionarlo).
export function NewCarrierModal({
  open,
  onClose,
  carriers,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  carriers: string[]
  onCreated: (name: string) => void | Promise<void>
}) {
  const { user } = useUser()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const close = () => { setName(''); onClose() }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) { toast.error('Escribe el nombre del transportista'); return }
    if (carriers.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`${trimmed} ya existe en el catálogo`)
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('miami_carriers')
        .insert({ name: trimmed, created_by: user?.id ?? null })
      if (error) {
        if (error.code === '23505') throw new Error(`${trimmed} ya existe en el catálogo`)
        throw error
      }
      toast.success(`Transportista ${trimmed} agregado al catálogo`)
      setName('')
      onClose()
      await onCreated(trimmed)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear el transportista')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#0b1220]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Truck className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            Nuevo transportista
          </h3>
          <button type="button" onClick={close}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          ¿El transportista no está en la lista? Agrégalo al catálogo.
        </p>

        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Nombre del transportista <span className="text-red-500">*</span>
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
          autoFocus
          placeholder="Ej. Estafeta, GLS, Lasership Express..."
          className={fieldClass}
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Queda guardado en el catálogo y disponible en manifiestos e ingreso individual.
        </p>

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !name.trim()}
            className={primaryButtonClass}
          >
            {saving ? 'Guardando...' : 'Guardar transportista'}
          </button>
        </div>
      </div>
    </div>
  )
}
