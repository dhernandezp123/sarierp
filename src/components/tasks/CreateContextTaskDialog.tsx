'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import type {
  UserTaskEntityType,
  UserTaskModule,
  UserTaskPriority,
} from '@/src/lib/user-tasks'
import { userTaskSourceHref } from '@/src/lib/user-tasks'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/src/components/ui/dialog'

type TaskContext = {
  entityType: UserTaskEntityType
  entityId: string
  entityLabel: string
  sourceModule: UserTaskModule
  sourcePath: string
}

export function CreateContextTaskDialog({
  context,
  suggestedTitle = '',
  suggestedDueDate = '',
  label = 'Crear tarea',
}: {
  context: TaskContext
  suggestedTitle?: string
  suggestedDueDate?: string
  label?: string
}) {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(suggestedTitle)
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState<UserTaskPriority>('Media')
  const [dueDate, setDueDate] = useState(suggestedDueDate)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!user || !title.trim()) return
    const sourcePath = userTaskSourceHref({
      entity_type: context.entityType,
      source_path: context.sourcePath,
    })
    if (!sourcePath) {
      toast.error('El enlace de contexto no es válido')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('user_tasks').insert({
      user_id: user.id,
      title: title.trim(),
      notes: notes.trim() || null,
      priority,
      due_date: dueDate || null,
      entity_type: context.entityType,
      entity_id: context.entityId,
      entity_label: context.entityLabel,
      source_module: context.sourceModule,
      source_path: sourcePath,
    })
    setSaving(false)

    if (error) {
      toast.error('No se pudo crear la tarea')
      return
    }

    toast.success('Tarea creada en Mis tareas')
    setNotes('')
    setPriority('Media')
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setTitle(suggestedTitle)
          setDueDate(suggestedDueDate)
        }
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className={secondaryButtonClass}>
          <CalendarPlus className="h-4 w-4" />
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear recordatorio</DialogTitle>
          <DialogDescription>
            Tarea personal vinculada a {context.entityLabel}. No reemplaza el estado ni la siguiente acción derivada del expediente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Título
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={180}
              className={fieldClass}
              autoFocus
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
            Notas opcionales
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={2000}
              className={`${fieldClass} resize-y`}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Prioridad
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as UserTaskPriority)}
                className={fieldClass}
              >
                <option value="Baja">Baja</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-200">
              Vencimiento
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className={fieldClass}
              />
            </label>
          </div>
        </div>

        <DialogFooter>
          <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !title.trim()}
            className={primaryButtonClass}
          >
            {saving ? 'Guardando...' : 'Crear tarea'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
