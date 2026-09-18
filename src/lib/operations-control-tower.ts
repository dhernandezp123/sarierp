import type { BookingOperationalState } from '@/src/lib/booking-operational-state'
import { calendarDaysUntil } from '@/src/lib/format'

export type OperationsQueueFilter =
  | 'all'
  | 'attention'
  | 'unassigned'
  | 'departures'
  | 'arrivals'
  | 'documentation'
  | 'exceptions'
  | 'recently_completed'

export type ReadinessWorkAlert = {
  alert_key: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  alert_code: string
  title: string
  description: string
  due_at: string | null
}

export type OperationsWorkSource = {
  id: string
  shippingInstructionId: string
  bookingLabel: string
  routingNumber: string
  clientName: string
  carrier?: string | null
  etd?: string | null
  eta?: string | null
  actualEta?: string | null
  remainingFreeDays?: number | null
  createdAt?: string | null
  updatedAt?: string | null
  lastEvent?: {
    eventLabel?: string | null
    occurredAt?: string | null
    createdAt?: string | null
  } | null
  state: BookingOperationalState
  readinessAlerts?: ReadinessWorkAlert[]
}

export type OperationsWorkItem = {
  id: string
  shippingInstructionId: string
  level: 'immediate' | 'pending' | 'visibility'
  severity: 'critical' | 'warning' | 'normal'
  bookingLabel: string
  routingNumber: string
  clientName: string
  carrier: string
  displayStatus: string
  reason: string
  detail: string | null
  nextAction: string
  actionTarget: BookingOperationalState['nextAction'] extends infer T
    ? T extends { target: infer U }
      ? U
      : never
    : never
  dueAt: string | null
  lastChangeAt: string | null
  lastChangeLabel: string
  agingDays: number
  categories: OperationsQueueFilter[]
  searchText: string
}

const levelWeight: Record<OperationsWorkItem['level'], number> = {
  immediate: 0,
  pending: 1,
  visibility: 2,
}

