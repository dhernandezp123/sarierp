export type BookingStatusLike = {
  shipment_status?: string | null
}

export function normalizeBookingStatus(status?: string | null) {
  return (status || '').trim()
}

export function isFinalBookingStatus(status?: string | null) {
  const normalized = normalizeBookingStatus(status)
  return normalized === 'Finalizado' || normalized === 'Cancelada'
}

/**
 * Temporary derived summary while Shipping Instruction keeps its legacy
 * status columns. Cancelled bookings are excluded unless every booking is
 * cancelled; no aggregate value is persisted back to Shipping Instruction.
 */
export function aggregateBookingStatus(
  bookings: BookingStatusLike[],
  fallbackStatus = 'Sin bookings'
) {
  if (bookings.length === 0) return fallbackStatus

  const statuses = bookings
    .map((booking) => normalizeBookingStatus(booking.shipment_status))
    .filter(Boolean)

  if (statuses.length === 0) return fallbackStatus
  if (statuses.every((status) => status === 'Cancelada')) return 'Cancelada'
  const activeStatuses = statuses.filter((status) => status !== 'Cancelada')

  if (activeStatuses.length === 0) {
    return 'Cancelada'
  }

  if (activeStatuses.every((status) => status === 'Finalizado')) {
    return 'Finalizado'
  }

  const arrivedStatuses = new Set(['Arribado', 'Finalizado'])
  if (activeStatuses.some((status) => arrivedStatuses.has(status))) {
    return activeStatuses.every((status) => arrivedStatuses.has(status))
      ? 'Arribado'
      : 'Arribo Parcial'
  }

  if (activeStatuses.includes('En Tránsito')) return 'En Tránsito'
  if (activeStatuses.includes('Embarcado')) return 'Embarcado'

  const confirmedStatuses = new Set([
    'Booking Confirmado',
    'Documentación Pendiente',
    'Listo para Embarque',
  ])
  if (activeStatuses.every((status) => confirmedStatuses.has(status))) {
    return 'Booking Confirmado'
  }

  if (
    activeStatuses.includes('Booking Solicitado') &&
    activeStatuses.some((status) => confirmedStatuses.has(status))
  ) {
    return 'Parcialmente Confirmado'
  }

  if (activeStatuses.every((status) => status === 'Booking Solicitado')) {
    return 'Booking Solicitado'
  }

  return 'En proceso'
}
