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