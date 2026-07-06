import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailTemplate = {
  template_key: string
  nombre: string
  descripcion?: string | null
  asunto: string
  cuerpo: string
}

// Respaldo si la plantilla no existe o está inactiva en la base: mismo
// contenido que la semilla de la migración 20260706200000_email_templates.
export const DEFAULT_EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  cotizacion_cliente: {
    template_key: 'cotizacion_cliente',
    nombre: 'Cotización al cliente',
    asunto: 'Cotización {{numero_cotizacion}} - Sari Express',
    cuerpo: [
      'Buen día {{cliente}},',
      '',
      'Espero que se encuentre bien.',
      'En adjunto encontrarán nuestra cotización para el movimiento de su carga con origen {{origen}} y destino {{destino}}.',
      '',
      'Cotización #: {{numero_cotizacion}}',
      'Servicio: {{servicio}}',
      'Incoterm: {{incoterm}}',
      'Origen: {{origen}}',
      'Destino: {{destino}}',
      'Commodity: {{commodity}}',
      'Contenedores: {{contenedores}}',
      '',
      '{{titulo_tarifa}}',
      '{{etiqueta_carrier}}: {{carrier}}',
      'Tránsito: {{transito}}',
      'ETD estimado: {{etd}}',
      'Días libres: {{dias_libres}}',
      'Tarifa comercial: {{tarifa_comercial}}',
      'Tarifa válida hasta: {{valida_hasta}}',
      '',
      'Quedamos atentos a su confirmación y a cualquier consulta adicional.',
      '',
      '{{cierre}}',
    ].join('\n'),
  },
  seguimiento_cotizacion: {
    template_key: 'seguimiento_cotizacion',
    nombre: 'Seguimiento de cotización',
    asunto: 'Seguimiento Cotización {{numero_cotizacion}} - Sari Express',
    cuerpo: [
      'Buen día {{cliente}},',
      '',
      'Espero que se encuentre muy bien.',
      '',
      'Le escribo para dar seguimiento a la tarifa ofertada según nuestra referencia {{numero_cotizacion}}.',
      'Para nosotros es muy importante contar con su retroalimentación, ya que nos permitirá atender cualquier ajuste o comentario que considere necesario.',
      '',
      'Quedo atento(a) a sus observaciones y a cualquier información adicional que requiera para la evaluación o aprobación de la propuesta.',
      '',
      'Agradezco de antemano su atención y quedo pendiente de su respuesta.',
      '',
      '{{cierre}}',
    ].join('\n'),
  },
}

// Variables disponibles por plantilla, para mostrarlas en el editor.
// Las plantillas creadas desde Settings sin entrada aquí usan el catálogo
// de cotización (getTemplateVariables), porque hoy todas se generan desde
// el detalle de la cotización con ese mismo mapa de datos.
export const EMAIL_TEMPLATE_VARIABLES: Record<
  string,
  Array<{ name: string; description: string }>
> = {
  cotizacion_cliente: [
    { name: 'cliente', description: 'Nombre del cliente' },
    { name: 'numero_cotizacion', description: 'Número de la cotización' },
    { name: 'servicio', description: 'Producto/servicio cotizado' },
    { name: 'incoterm', description: 'Incoterm' },
    { name: 'origen', description: 'Puerto/ciudad de origen' },
    { name: 'destino', description: 'Puerto/ciudad de destino' },
    { name: 'commodity', description: 'Descripción de la carga' },
    { name: 'contenedores', description: 'Resumen de contenedores (vacío si no aplica)' },
    { name: 'titulo_tarifa', description: 'Encabezado del bloque de tarifa (vacío si no hay tarifa)' },
    { name: 'etiqueta_carrier', description: 'Carrier / Transportista / Aerolínea según transporte' },
    { name: 'carrier', description: 'Naviera o transportista de la tarifa seleccionada' },
    { name: 'transito', description: 'Días de tránsito' },
    { name: 'etd', description: 'ETD estimado' },
    { name: 'dias_libres', description: 'Días libres en destino' },
    { name: 'tarifa_comercial', description: 'Total comercial de la cotización' },
    { name: 'valida_hasta', description: 'Vigencia de la tarifa' },
    { name: 'cierre', description: 'Texto de cierre (Config. Empresa > Plantilla de correo)' },
  ],
  seguimiento_cotizacion: [
    { name: 'cliente', description: 'Nombre del cliente o contacto' },
    { name: 'numero_cotizacion', description: 'Número de la cotización (referencia)' },
    { name: 'servicio', description: 'Producto/servicio cotizado' },
    { name: 'origen', description: 'Puerto/ciudad de origen' },
    { name: 'destino', description: 'Puerto/ciudad de destino' },
    { name: 'valida_hasta', description: 'Vigencia de la tarifa' },
    { name: 'cierre', description: 'Texto de cierre (Config. Empresa > Plantilla de correo)' },
  ],
}

