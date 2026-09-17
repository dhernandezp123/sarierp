export type DocumentationWorkspaceStatus =
  | 'complete'
  | 'in_progress'
  | 'missing'
  | 'blocked'
  | 'not_started'

export type DocumentationWorkspaceAction = {
  label: string
  href: string
}

export type DocumentationWorkspaceItem = {
  id: 'shipping_instruction' | 'booking' | 'readiness' | 'attachments' | 'mbl' | 'hbl' | 'arrival_notice'
  label: string
  owner: string
  status: DocumentationWorkspaceStatus
  summary: string
  details: string[]
  action?: DocumentationWorkspaceAction
}

export type DocumentationWorkspaceBill = {
  id: string
  bl_type: 'MBL' | 'HBL'
  parent_bl_id: string | null
  bl_number: string | null
  status: string
}

export type DocumentationWorkspaceReadiness = {
  ready: boolean
  blocking_count: number
  requirements: Array<{
    label: string
    blocking: boolean
  }>
}

type DocumentationWorkspaceInput = {
  shippingInstructionId: string
  bookingId: string
  routingNumber: string | null
  origin: string | null
  destination: string | null
  shipperName: string | null
  consigneeName: string | null
  bookingReference: string | null
  carrier: string | null
  vesselName: string | null
  voyage: string | null
  transportMode: string | null
  containerCount: number
  documentTypes: string[]
  bills: DocumentationWorkspaceBill[]
  readiness: DocumentationWorkspaceReadiness | null
  isArrived: boolean
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function normalized(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function latestBill(
  bills: DocumentationWorkspaceBill[],
  type: DocumentationWorkspaceBill['bl_type']
) {
  return bills.filter((bill) => bill.bl_type === type).at(-1)
}

function billIsComplete(bill: DocumentationWorkspaceBill) {
  if (bill.bl_type === 'MBL') return bill.status === 'MBL Validado'
  return ['Emitido', 'Liberado'].includes(bill.status)
}

export function buildDocumentationWorkspace(
  input: DocumentationWorkspaceInput
): DocumentationWorkspaceItem[] {
  const bookingPath = `/operations/shipping-instructions/${input.shippingInstructionId}/bookings/${input.bookingId}`
  const siPath = `/operations/shipping-instructions/${input.shippingInstructionId}`
  const maritime = normalized(input.transportMode).includes('marit')
  const siMissing = [
    !hasText(input.routingNumber) ? 'Número de Shipping Instruction' : null,
    !hasText(input.shipperName) ? 'Shipper' : null,
    !hasText(input.consigneeName) ? 'Consignee' : null,
    !hasText(input.origin) ? 'Origen / POL' : null,
    !hasText(input.destination) ? 'Destino / POD' : null,
  ].filter((value): value is string => Boolean(value))
  const bookingMissing = [
    !hasText(input.bookingReference) ? 'Referencia del booking' : null,
    !hasText(input.carrier) ? 'Carrier / naviera' : null,
    maritime && !hasText(input.vesselName) ? 'Buque' : null,
    maritime && !hasText(input.voyage) ? 'Viaje' : null,
  ].filter((value): value is string => Boolean(value))
  const blockingRequirements =
    input.readiness?.requirements
      .filter((requirement) => requirement.blocking)
      .map((requirement) => requirement.label) || []
  const mbl = latestBill(input.bills, 'MBL')
  const hbls = input.bills.filter((bill) => bill.bl_type === 'HBL')
  const validatedMbl = input.bills.find(
    (bill) => bill.bl_type === 'MBL' && bill.status === 'MBL Validado'
  )
  const completeHbls = hbls.filter(billIsComplete)
  const hasArrivalNotice = input.documentTypes.some(
    (type) => normalized(type) === 'arrival notice'
  )

  const items: DocumentationWorkspaceItem[] = [
    {
      id: 'shipping_instruction',
      label: 'Shipping Instructions',
      owner: 'Operaciones',
      status: siMissing.length === 0 ? 'complete' : 'missing',
      summary:
        siMissing.length === 0
          ? `SI ${input.routingNumber} con partes y ruta disponibles`
          : `${siMissing.length} dato(s) base pendiente(s)`,
      details:
        siMissing.length === 0
          ? [
              `${input.origin} → ${input.destination}`,
              `${input.shipperName} → ${input.consigneeName}`,
            ]
          : siMissing.map((field) => `Falta ${field}`),
      action: {
        label: siMissing.length === 0 ? 'Revisar SI' : 'Completar SI',
        href: siPath,
      },
    },
    {
      id: 'booking',
      label: 'Booking y routing',
      owner: 'Operaciones / carrier',
      status: bookingMissing.length === 0 ? 'complete' : 'missing',
      summary:
        bookingMissing.length === 0
          ? `Booking ${input.bookingReference} preparado`
          : `${bookingMissing.length} dato(s) operativo(s) pendiente(s)`,
      details:
        bookingMissing.length === 0
          ? [
              input.carrier || 'Carrier sin identificar',
              maritime
                ? `${input.vesselName} / ${input.voyage}`
                : 'Ruta operativa disponible',
            ]
          : bookingMissing.map((field) => `Falta ${field}`),
      action: {
        label: bookingMissing.length === 0 ? 'Revisar datos' : 'Completar booking',
        href: `${bookingPath}#booking-data`,
      },
    },
    {
      id: 'readiness',
      label: 'Preparación operativa',
      owner: 'Operaciones',
      status: !input.readiness
        ? 'in_progress'
        : input.readiness.ready
          ? 'complete'
          : 'blocked',
      summary: !input.readiness
        ? 'Evaluando requisitos del embarque'
        : input.readiness.ready
          ? 'Requisitos operativos satisfechos'
          : `${input.readiness.blocking_count} bloqueo(s) vigente(s)`,
      details: !input.readiness
        ? ['La evaluación aparecerá al completar la carga del booking']
        : input.readiness.ready
          ? [
              input.containerCount > 0
                ? `${input.containerCount} contenedor(es) asignado(s)`
                : 'Sin bloqueos documentales vigentes',
            ]
          : blockingRequirements.slice(0, 3).map((label) => `Pendiente: ${label}`),
      action: {
        label: input.readiness?.ready ? 'Ver readiness' : 'Resolver bloqueos',
        href: `${bookingPath}#booking-readiness`,
      },
    },
    {
      id: 'attachments',
      label: 'Archivos de soporte',
      owner: 'Operaciones',
      status: input.documentTypes.length > 0 ? 'in_progress' : 'not_started',
      summary:
        input.documentTypes.length > 0
          ? `${input.documentTypes.length} archivo(s) adjunto(s)`
          : 'Aún no hay archivos adjuntos',
      details:
        input.documentTypes.length > 0
          ? Array.from(new Set(input.documentTypes)).slice(0, 3)
          : ['Booking confirmation, invoices, packing list y otros'],
      action: {
        label: input.documentTypes.length > 0 ? 'Ver archivos' : 'Adjuntar archivo',
        href: `${bookingPath}#booking-documents`,
      },
    },
  ]

  items.push({
    id: 'mbl',
    label: 'Master Bill of Lading',
    owner: 'Operaciones / agente',
    status: mbl
      ? billIsComplete(mbl)
        ? 'complete'
        : 'in_progress'
      : hasText(input.bookingReference)
        ? 'not_started'
        : 'blocked',
    summary: mbl
      ? `${mbl.bl_number || 'MBL sin número'} · ${mbl.status}`
      : hasText(input.bookingReference)
        ? 'Listo para iniciar el MBL'
        : 'Requiere una referencia de booking',
    details: mbl
      ? [billIsComplete(mbl) ? 'Validado para preparar HBL' : 'Continúa la revisión del draft']
      : [
          hasText(input.bookingReference)
            ? 'Los datos conocidos se heredarán automáticamente'
            : 'Confirma Booking Number o Carrier Booking',
        ],
    action: mbl
      ? {
          label: billIsComplete(mbl) ? 'Abrir MBL' : 'Continuar MBL',
          href: `${bookingPath}/bl/${mbl.id}`,
        }
      : hasText(input.bookingReference)
        ? { label: 'Crear MBL', href: `${bookingPath}/bl/new?type=MBL` }
        : { label: 'Confirmar referencia', href: `${bookingPath}#booking-schedule` },
  })

  items.push({
    id: 'hbl',
    label: 'House Bill of Lading',
    owner: 'Operaciones / cliente',
    status:
      hbls.length === 0
        ? validatedMbl
          ? 'not_started'
          : 'blocked'
        : completeHbls.length === hbls.length
          ? 'complete'
          : 'in_progress',
    summary:
      hbls.length === 0
        ? validatedMbl
          ? 'MBL validado; HBL listo para iniciar'
          : 'Requiere validar primero el MBL'
        : `${completeHbls.length}/${hbls.length} HBL emitido(s) o liberado(s)`,
    details:
      hbls.length === 0
        ? ['El HBL heredará ruta y carga, conservando las partes comerciales']
        : hbls.slice(-3).map(
            (bill) => `${bill.bl_number || 'HBL sin número'} · ${bill.status}`
          ),
    action:
      hbls.length > 0
        ? {
            label: completeHbls.length === hbls.length ? 'Ver HBL' : 'Continuar HBL',
            href: `${bookingPath}/bl/${hbls.at(-1)?.id}`,
          }
        : validatedMbl
          ? {
              label: 'Crear HBL',
              href: `${bookingPath}/bl/new?type=HBL&parentBlId=${validatedMbl.id}`,
            }
          : mbl
            ? { label: 'Continuar MBL', href: `${bookingPath}/bl/${mbl.id}` }
            : { label: 'Preparar MBL', href: `${bookingPath}#booking-bills` },
  })

  items.push({
    id: 'arrival_notice',
    label: 'Aviso de llegada',
    owner: 'Operaciones',
    status: hasArrivalNotice
      ? 'complete'
      : input.isArrived
        ? 'not_started'
        : 'blocked',
    summary: hasArrivalNotice
      ? 'Aviso de llegada adjunto'
      : input.isArrived
        ? 'Disponible para generar'
        : 'Se habilita al registrar el arribo',
    details: hasArrivalNotice
      ? ['Archivo disponible en documentos del booking']
      : ['Usará los datos vigentes del booking y del HBL emitido'],
    action: {
      label: hasArrivalNotice ? 'Ver archivo' : input.isArrived ? 'Generar arriba' : 'Ver estado',
      href: hasArrivalNotice
        ? `${bookingPath}#booking-documents`
        : input.isArrived
          ? `${bookingPath}#booking-header`
          : `${bookingPath}#booking-readiness`,
    },
  })

  return items
}