const severityWeight: Record<OperationsWorkItem['severity'], number> = {
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

function agingDaysSince(value: string | null, today: Date) {
  const daysUntil = calendarDaysUntil(value, today)
  return daysUntil === null ? 0 : Math.max(-daysUntil, 0)
}

function alertWeight(alert: ReadinessWorkAlert) {
  return alert.severity === 'CRITICAL' ? 0 : alert.severity === 'WARNING' ? 1 : 2
}

export function buildOperationsControlTower(
  sources: OperationsWorkSource[],
  today = new Date()
): OperationsWorkItem[] {
  return sources
    .map<OperationsWorkItem | null>((source) => {
      const eventDate = source.lastEvent?.occurredAt || source.lastEvent?.createdAt || null
      const lastChangeAt = eventDate || source.updatedAt || source.createdAt || null
      const agingDays = agingDaysSince(lastChangeAt, today)
      const readinessAlert = [...(source.readinessAlerts || [])]
        .sort((left, right) => alertWeight(left) - alertWeight(right))[0]
      const etdDays = calendarDaysUntil(source.etd, today)
      const etaDays = calendarDaysUntil(source.actualEta || source.eta, today)
      const categories: OperationsQueueFilter[] = []

      if (source.state.isUnassigned) categories.push('unassigned')
      if (etdDays !== null && etdDays >= 0 && etdDays <= 7) categories.push('departures')
      if (!source.actualEta && etaDays !== null && etaDays <= 7) categories.push('arrivals')
      if (source.state.missingDocuments.length > 0) categories.push('documentation')
      if (source.state.hasStatusDrift || readinessAlert || source.state.attentionReason) {
        categories.push('exceptions')
      }

      if (source.state.isFinal) {
        if (agingDays > 7) return null
        categories.push('recently_completed')
        return {
          id: source.id,
          shippingInstructionId: source.shippingInstructionId,
          level: 'visibility',
          severity: 'normal',
          bookingLabel: source.bookingLabel,
          routingNumber: source.routingNumber,
          clientName: source.clientName,
          carrier: source.carrier || 'N/A',
          displayStatus: source.state.displayStatus,
          reason: 'Operación completada recientemente',
          detail: source.lastEvent?.eventLabel || null,
          nextAction: 'Revisar expediente',
          actionTarget: 'booking_header',
          dueAt: null,
          lastChangeAt,
          lastChangeLabel: source.lastEvent?.eventLabel || 'Última actualización',
          agingDays,
          categories,
          searchText: normalized(`${source.bookingLabel} ${source.routingNumber} ${source.clientName} ${source.carrier || ''}`),
        }
      }

      const remainingFreeDays = Number(source.remainingFreeDays)
      const freeDaysCritical =
        (Boolean(source.actualEta) || normalized(source.state.displayStatus) === 'arribado') &&
        Number.isFinite(remainingFreeDays) &&
        remainingFreeDays >= 0 &&
        remainingFreeDays <= 3

      if (freeDaysCritical && !categories.includes('exceptions')) {
        categories.push('exceptions')
      }

      let severity = source.state.severity
      let reason = source.state.attentionReason || 'Operación en curso'
      let detail: string | null = null
      let nextAction = source.state.nextAction?.label || 'Continuar operación'
      let actionTarget = source.state.nextAction?.target || 'booking_header'
      let dueAt: string | null = readinessAlert?.due_at || null

      if (readinessAlert?.severity === 'CRITICAL') {
        severity = 'critical'
        reason = readinessAlert.title
        detail = readinessAlert.description
        nextAction = readinessAlert.alert_code.includes('CUTOFF')
          ? 'Gestionar cut-off'
          : 'Resolver bloqueo de readiness'
        actionTarget = 'booking_readiness'
      } else if (freeDaysCritical) {
        severity = remainingFreeDays <= 1 ? 'critical' : 'warning'
        reason = remainingFreeDays === 0
          ? 'Free days vencen hoy'
          : `${remainingFreeDays} día${remainingFreeDays === 1 ? '' : 's'} libre${remainingFreeDays === 1 ? '' : 's'} restante${remainingFreeDays === 1 ? '' : 's'}`
        nextAction = 'Coordinar retiro o devolución'
        actionTarget = 'booking_header'
        dueAt = null
      } else if (readinessAlert && severity !== 'critical') {
        severity = readinessAlert.severity === 'WARNING' ? 'warning' : severity
        reason = readinessAlert.title
        detail = readinessAlert.description
        nextAction = 'Resolver readiness'
        actionTarget = 'booking_readiness'
      }

      const level: OperationsWorkItem['level'] =
        severity === 'critical' || source.state.isUnassigned || source.state.hasStatusDrift || freeDaysCritical
          ? 'immediate'
          : severity === 'warning'
            ? 'pending'
            : 'visibility'

      if (level === 'immediate') categories.push('attention')

      return {
        id: source.id,
        shippingInstructionId: source.shippingInstructionId,
        level,
        severity,
        bookingLabel: source.bookingLabel,
        routingNumber: source.routingNumber,
        clientName: source.clientName,
        carrier: source.carrier || 'N/A',
        displayStatus: source.state.displayStatus,
        reason,
        detail,
        nextAction,
        actionTarget,
        dueAt,
        lastChangeAt,
        lastChangeLabel: source.lastEvent?.eventLabel || 'Última actualización',
        agingDays,
        categories,
        searchText: normalized(`${source.bookingLabel} ${source.routingNumber} ${source.clientName} ${source.carrier || ''} ${reason}`),
      }
    })
    .filter((item): item is OperationsWorkItem => Boolean(item))
    .sort((left, right) => {
      const level = levelWeight[left.level] - levelWeight[right.level]
      if (level !== 0) return level
      const severity = severityWeight[left.severity] - severityWeight[right.severity]
      if (severity !== 0) return severity
      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      if (leftDue !== rightDue) return leftDue - rightDue
      return right.agingDays - left.agingDays
    })
}

export function filterOperationsControlTower(
  items: OperationsWorkItem[],
  filter: OperationsQueueFilter,
  search: string
) {
  const normalizedSearch = normalized(search)
  return items.filter((item) => {
    const matchesFilter = filter === 'all' || item.categories.includes(filter)
    const matchesSearch = !normalizedSearch || item.searchText.includes(normalizedSearch)
    return matchesFilter && matchesSearch
  })
}