export function getTemplateVariables(templateKey: string) {
  return (
    EMAIL_TEMPLATE_VARIABLES[templateKey] ||
    EMAIL_TEMPLATE_VARIABLES.cotizacion_cliente
  )
}

// Reemplaza {{variable}} por su valor. Las líneas que contienen placeholders
// y donde TODOS resuelven vacío se eliminan (así los bloques condicionales,
// como la tarifa seleccionada, desaparecen sin dejar huecos). Los saltos de
// línea múltiples que queden se colapsan a uno.
export function renderEmailTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
) {
  const rendered = template
    .split('\n')
    .map((line) => {
      let hasPlaceholder = false
      let allEmpty = true

      const newLine = line.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => {
        hasPlaceholder = true
        const value = vars[name]
        const text = value === null || value === undefined ? '' : String(value)
        if (text.trim() !== '') allEmpty = false
        return text
      })

      return hasPlaceholder && allEmpty ? null : newLine
    })
    .filter((line): line is string => line !== null)
    .join('\n')

  return rendered.replace(/\n{3,}/g, '\n\n').trim()
}

// Versión "esqueleto" para usar la plantilla fuera de una cotización (por
// ejemplo desde Acciones Rápidas): en lugar de resolver los {{placeholders}}
// con datos, los convierte en campos visibles a llenar ([CLIENTE],
// [NUMERO_COTIZACION]) y conserva todas las líneas.
export function renderEmailTemplateSkeleton(template: string) {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => `[${name.toUpperCase()}]`)
    .trim()
}

// Carga la plantilla desde la base; si no existe o está inactiva, usa el
// respaldo local para que el flujo de correo nunca quede vacío.
export async function fetchEmailTemplate(
  supabase: SupabaseClient,
  templateKey: string
): Promise<EmailTemplate> {
  const { data } = await supabase
    .from('email_templates')
    .select('template_key, nombre, descripcion, asunto, cuerpo')
    .eq('template_key', templateKey)
    .eq('is_active', true)
    .maybeSingle()

  return (data as EmailTemplate | null) || DEFAULT_EMAIL_TEMPLATES[templateKey]
}

// Carga todas las plantillas activas para el selector del modal de correo.
// Completa con los respaldos locales las semillas que falten en la base y
// deja 'cotizacion_cliente' de primera.
export async function fetchActiveEmailTemplates(
  supabase: SupabaseClient
): Promise<EmailTemplate[]> {
  const { data } = await supabase
    .from('email_templates')
    .select('template_key, nombre, descripcion, asunto, cuerpo')
    .eq('is_active', true)
    .order('nombre', { ascending: true })

  const rows = (data || []) as EmailTemplate[]
  const presentKeys = new Set(rows.map((row) => row.template_key))

  for (const fallback of Object.values(DEFAULT_EMAIL_TEMPLATES)) {
    if (!presentKeys.has(fallback.template_key)) rows.push(fallback)
  }

  return rows.sort((a, b) => {
    if (a.template_key === 'cotizacion_cliente') return -1
    if (b.template_key === 'cotizacion_cliente') return 1
    return a.nombre.localeCompare(b.nombre, 'es')
  })
}
