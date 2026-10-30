'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { FormField } from '@/src/components/ui/form-field'
import { NumberInput } from '@/src/components/ui/NumberInput'
import { fieldClass } from '@/src/lib/ui-classes'
import type { ContainerLine } from '@/src/lib/quotation-form'

type ContainerType = { id: string; name: string }

const emptyForm = { container_type_id: '', container_type_name: '', quantity: '1', notes: '' }

/** Contenedores / unidades de FCL y FTL (quotation_containers). */
export function ContainerLinesEditor({
  containerTypes,
  lines,
  setLines,
}: {
  containerTypes: ContainerType[]
  lines: ContainerLine[]
  setLines: Dispatch<SetStateAction<ContainerLine[]>>
}) {
  const [form, setForm] = useState(emptyForm)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{ index: number; line: ContainerLine } | null>(null)
  // Si las líneas se reemplazan desde fuera, una edición en curso deja de aplicar.
  const activeEditingIndex = editingIndex !== null && editingIndex < lines.length ? editingIndex : null

  const resetForm = () => {
    setForm(emptyForm)
    setEditingIndex(null)
  }

  const saveLine = () => {
    if (!form.container_type_id) {
      toast.error('Selecciona un tipo de contenedor')
      return
    }

    const line: ContainerLine = {
      container_type_id: form.container_type_id,
      // Un tipo retirado del catálogo conserva el nombre de la línea copiada.
      container_type_name:
        containerTypes.find((type) => type.id === form.container_type_id)?.name || form.container_type_name,
      quantity: Number(form.quantity || 1),
      notes: form.notes || null,
    }

    setLines((prev) =>
      activeEditingIndex !== null
        ? prev.map((item, index) => (index === activeEditingIndex ? line : item))
        : [...prev, line]
    )
    resetForm()
  }

  const editLine = (index: number) => {
    const line = lines[index]
    if (!line) return
    setForm({
      container_type_id: line.container_type_id,
      container_type_name: line.container_type_name,
      quantity: String(line.quantity || 1),
      notes: line.notes || '',
    })
    setEditingIndex(index)
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
    if (activeEditingIndex === index) resetForm()
  }

  return (
    <div data-field="containers" className="col-span-full space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_8rem_minmax(0,2fr)_auto] md:items-end">
        <FormField label="Tipo de contenedor / unidad" required>
          <select
            value={form.container_type_id}
            onChange={(e) =>
              setForm({
                ...form,
                container_type_id: e.target.value,
                container_type_name: containerTypes.find((type) => type.id === e.target.value)?.name || '',
              })
            }
            className={fieldClass}
          >
            <option value="">Seleccionar</option>
            {containerTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Cantidad" required>
          <NumberInput
            type="number"
            min="1"
            placeholder="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className={fieldClass}
          />
        </FormField>

        <FormField label="Notas">
          <input
            placeholder="Ej. Carga sobredimensionada"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={fieldClass}
          />
        </FormField>

        <button
          type="button"
          onClick={saveLine}
          className="h-12 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
        >
          {activeEditingIndex !== null ? 'Actualizar' : 'Agregar'}
        </button>
      </div>

      {lines.length > 0 && (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-950/60">
          {lines.map((line, index) => (
            <div
              key={`${line.container_type_id}-${index}`}
              className="flex items-center justify-between gap-4 p-3"
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {line.container_type_name}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Cantidad: {line.quantity}
                  {line.notes ? ` · ${line.notes}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => editLine(index)}
                  className="text-sm font-semibold text-blue-600 dark:text-blue-300"
                >
                  Modificar
                </button>

                <button
                  type="button"
                  onClick={() => setPendingRemoval({ index, line })}
                  className="text-sm font-semibold text-red-700 dark:text-red-300"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}
        title="Quitar contenedor"
        description={pendingRemoval
          ? `¿Deseas descartar ${pendingRemoval.line.quantity} × ${pendingRemoval.line.container_type_name} de esta cotización?`
          : undefined}
        confirmLabel="Quitar contenedor"
        danger
        onConfirm={() => {
          if (pendingRemoval) removeLine(pendingRemoval.index)
          setPendingRemoval(null)
        }}
      />
    </div>
  )
}
