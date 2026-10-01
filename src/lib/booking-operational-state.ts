import { calendarDaysUntil, formatDate } from '@/src/lib/format'

export type BookingOperationalMode =
  | 'SEA_FCL'
  | 'SEA_LCL'
  | 'AIR'
  | 'ROAD_FTL'
  | 'ROAD_LTL'
  | 'UNKNOWN'

export type BookingDocumentEvidence = {
  document_type?: string | null
}

export type BookingBillEvidence = {
  bl_type?: string | null
  status?: string | null
}

export type BookingReadinessSnapshot = {
  ready: boolean
  blocking_count: number
  warning_count: number
  overdue_cutoff_count: number
  missing_vgm_count: number
}

export type BookingDocumentRequirement = {
  code:
    | 'BOOKING_CONFIRMATION'
    | 'PACKING_LIST'
    | 'COMMERCIAL_INVOICE'
    | 'MASTER_BL'
    | 'HOUSE_BL'
  label: string
}

export type BookingOperationalActionCode =
  | 'ASSIGN_OPERATION'
  | 'RECONCILE_STATUS'
  | 'MANAGE_OVERDUE_CUTOFF'
  | 'RECONCILE_ARRIVAL'
  | 'CONFIRM_BOOKING'
  | 'COMPLETE_SCHEDULE'
  | 'RESOLVE_READINESS'
  | 'COMPLETE_DOCUMENTS'
  | 'MARK_READY_TO_SHIP'
  | 'CONTINUE_OPERATION'

export type BookingOperationalAction = {
  code: BookingOperationalActionCode
  label: string
  target:
    | 'shipping_instruction'
    | 'booking_header'
    | 'booking_schedule'
    | 'booking_readiness'
    | 'booking_documents'
}

export type BookingOperationalStateInput = {
  shipmentStatus?: string | null
  bookingNumber?: string | null
  carrierBooking?: string | null
  etd?: string | null
  eta?: string | null
  actualEtd?: string | null
  actualEta?: string | null
  assignedTo?: string | null
  mode?: BookingOperationalMode | string | null
  requiresHbl?: boolean | null
  documents?: BookingDocumentEvidence[] | null
  bills?: BookingBillEvidence[] | null
  readiness?: BookingReadinessSnapshot | null
  today?: Date
}

export type BookingOperationalState = {
  persistedStatus: string
  displayStatus: string
  hasStatusDrift: boolean
  statusDriftReason: string | null
  isFinal: boolean
  isUnassigned: boolean
  isPendingConfirmation: boolean
  missingDocuments: BookingDocumentRequirement[]
  eta: {
    kind: 'missing' | 'overdue' | 'today' | 'upcoming' | 'scheduled' | 'arrived'
    days: number | null
    label: string
    date: string | null
  }
  severity: 'critical' | 'warning' | 'normal'
  attentionReason: string | null
  nextAction: BookingOperationalAction | null
}

const statusRank: Record<string, number> = {
  'Pendiente Validacion': 10,
  Validada: 20,
  'Listo para Booking': 25,
  'Booking Solicitado': 30,
  'Booking Confirmado': 40,
  'Documentacion Pendiente': 50,
  'Listo para Embarque': 60,
  Embarcado: 70,
  'En Transito': 80,
  Arribado: 90,
  Finalizado: 100,
  Cancelada: 100,
}

function normalized(value?: string | null) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function hasText(value?: string | null) {
  return Boolean(value?.trim())
}

function normalizedDocumentName(value?: string | null) {
  return normalized(value).toLowerCase()
}

export function inferBookingOperationalMode(
  ...values: Array<string | null | undefined>
): BookingOperationalMode {
  const canonical = values.find((value) =>
    ['SEA_FCL', 'SEA_LCL', 'AIR', 'ROAD_FTL', 'ROAD_LTL', 'UNKNOWN'].includes(
      value || ''
    )
  )
  if (canonical) return canonical as BookingOperationalMode

  const value = normalized(values.filter(Boolean).join(' ')).toLowerCase()
  if (!value) return 'UNKNOWN'
  if (/(aereo|air|miami_air|courier)/.test(value)) return 'AIR'
  if (/(ftl)/.test(value)) return 'ROAD_FTL'
  if (/(terrestre|road|truck|ltl)/.test(value)) return 'ROAD_LTL'
  if (/(lcl|miami_lcl|consolidado maritimo)/.test(value)) return 'SEA_LCL'
  if (/(fcl|maritima|maritimo|ocean)/.test(value)) return 'SEA_FCL'
  return 'UNKNOWN'
}

