import { calendarDaysUntil } from '@/src/lib/format'

export type SalesWorkSeverity = 'critical' | 'warning' | 'normal'
export type SalesWorkCategory = 'follow_up' | 'quotation' | 'handoff' | 'lead'

export type SalesActivityWorkSource = {
  id: string
  cliente_id?: string | null
  clientName?: string | null
  nombre_prospecto?: string | null
  empresa_prospecto?: string | null
  proxima_accion?: string | null
  fecha_proxima_accion?: string | null
  fecha_actividad: string
  created_at?: string | null
}

export type QuotationWorkSource = {
  id: string
  quotation_number?: string | null
  status?: string | null
  valid_until?: string | null
  created_at?: string | null
  clientName?: string | null
  shipmentCount?: number
  statusHistory?: Array<{
    new_status?: string | null
    created_at?: string | null
  }> | null
}

export type LeadWorkSource = {
  id: string
  nombre: string
  empresa: string
  email?: string | null
  created_at?: string | null
}

export type SalesWorkItem = {
  id: string
  sourceType: 'activity' | 'quotation' | 'lead'
  sourceId: string
  category: SalesWorkCategory
  severity: SalesWorkSeverity
  title: string
  entityLabel: string
  clientName: string
  reason: string
  nextAction: string
  href: string | null
  dueDate: string | null
  lastChangeAt: string | null
  agingDays: number
  searchText: string
}

const severityWeight: Record<SalesWorkSeverity, number> = {
  critical: 0,
  warning: 1,
  normal: 2,
}

