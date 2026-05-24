export const shipmentEventTypes = [
  'Booking Solicitado',
  'Booking Confirmado',
  'Gate In',
  'Zarpado',
  'Transbordo',
  'Arribo',
  'Despacho Aduanal',
  'Entregado',
] as const

export type ShipmentEventType = (typeof shipmentEventTypes)[number]