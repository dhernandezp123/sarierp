import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const dashboard = fs.readFileSync(
  'src/app/(protected)/operations/dashboard/page.tsx',
  'utf8'
)
const bookings = fs.readFileSync(
  'src/app/(protected)/operations/bookings/page.tsx',
  'utf8'
)

const canonicalShippingInstructionEmbed =
  'shipping_instruction:shipping_instructions!bookings_shipping_instruction_id_fkey'

test('operations booking queries select the canonical shipping instruction relationship', () => {
  assert.match(dashboard, new RegExp(canonicalShippingInstructionEmbed))
  assert.match(bookings, new RegExp(canonicalShippingInstructionEmbed))
  assert.doesNotMatch(
    dashboard,
    /shipping_instruction:shipping_instructions\s*\(/
  )
  assert.doesNotMatch(
    bookings,
    /shipping_instruction:shipping_instructions\s*\(/
  )
})

test('operations booking surfaces distinguish load errors from empty data', () => {
  assert.match(dashboard, /No se pudo cargar el Dashboard Operativo/)
  assert.match(dashboard, /Reintentar/)
  assert.match(bookings, /No se pudieron cargar los bookings/)
  assert.match(bookings, /No hay bookings activos\./)
  assert.match(bookings, /No hay bookings que coincidan con los filtros\./)
})

test('dashboard and booking tray share the canonical operational derivation', () => {
  assert.match(dashboard, /deriveBookingOperationalState/)
  assert.match(bookings, /deriveBookingOperationalState/)
  assert.match(dashboard, /get_booking_readiness_overview/)
  assert.match(bookings, /get_booking_readiness_overview/)
  assert.match(dashboard, /ETA críticas/)
  assert.match(dashboard, /Operaciones sin asignar/)
  assert.match(dashboard, /Estados por conciliar/)
  assert.match(bookings, /Todas las asignaciones/)
  assert.doesNotMatch(dashboard, /const requiredDocumentTypes/)
})