function normalized(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function activityEntityKey(activity: SalesActivityWorkSource) {
  if (activity.cliente_id) return `client:${activity.cliente_id}`
  const prospect = normalized(activity.empresa_prospecto || activity.nombre_prospecto)
  return prospect ? `prospect:${prospect}` : `activity:${activity.id}`
}

function activityDate(activity: SalesActivityWorkSource) {
  return activity.created_at || `${activity.fecha_actividad}T00:00:00`
}

function latestStatusChange(quotation: QuotationWorkSource) {
  const matchingHistory = (quotation.statusHistory || [])
    .filter((entry) => entry.new_status === quotation.status && entry.created_at)
    .map((entry) => entry.created_at as string)
    .sort((left, right) => right.localeCompare(left))

  return matchingHistory[0] || quotation.created_at || null
}

function agingDaysSince(value: string | null, today: Date) {
  const daysUntil = calendarDaysUntil(value, today)
  return daysUntil === null ? 0 : Math.max(-daysUntil, 0)
}

function itemSearchText(...values: Array<string | null | undefined>) {
  return normalized(values.filter(Boolean).join(' '))
}

function quotationItem(
  quotation: QuotationWorkSource,
  today: Date
): SalesWorkItem | null {
  const status = quotation.status || 'Sin estado'
  const validityDays = calendarDaysUntil(quotation.valid_until, today)
  const lastChangeAt = latestStatusChange(quotation)
  const agingDays = agingDaysSince(lastChangeAt, today)
  const clientName = quotation.clientName || 'Sin cliente'
  const entityLabel = quotation.quotation_number || quotation.id.slice(0, 8)
  const base = {
    id: `quotation:${quotation.id}`,
    sourceType: 'quotation' as const,
    sourceId: quotation.id,
    clientName,
    entityLabel,
    href: `/quotations/${quotation.id}`,
    lastChangeAt,
    agingDays,
  }

  if (status === 'Ganada' && (quotation.shipmentCount || 0) === 0) {
    return {
      ...base,
      category: 'handoff',
      severity: 'critical',
      title: 'Ganada sin operación creada',
      reason: `La cotización lleva ${agingDays} día${agingDays === 1 ? '' : 's'} ganada sin shipment.`,
      nextAction: 'Crear Shipping Instruction',
      dueDate: null,
      searchText: itemSearchText(entityLabel, clientName, status, 'ganada shipment'),
    }
  }

  if (['Ganada', 'Perdida'].includes(status)) return null

  if (validityDays !== null && validityDays < 0) {
    return {
      ...base,
      category: 'quotation',
      severity: 'critical',
      title: 'Vigencia vencida',
      reason: `La propuesta venció hace ${Math.abs(validityDays)} día${Math.abs(validityDays) === 1 ? '' : 's'}.`,
      nextAction: 'Revisar y renovar propuesta',
      dueDate: quotation.valid_until || null,
      searchText: itemSearchText(entityLabel, clientName, status, 'vigencia vencida'),
    }
  }

  if (validityDays !== null && validityDays <= 7) {
    return {
      ...base,
      category: 'quotation',
      severity: validityDays <= 2 ? 'critical' : 'warning',
      title: validityDays === 0 ? 'Vigencia vence hoy' : 'Vigencia próxima a vencer',
      reason: validityDays === 0
        ? 'La propuesta vence hoy.'
        : `Quedan ${validityDays} días de vigencia.`,
      nextAction: status === 'Enviada al Cliente' ? 'Contactar cliente' : 'Revisar propuesta',
      dueDate: quotation.valid_until || null,
      searchText: itemSearchText(entityLabel, clientName, status, 'vigencia'),
    }
  }

  if (status === 'Enviada al Cliente') {
    return {
      ...base,
      category: 'quotation',
      severity: agingDays >= 14 ? 'critical' : agingDays >= 7 ? 'warning' : 'normal',
      title: 'Esperando respuesta del cliente',
      reason: `Sin cambio de estado durante ${agingDays} día${agingDays === 1 ? '' : 's'}.`,
      nextAction: 'Dar seguimiento al cliente',
      dueDate: quotation.valid_until || null,
      searchText: itemSearchText(entityLabel, clientName, status, 'seguimiento cliente'),
    }
  }

  return null
}

export function buildSalesWorkQueue({
  activities,
  quotations,
  leads,
  today = new Date(),
}: {
  activities: SalesActivityWorkSource[]
  quotations: QuotationWorkSource[]
  leads: LeadWorkSource[]
  today?: Date
}): SalesWorkItem[] {
  const latestActivityByEntity = new Map<string, SalesActivityWorkSource>()

  activities.forEach((activity) => {
    const key = activityEntityKey(activity)
    const current = latestActivityByEntity.get(key)
    if (!current || activityDate(activity) > activityDate(current)) {
      latestActivityByEntity.set(key, activity)
    }
  })

  const activityItems = Array.from(latestActivityByEntity.values())
    .filter((activity) => activity.proxima_accion && activity.fecha_proxima_accion)
    .map<SalesWorkItem>((activity) => {
      const dueDays = calendarDaysUntil(activity.fecha_proxima_accion, today) ?? 0
      const clientName =
        activity.clientName ||
        activity.empresa_prospecto ||
        activity.nombre_prospecto ||
        'Sin cliente'
      const overdue = dueDays < 0
      const dueToday = dueDays === 0
      const title = overdue
        ? 'Seguimiento vencido'
        : dueToday
          ? 'Seguimiento para hoy'
          : 'Seguimiento programado'

      return {
        id: `activity:${activity.id}`,
        sourceType: 'activity',
        sourceId: activity.id,
        category: 'follow_up',
        severity: overdue ? 'critical' : dueToday ? 'warning' : 'normal',
        title,
        entityLabel: clientName,
        clientName,
        reason: activity.proxima_accion || 'Seguimiento pendiente',
        nextAction: 'Registrar resultado',
        href: null,
        dueDate: activity.fecha_proxima_accion || null,
        lastChangeAt: activityDate(activity),
        agingDays: overdue ? Math.abs(dueDays) : 0,
        searchText: itemSearchText(clientName, activity.proxima_accion, title),
      }
    })

  const managedProspects = new Set(
    activities.flatMap((activity) => [
      normalized(activity.empresa_prospecto),
      normalized(activity.nombre_prospecto),
    ]).filter(Boolean)
  )

  const leadItems = leads
    .filter((lead) => {
      const company = normalized(lead.empresa)
      const contact = normalized(lead.nombre)
      return !managedProspects.has(company) && !managedProspects.has(contact)
    })
    .map<SalesWorkItem>((lead) => {
      const agingDays = agingDaysSince(lead.created_at || null, today)
      return {
        id: `lead:${lead.id}`,
        sourceType: 'lead',
        sourceId: lead.id,
        category: 'lead',
        severity: agingDays >= 3 ? 'critical' : agingDays >= 1 ? 'warning' : 'normal',
        title: 'Lead sin primera gestión',
        entityLabel: lead.empresa,
        clientName: lead.empresa,
        reason: `${lead.nombre}${lead.email ? ` · ${lead.email}` : ''}`,
        nextAction: 'Registrar primer contacto',
        href: null,
        dueDate: null,
        lastChangeAt: lead.created_at || null,
        agingDays,
        searchText: itemSearchText(lead.empresa, lead.nombre, lead.email, 'lead'),
      }
    })

  const quotationItems = quotations
    .map((quotation) => quotationItem(quotation, today))
    .filter((item): item is SalesWorkItem => Boolean(item))

  return [...activityItems, ...quotationItems, ...leadItems].sort((left, right) => {
    const severity = severityWeight[left.severity] - severityWeight[right.severity]
    if (severity !== 0) return severity

    const leftDue = left.dueDate ? new Date(`${left.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
    const rightDue = right.dueDate ? new Date(`${right.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER
    if (leftDue !== rightDue) return leftDue - rightDue

    return right.agingDays - left.agingDays
  })
}