export function getRequiredBookingDocuments({
  mode,
  requiresHbl,
}: {
  mode?: BookingOperationalMode | string | null
  requiresHbl?: boolean | null
}): BookingDocumentRequirement[] {
  const resolvedMode = inferBookingOperationalMode(mode)
  const requirements: BookingDocumentRequirement[] = [
    { code: 'BOOKING_CONFIRMATION', label: 'Booking Confirmation' },
    { code: 'PACKING_LIST', label: 'Packing List' },
    { code: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
  ]

  if (resolvedMode === 'SEA_FCL' || resolvedMode === 'SEA_LCL') {
    requirements.push({ code: 'MASTER_BL', label: 'Master BL' })
    if (requiresHbl !== false) {
      requirements.push({ code: 'HOUSE_BL', label: 'House BL' })
    }
  }

  return requirements
}

export function getMissingBookingDocuments({
  mode,
  requiresHbl,
  documents,
  bills,
}: {
  mode?: BookingOperationalMode | string | null
  requiresHbl?: boolean | null
  documents?: BookingDocumentEvidence[] | null
  bills?: BookingBillEvidence[] | null
}): BookingDocumentRequirement[] {
  const attached = new Set(
    (documents || [])
      .map((document) => normalizedDocumentName(document.document_type))
      .filter(Boolean)
  )
  const availableBills = new Set(
    (bills || [])
      .filter((bill) => normalizedDocumentName(bill.status) !== 'archivado')
      .map((bill) => normalized(bill.bl_type).toUpperCase())
      .filter(Boolean)
  )

  return getRequiredBookingDocuments({ mode, requiresHbl }).filter(
    (requirement) => {
      if (requirement.code === 'MASTER_BL') {
        return !availableBills.has('MBL') && !attached.has('master bl')
      }
      if (requirement.code === 'HOUSE_BL') {
        return !availableBills.has('HBL') && !attached.has('house bl')
      }
      return !attached.has(normalizedDocumentName(requirement.label))
    }
  )
}

export function deriveBookingOperationalState(
  input: BookingOperationalStateInput
): BookingOperationalState {
  const persistedStatus = input.shipmentStatus?.trim() || 'Booking Solicitado'
  const normalizedStatus = normalized(persistedStatus)
  const persistedRank = statusRank[normalizedStatus] || 0
  const isFinal = ['Finalizado', 'Cancelada'].includes(normalizedStatus)
  const hasConfirmedReferences =
    hasText(input.bookingNumber) && hasText(input.carrierBooking)
  const isPendingConfirmation = !hasConfirmedReferences && !isFinal
  const isUnassigned = !hasText(input.assignedTo) && !isFinal
  const missingDocuments = getMissingBookingDocuments(input)
  let displayStatus = persistedStatus
  let statusDriftReason: string | null = null

  if (!isFinal && input.actualEta && persistedRank < statusRank.Arribado) {
    displayStatus = 'Arribado'
    statusDriftReason = 'Existe fecha real de arribo, pero el estado persistido no registra el arribo.'
  } else if (!isFinal && input.actualEtd && persistedRank < statusRank.Embarcado) {
    displayStatus = 'Embarcado'
    statusDriftReason = 'Existe fecha real de embarque, pero el estado persistido continúa en una etapa anterior.'
  } else if (
    !isFinal &&
    hasConfirmedReferences &&
    normalizedStatus === 'Booking Solicitado'
  ) {
    displayStatus = 'Booking Confirmado'
    statusDriftReason = 'Las referencias de booking están completas, pero el estado continúa como solicitado.'
  } else if (
    !isFinal &&
    !hasConfirmedReferences &&
    persistedRank >= statusRank['Booking Confirmado']
  ) {
    statusDriftReason = 'El estado requiere una confirmación que no tiene ambas referencias registradas.'
  }

  const etaDate = input.actualEta || input.eta || null
  const etaDays = calendarDaysUntil(etaDate, input.today || new Date())
  const arrived = Boolean(input.actualEta) || ['Arribado', 'Finalizado'].includes(
    normalized(displayStatus)
  )
  const eta: BookingOperationalState['eta'] = arrived
    ? {
        kind: 'arrived',
        days: etaDays,
        label: etaDate ? `Arribo ${formatDate(etaDate)}` : 'Arribo registrado',
        date: etaDate,
      }
    : etaDays === null
      ? { kind: 'missing', days: null, label: 'Sin ETA', date: null }
      : etaDays < 0
        ? {
            kind: 'overdue',
            days: etaDays,
            label: `Vencida hace ${Math.abs(etaDays)} día${Math.abs(etaDays) === 1 ? '' : 's'}`,
            date: etaDate,
          }
        : etaDays === 0
          ? { kind: 'today', days: 0, label: 'ETA hoy', date: etaDate }
          : etaDays <= 7
            ? {
                kind: 'upcoming',
                days: etaDays,
                label: `En ${etaDays} día${etaDays === 1 ? '' : 's'}`,
                date: etaDate,
              }
            : {
                kind: 'scheduled',
                days: etaDays,
                label: formatDate(etaDate),
                date: etaDate,
              }

  let severity: BookingOperationalState['severity'] = 'normal'
  let attentionReason: string | null = null
  let nextAction: BookingOperationalAction | null = null

  if (!isFinal && statusDriftReason && (input.actualEta || input.actualEtd)) {
    severity = 'critical'
    attentionReason = 'Estado operativo incompatible con hechos registrados'
    nextAction = {
      code: 'RECONCILE_STATUS',
      label: 'Conciliar estado operativo',
      target: 'booking_header',
    }
  } else if ((input.readiness?.overdue_cutoff_count || 0) > 0) {
    severity = 'critical'
    attentionReason = `${input.readiness?.overdue_cutoff_count} cut-off(s) vencido(s)`
    nextAction = {
      code: 'MANAGE_OVERDUE_CUTOFF',
      label: 'Gestionar cut-off vencido',
      target: 'booking_readiness',
    }
  } else if (eta.kind === 'overdue') {
    severity = 'critical'
    attentionReason = 'ETA vencida sin arribo registrado'
    nextAction = {
      code: 'RECONCILE_ARRIVAL',
      label: 'Conciliar arribo',
      target: 'booking_header',
    }
  } else if (!isFinal && statusDriftReason) {
    severity = 'warning'
    attentionReason = 'Estado operativo incompatible con hechos registrados'
    nextAction = {
      code: 'RECONCILE_STATUS',
      label: 'Conciliar estado operativo',
      target: 'booking_header',
    }
  } else if (isUnassigned) {
    severity = 'warning'
    attentionReason = 'Operación sin responsable asignado'
    nextAction = {
      code: 'ASSIGN_OPERATION',
      label: 'Asignar operación',
      target: 'shipping_instruction',
    }
  } else if (isPendingConfirmation) {
    severity = 'warning'
    attentionReason = 'Faltan referencias para confirmar el booking'
    nextAction = {
      code: 'CONFIRM_BOOKING',
      label: 'Registrar confirmación',
      target: 'booking_schedule',
    }
  } else if (!input.etd || !input.eta) {
    severity = 'warning'
    attentionReason = 'Itinerario incompleto'
    nextAction = {
      code: 'COMPLETE_SCHEDULE',
      label: 'Completar itinerario',
      target: 'booking_schedule',
    }
  } else if (input.readiness && !input.readiness.ready) {
    severity = 'warning'
    attentionReason = `${input.readiness.blocking_count} bloqueo(s) de readiness`
    nextAction = {
      code: 'RESOLVE_READINESS',
      label: 'Resolver readiness',
      target: 'booking_readiness',
    }
  } else if (missingDocuments.length > 0) {
    severity = 'warning'
    attentionReason = `${missingDocuments.length} documento(s) requerido(s) pendiente(s)`
    nextAction = {
      code: 'COMPLETE_DOCUMENTS',
      label: missingDocuments[0]?.code === 'MASTER_BL'
        ? 'Preparar MBL'
        : missingDocuments[0]?.code === 'HOUSE_BL'
          ? 'Preparar HBL'
          : 'Completar documentación',
      target: missingDocuments[0]?.code === 'MASTER_BL' || missingDocuments[0]?.code === 'HOUSE_BL'
        ? 'booking_header'
        : 'booking_documents',
    }
  } else if (
    input.readiness?.ready &&
    ['Booking Confirmado', 'Documentacion Pendiente'].includes(normalizedStatus)
  ) {
    nextAction = {
      code: 'MARK_READY_TO_SHIP',
      label: 'Marcar listo para embarque',
      target: 'booking_header',
    }
  } else if (!isFinal) {
    nextAction = {
      code: 'CONTINUE_OPERATION',
      label: 'Continuar operación',
      target: 'booking_header',
    }
  }

  return {
    persistedStatus,
    displayStatus,
    hasStatusDrift: Boolean(statusDriftReason),
    statusDriftReason,
    isFinal,
    isUnassigned,
    isPendingConfirmation,
    missingDocuments,
    eta,
    severity,
    attentionReason,
    nextAction,
  }
}
