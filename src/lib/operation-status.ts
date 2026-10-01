export const operationStatuses = [
  'Pendiente Validación',
  'Validada',
  'Booking Solicitado',
  'Booking Confirmado',
  'Documentación Pendiente',
  'Listo para Embarque',
  'Embarcado',
  'En Tránsito',
  'Arribado',
  'Finalizado',
] as const

export type OperationStatus = (typeof operationStatuses)[number]

export const shippingInstructionFilterStatuses = [
  'Pendiente Validaci\u00f3n',
  'Asignado',
  'Listo para Booking',
  'En Booking',
  'Booking Solicitado',
  'Booking Confirmado',
  'Parcialmente Confirmado',
  'En proceso',
  'Documentaci\u00f3n Pendiente',
  'Listo para Embarque',
  'Embarcado',
  'En Tr\u00e1nsito',
  'Arribo Parcial',
  'Arribado',
  'Finalizado',
  'Cancelada',
] as const

type ShippingInstructionStatusInput = {
  shipment_status?: string | null
  operational_status?: string | null
}

export function resolveShippingInstructionStatus({
  shipment_status,
  operational_status,
}: ShippingInstructionStatusInput) {
  const shipmentStatus = (shipment_status || '').trim()
  const operationalStatus = (operational_status || '').trim()

  if (
    shipmentStatus &&
    shipmentStatus !== 'Pendiente Validaci\u00f3n' &&
    shipmentStatus !== 'Validada'
  ) {
    return shipmentStatus
  }

  if (
    operationalStatus === 'Asignado' ||
    operationalStatus === 'Listo para Booking' ||
    operationalStatus === 'En Booking'
  ) {
    return operationalStatus
  }

  if (shipmentStatus === 'Validada') return 'Listo para Booking'

  return shipmentStatus || operationalStatus || 'Pendiente Validaci\u00f3n'
}
