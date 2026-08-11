'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ImagePlus, LifeBuoy, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import {
  formatAttachmentSize,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
} from '@/src/lib/support'
import {
  getSupportAttachmentValidationError,
  uploadSupportAttachments,
} from '@/src/lib/support-attachments'
import type { SupportTicketCategory, SupportTicketPriority } from '@/src/types'

export default function NewSupportTicketPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SupportTicketCategory>('Consulta')
  const [priority, setPriority] = useState<SupportTicketPriority>('Normal')
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)

  const handleFiles = (selected: FileList | null) => {
    const nextFiles = Array.from(selected ?? [])
    const validationError = getSupportAttachmentValidationError(nextFiles)

    if (validationError) {
      toast.error(validationError)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setFiles(nextFiles)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    const cleanSubject = subject.trim()
    const cleanDescription = description.trim()
    if (cleanSubject.length < 5) {
      toast.error('El asunto debe contener al menos 5 caracteres')
      return
    }
    if (cleanDescription.length < 10) {
      toast.error('Describe el caso con al menos 10 caracteres')
      return
    }
    const attachmentValidationError = getSupportAttachmentValidationError(files)
    if (attachmentValidationError) {
      toast.error(attachmentValidationError)
      return
    }

    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        toast.error('Tu sesión ha vencido. Vuelve a iniciar sesión.')
        return
      }

      const sourcePath = (() => {
        try {
          if (!document.referrer) return '/support/new'
          const referrer = new URL(document.referrer)
          return referrer.origin === window.location.origin
            ? `${referrer.pathname}${referrer.search}`
            : '/support/new'
        } catch {
          return '/support/new'
        }
      })()

      const { data, error } = await supabase.rpc('create_support_ticket', {
        p_subject: cleanSubject,
        p_description: cleanDescription,
        p_category: category,
        p_priority: priority,
        p_source_path: sourcePath,
        p_source_module: 'Mesa de ayuda',
        p_browser_info: navigator.userAgent.slice(0, 500),
      })

      if (error || !data) {
        toast.error(error?.message || 'No se pudo crear el ticket')
        return
      }

      const ticketId = data as string
      let failedAttachmentCount = 0

      if (files.length > 0) {
        const { data: initialMessage, error: messageError } = await supabase
          .from('support_ticket_messages')
          .select('id')
          .eq('ticket_id', ticketId)
          .eq('author_id', user.id)
          .eq('is_internal', false)
          .order('created_at', { ascending: true })
          .limit(1)
          .single()

        if (messageError || !initialMessage) {
          failedAttachmentCount = files.length
        } else {
          const uploadResult = await uploadSupportAttachments({
            ticketId,
            messageId: initialMessage.id,
            userId: user.id,
            files,
          })
          failedAttachmentCount = uploadResult.failedFileNames.length
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.access_token) {
        void fetch('/api/support/notify', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ticketId, eventType: 'ticket_created' }),
        }).catch(() => undefined)
      }

      if (failedAttachmentCount > 0) {
        toast.warning(
          `Ticket creado, pero ${failedAttachmentCount === 1 ? 'un archivo no pudo' : `${failedAttachmentCount} archivos no pudieron`} adjuntarse`
        )
      } else {
        toast.success('Ticket creado correctamente')
      }
      router.push(`/support/${ticketId}`)
    } catch {
      toast.error('No se pudo completar la creación del ticket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la mesa de ayuda
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Nuevo ticket</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Incluye los pasos realizados, el resultado esperado y lo que ocurrió.
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]"
      >
        <div>
          <label htmlFor="support-subject" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Asunto
          </label>
          <input
            id="support-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={160}
            required
            placeholder="Ej. No puedo convertir una cotización aprobada"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <p className="mt-1 text-right text-xs text-slate-400">{subject.length}/160</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="support-category" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Categoría
            </label>
            <select
              id="support-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {SUPPORT_TICKET_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="support-priority" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Prioridad
            </label>
            <select
              id="support-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as SupportTicketPriority)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {SUPPORT_TICKET_PRIORITIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </div>

        {priority === 'Crítica' && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            Utiliza prioridad crítica únicamente cuando el sistema o un proceso principal esté detenido.
          </div>
        )}

        <div>
          <label htmlFor="support-description" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Descripción
          </label>
          <textarea
            id="support-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={10000}
            required
            rows={9}
            placeholder="Describe qué estabas haciendo, qué esperabas que ocurriera y qué mensaje mostró el sistema..."
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <p className="mt-1 text-right text-xs text-slate-400">{description.length}/10000</p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Capturas o archivos <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={(event) => handleFiles(event.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition hover:border-blue-400 hover:bg-blue-50/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-blue-600 dark:hover:bg-blue-950/20"
          >
            <ImagePlus className="h-6 w-6 text-blue-600" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Seleccionar capturas de pantalla
            </span>
            <span className="text-xs text-slate-400">
              PNG, JPG o PDF · máximo 10 MB · hasta 5 archivos
            </span>
          </button>

          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.lastModified}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900"
                >
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
                    {file.name} · {formatAttachmentSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                    disabled={saving}
                    aria-label={`Quitar ${file.name}`}
                    className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end dark:border-slate-800">
          <Link
            href="/support"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {saving ? 'Creando ticket...' : 'Crear ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}
