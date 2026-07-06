'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ClipboardCopy, Settings2 } from 'lucide-react'

import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import {
  fetchActiveEmailTemplates,
  renderEmailTemplateSkeleton,
  type EmailTemplate,
} from '@/src/lib/email-templates'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'

export default function EmailTemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { profile } = useUser()
  const isAdmin = profile?.rol === 'Admin'

  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || templates.length > 0) return

    const load = async () => {
      setLoading(true)
      const rows = await fetchActiveEmailTemplates(supabase)
      setTemplates(rows)
      if (rows.length > 0) setSelectedKey(rows[0].template_key)
      setLoading(false)
    }

    load()
  }, [open, templates.length])

  const selected =
    templates.find((t) => t.template_key === selectedKey) || templates[0]

  const asunto = selected ? renderEmailTemplateSkeleton(selected.asunto) : ''
  const cuerpo = selected ? renderEmailTemplateSkeleton(selected.cuerpo) : ''

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado al portapapeles`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plantillas de Correo</DialogTitle>
          <DialogDescription>
            Copia una plantilla y reemplaza los campos entre corchetes, como
            [CLIENTE]. Desde el detalle de una cotización, el botón de correo
            los llena automáticamente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-9 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No hay plantillas activas.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template.template_key}
                  type="button"
                  onClick={() => setSelectedKey(template.template_key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    template.template_key === selected?.template_key
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {template.nombre}
                </button>
              ))}
            </div>

            <div className="rounded-xl bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
              <p className="font-medium text-blue-800 dark:text-blue-300">
                Asunto: <span className="font-normal">{asunto}</span>
              </p>
            </div>

            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {cuerpo}
            </pre>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => copy(cuerpo, 'Mensaje')}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <ClipboardCopy className="h-4 w-4" />
                Copiar mensaje
              </button>
              <button
                type="button"
                onClick={() => copy(asunto, 'Asunto')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Copiar asunto
              </button>

              {isAdmin && (
                <Link
                  href="/settings/email-templates"
                  onClick={() => onOpenChange(false)}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Administrar plantillas
                </Link>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
