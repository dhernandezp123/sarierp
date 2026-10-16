import { formatDate, toDateInputValue } from './format'

export const ACTIVITY_EXECUTION_STATUSES = ['Pendiente', 'Realizada', 'Cancelada'] as const
export type ActivityExecutionStatus = typeof ACTIVITY_EXECUTION_STATUSES[number]

export const VISIT_REPORT_COLUMNS = [
  { key: 'fecha', label: 'Fecha', width: '7%' },
  { key: 'horario', label: 'Horario', width: '7%' },
  { key: 'codigo', label: 'Código', width: '6%' },
  { key: 'cliente', label: 'Cliente / Prospecto', width: '12%' },
  { key: 'contacto', label: 'Contacto prospecto', width: '8%' },
  { key: 'tipo', label: 'Tipo cuenta', width: '7%' },
  { key: 'vendedor', label: 'Vendedor', width: '8%' },
  { key: 'estado', label: 'Estado', width: '7%' },
  { key: 'vencida', label: 'Vencida', width: '5%' },
  { key: 'objetivo', label: 'Objetivo / Notas', width: '10%' },
  { key: 'resultado', label: 'Resultado', width: '8%' },
  { key: 'proxima_accion', label: 'Próxima acción', width: '9%' },
  { key: 'fecha_proxima_accion', label: 'Fecha próxima acción', width: '6%' },
]

export const SALES_VISIT_SELECT = `
  id, tipo_cliente, nombre_prospecto, empresa_prospecto, fecha_actividad,
  hora_inicio, hora_fin, estado_ejecucion, comentarios, resultado,
  proxima_accion, fecha_proxima_accion,
  clientes!sales_activities_tenant_cliente_fkey(id, codigo_cliente, nombre),
  profiles!sales_activities_tenant_created_by_fkey(id, nombre, apellido)
`

type Join<T> = T | T[] | null
export type SalesVisit = {
  id: string
  tipo_cliente: string
  nombre_prospecto: string | null
  empresa_prospecto: string | null
  fecha_actividad: string
  hora_inicio: string | null
  hora_fin: string | null
  estado_ejecucion: ActivityExecutionStatus | null
  comentarios: string | null
  resultado: string | null
  proxima_accion: string | null
  fecha_proxima_accion: string | null
  clientes: Join<{ id: string; codigo_cliente: string | null; nombre: string | null }>
  profiles: Join<{ id: string; nombre: string | null; apellido: string | null }>
}

export function activityExecutionLabel(status: ActivityExecutionStatus | null) {
  return status || 'Sin clasificar'
}

export function visitReportRows(visits: SalesVisit[], today = toDateInputValue()) {
  return visits.map((visit) => {
    const client = Array.isArray(visit.clientes) ? visit.clientes[0] : visit.clientes
    const seller = Array.isArray(visit.profiles) ? visit.profiles[0] : visit.profiles
    const name = client?.nombre || visit.empresa_prospecto || visit.nombre_prospecto || 'Sin cuenta'
    const responsible = [seller?.nombre, seller?.apellido].filter(Boolean).join(' ') || 'Sin vendedor'
    const status = activityExecutionLabel(visit.estado_ejecucion)
    return {
      __key: visit.id,
      __href: '/ventas?activity=' + encodeURIComponent(visit.id),
      __date: visit.fecha_actividad,
      __client: name,
      __seller: responsible,
      __status: status,
      fecha: formatDate(visit.fecha_actividad),
      horario: [visit.hora_inicio?.slice(0, 5), visit.hora_fin?.slice(0, 5)].filter(Boolean).join(' – ') || '-',
      codigo: client?.codigo_cliente || '-',
      cliente: name,
      contacto: visit.nombre_prospecto || '-',
      tipo: visit.tipo_cliente,
      vendedor: responsible,
      estado: status,
      vencida: visit.estado_ejecucion === 'Pendiente' && visit.fecha_actividad < today ? 'Sí' : 'No',
      objetivo: visit.comentarios || '-',
      resultado: visit.resultado || '-',
      proxima_accion: visit.proxima_accion || '-',
      fecha_proxima_accion: formatDate(visit.fecha_proxima_accion),
    }
  })
}
