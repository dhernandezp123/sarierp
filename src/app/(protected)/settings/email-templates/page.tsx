'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Mail, Plus, RotateCcw, Save } from 'lucide-react'

import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import {
  UnsavedChangesGuard,
  markFormSaved,
} from '@/src/components/ui/UnsavedChangesGuard'
import {
  DEFAULT_EMAIL_TEMPLATES,
  getTemplateVariables,
  renderEmailTemplate,
} from '@/src/lib/email-templates'

type TemplateRow = {
  id: string
  template_key: string
  nombre: string
  descripcion: string | null
  asunto: string
  cuerpo: string
  is_active: boolean
  updated_at: string | null
}

// Datos ficticios para la vista previa del editor.
const PREVIEW_VARS: Record<string, Record<string, string>> = {
  cotizacion_cliente: {
    cliente: 'Inversiones Ejemplo S. de R.L.',
    numero_cotizacion: 'COT-2026-0148',
    servicio: 'Marítimo FCL',
    incoterm: 'FOB',
    origen: 'Shanghai, China',
    destino: 'Puerto Cortés, Honduras',
    commodity: 'Muebles de oficina',
    contenedores: '2 x 40HC',
    titulo_tarifa: 'TARIFA SELECCIONADA',
    etiqueta_carrier: 'Carrier',
    carrier: 'MSC',
    transito: '32 días',
    etd: '15/08/2026',
    dias_libres: '14 días',
    tarifa_comercial: 'USD 5,865.00',
    valida_hasta: '31/08/2026',
    cierre: 'Saludos cordiales,\nSari Express — Equipo Comercial',
  },
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return date.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function EmailTemplatesPage() {
  const { profile } = useUser()
  const isAdmin = profile?.rol === 'Admin'

  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [selectedKey, setSelectedKey] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [form, setForm] = useState({ nombre: '', asunto: '', cuerpo: '' })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async (keyToSelect?: string) => {
    const { data, error } = await supabase
      .from('email_templates')
      .select('id, template_key, nombre, descripcion, asunto, cuerpo, is_active, updated_at')
      .order('nombre', { ascending: true })

    if (error) {
      toast.error('Error al cargar plantillas: ' + error.message)
      setLoading(false)
      return
    }

    const rows = (data || []) as TemplateRow[]
    setTemplates(rows)

    const nextKey = keyToSelect || selectedKey
    const nextSelected =
      rows.find((row) => row.template_key === nextKey) || rows[0]

    if (nextSelected) {
      setSelectedKey(nextSelected.template_key)
      setForm({
        nombre: nextSelected.nombre,
        asunto: nextSelected.asunto,
        cuerpo: nextSelected.cuerpo,
      })
    }

    setLoading(false)
  }

  const selected = templates.find((t) => t.template_key === selectedKey)
  const variables = getTemplateVariables(selectedKey)
  const previewVars = PREVIEW_VARS[selectedKey] || PREVIEW_VARS.cotizacion_cliente

  const preview = useMemo(
    () => ({
      asunto: renderEmailTemplate(form.asunto, previewVars),
      cuerpo: renderEmailTemplate(form.cuerpo, previewVars),
    }),
    [form.asunto, form.cuerpo, previewVars]
  )

  const selectTemplate = (key: string) => {
    const template = templates.find((t) => t.template_key === key)
    if (!template) return
    setSelectedKey(key)
    setForm({
      nombre: template.nombre,
      asunto: template.asunto,
      cuerpo: template.cuerpo,
    })
  }

  const handleSave = async () => {
    if (!selected) return

    if (!form.asunto.trim() || !form.cuerpo.trim()) {
      toast.error('El asunto y el cuerpo no pueden quedar vacíos')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('email_templates')
      .update({
        nombre: form.nombre.trim() || selected.nombre,
        asunto: form.asunto,
        cuerpo: form.cuerpo,
        updated_by: profile?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id)
    setSaving(false)

    if (error) {
      toast.error('Error al guardar: ' + error.message)
      return
    }

    toast.success('Plantilla guardada')
    markFormSaved()
    fetchTemplates()
  }

  const handleRestore = () => {
    const original = DEFAULT_EMAIL_TEMPLATES[selectedKey]
    if (!original) return
    setForm({
      nombre: original.nombre,
      asunto: original.asunto,
      cuerpo: original.cuerpo,
    })
    toast.info('Plantilla original restaurada. Guarda para aplicar los cambios.')
  }

  const handleCreateTemplate = async () => {
    setCreatingTemplate(true)

    const templateKey = `personalizada_${Date.now().toString(36)}`
    const { error } = await supabase.from('email_templates').insert({
      template_key: templateKey,
      nombre: 'Nueva plantilla',
      descripcion:
        'Plantilla personalizada. Disponible en el modal de correo del detalle de la cotización.',
      asunto: 'Cotización {{numero_cotizacion}} - Sari Express',
      cuerpo: 'Buen día {{cliente}},\n\n\n\n{{cierre}}',
    })

    setCreatingTemplate(false)

    if (error) {
      toast.error('Error al crear la plantilla: ' + error.message)
      return
    }

    toast.success('Plantilla creada. Edita el nombre, asunto y cuerpo.')
    fetchTemplates(templateKey)
  }

  if (loading) return <PageSkeleton cards={1} rows={5} />

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard active={isAdmin} />

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
          Configuración
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
          Plantillas de Correo
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Edita el asunto y el cuerpo de los correos que genera el sistema.
          Usa variables como {'{{cliente}}'} y el sistema las reemplaza con los
          datos reales; las líneas cuyas variables queden vacías se omiten.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className={cardClass}>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No hay plantillas registradas. Ejecuta la migración
            <span className="mx-1 font-mono text-xs">20260706200000_email_templates.sql</span>
            para crear la plantilla de cotización.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* Lista de plantillas */}
          <div className={`${cardClass} self-start`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Plantillas
              </h2>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleCreateTemplate}
                  disabled={creatingTemplate}
                  title="Crear plantilla nueva"
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva
                </button>
              )}
            </div>
            <div className="space-y-1">
              {templates.map((template) => (
                <button
                  key={template.template_key}
                  type="button"
                  onClick={() => selectTemplate(template.template_key)}
                  className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    template.template_key === selectedKey
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <Mail className="mt-0.5 h-4 w-4 flex-none opacity-60" />
                  <span>
                    <span className="block font-medium">{template.nombre}</span>
                    {formatUpdatedAt(template.updated_at) && (
                      <span className="block text-xs opacity-60">
                        Actualizada {formatUpdatedAt(template.updated_at)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Editor y vista previa */}
          {selected && (
            <div className="space-y-6">
              <div className={cardClass}>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      {selected.nombre}
                    </h2>
                    {selected.descripcion && (
                      <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        {selected.descripcion}
                      </p>
                    )}
                  </div>
                  {!isAdmin && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      Solo lectura
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Nombre de la plantilla
                    </label>
                    <input
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      disabled={!isAdmin}
                      className={fieldClass}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Asunto
                    </label>
                    <input
                      value={form.asunto}
                      onChange={(e) => setForm({ ...form, asunto: e.target.value })}
                      disabled={!isAdmin}
                      className={`${fieldClass} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Cuerpo del correo
                    </label>
                    <textarea
                      value={form.cuerpo}
                      onChange={(e) => setForm({ ...form, cuerpo: e.target.value })}
                      disabled={!isAdmin}
                      rows={18}
                      className={`${fieldClass} resize-y font-mono text-xs leading-relaxed`}
                    />
                  </div>

                  {variables.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/30">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Variables disponibles
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {variables.map((variable) => (
                          <span
                            key={variable.name}
                            title={variable.description}
                            className="cursor-help rounded-lg bg-white px-2 py-1 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
                          >
                            {'{{' + variable.name + '}}'}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                        Pasa el cursor sobre una variable para ver qué contiene.
                      </p>
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={primaryButtonClass}
                      >
                        <Save className="mr-2 inline h-4 w-4" />
                        {saving ? 'Guardando...' : 'Guardar plantilla'}
                      </button>
                      {DEFAULT_EMAIL_TEMPLATES[selectedKey] && (
                        <button
                          type="button"
                          onClick={handleRestore}
                          className={secondaryButtonClass}
                        >
                          <RotateCcw className="mr-2 inline h-4 w-4" />
                          Restaurar original
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className={cardClass}>
                <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">
                  Vista previa
                </h2>
                <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                  Con datos de ejemplo. Así se verá el correo generado.
                </p>

                <div className="mb-3 rounded-xl bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
                  <p className="font-medium text-blue-800 dark:text-blue-300">
                    Asunto: <span className="font-normal">{preview.asunto}</span>
                  </p>
                </div>

                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  {preview.cuerpo}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
