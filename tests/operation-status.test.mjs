import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  resolveShippingInstructionStatus,
  shippingInstructionFilterStatuses,
} = loadTs('src/lib/operation-status.ts')
const { aggregateBookingStatus } = loadTs('src/lib/booking-status.ts')

test('Shipping Instructions usa etiquetas de filtro que coinciden con el estado visible', () => {
  assert.equal(resolveShippingInstructionStatus({
    shipment_status: 'Pendiente Validaci\u00f3n',
    operational_status: 'Asignado',
  }), 'Asignado')
  assert.equal(resolveShippingInstructionStatus({
    shipment_status: 'Validada',
    operational_status: 'Validada',
  }), 'Listo para Booking')
  assert.equal(resolveShippingInstructionStatus({
    shipment_status: 'Booking Confirmado',
    operational_status: 'En Booking',
  }), 'Booking Confirmado')

  for (const status of ['Pendiente Validaci\u00f3n', 'Asignado', 'Listo para Booking', 'En Booking']) {
    assert.ok(shippingInstructionFilterStatuses.includes(status))
  }
  assert.ok(!shippingInstructionFilterStatuses.includes('Pendiente de Validaci\u00f3n'))
})

test('La bandeja representa el estado agregado de sus bookings', () => {
  const confirmed = aggregateBookingStatus([
    { shipment_status: 'Booking Confirmado' },
    { shipment_status: 'Documentaci\u00f3n Pendiente' },
  ])
  const partial = aggregateBookingStatus([
    { shipment_status: 'Booking Solicitado' },
    { shipment_status: 'Booking Confirmado' },
  ])

  assert.equal(confirmed, 'Booking Confirmado')
  assert.equal(partial, 'Parcialmente Confirmado')
  assert.ok(shippingInstructionFilterStatuses.includes(confirmed))
  assert.ok(shippingInstructionFilterStatuses.includes(partial))
})
