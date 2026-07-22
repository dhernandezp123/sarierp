export const QUOTATION_LOSS_REASONS = [
  'Tarifa alta',
  'Tiempo de respuesta (enviada tarde)',
  'Cliente eligió otro proveedor',
  'Tiempo de tránsito no competitivo',
  'Ruta o servicio no disponible',
  'Condiciones de pago',
  'Cliente canceló o postergó el embarque',
  'Sin respuesta del cliente',
  'Otra',
] as const

export type QuotationLossReason = (typeof QUOTATION_LOSS_REASONS)[number]
