'use client'

import { useId, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/src/components/ui/dialog'
import { fieldClass, labelClass } from '@/src/lib/ui'
import { primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { cn } from '@/src/lib/utils'

type AgentQuoteNotesProps = {
  notes?: string | null
  providerName: string
  canEdit: boolean
  onSave: (notes: string | null) => Promise<void>
}

export function AgentQuoteNotes({ notes, providerName, canEdit, onSave }: AgentQuoteNotesProps) {
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const hasNotes = Boolean(notes?.trim())

  const save = async () => {
    if (saving || !canEdit) return
    setSaving(true)
    try {
      await onSave(draft.trim() || null)
      toast.success('Notas de la tarifa guardadas')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron guardar las notas')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-sm space-y-2 text-left text-sm font-normal">
      {hasNotes ? (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-slate-700 dark:text-slate-200">
          {notes}
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Sin notas internas</p>
      )}
      {canEdit && (
        <Dialog open={open} onOpenChange={(nextOpen) => {
          if (saving) return
          if (nextOpen) setDraft(notes || '')
          setOpen(nextOpen)
        }}>
          <DialogTrigger asChild>
            <button
              type="button"
              data-agent-notes-action
              aria-label={`${hasNotes ? 'Editar' : 'Agregar'} notas de ${providerName}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-950"
            >
              {hasNotes ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {hasNotes ? 'Editar notas' : 'Agregar notas'}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
            <DialogHeader>
              <DialogTitle>Notas internas de la tarifa</DialogTitle>
              <DialogDescription>
                {providerName}. Explica la elección o agrega comentarios para el equipo.
                Estas notas no aparecen en el PDF comercial.
              </DialogDescription>
            </DialogHeader>
            <div>
              <label htmlFor={inputId} className={labelClass}>Notas de esta opción (opcional)</label>
              <textarea
                id={inputId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={saving}
                rows={5}
                placeholder="Ej.: Se eligió por salida directa y mayor cantidad de días libres."
                className={cn(fieldClass, 'mt-1 h-auto min-h-32 w-full resize-y py-3')}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setOpen(false)} className={secondaryButtonClass}>
                Cancelar
              </button>
              <button type="button" disabled={saving || !canEdit} onClick={save} className={primaryButtonClass}>
                {saving ? 'Guardando...' : 'Guardar notas'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
