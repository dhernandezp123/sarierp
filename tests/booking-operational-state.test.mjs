import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  deriveBookingOperationalState,
  getMissingBookingDocuments,
  inferBookingOperationalMode,
} = loadTs('src/lib/booking-operational-state.ts')

const completeBaseDocuments = [
  { document_type: 'Booking Confirmation' },
  { document_type: 'Packing List' },
  { document_type: 'Commercial Invoice' },
]

test('aplica requisitos documentales según modalidad sin exigir BL a terrestre', () => {
  const roadMissing = getMissingBookingDocuments({
    mode: 'ROAD_FTL',
    documents: completeBaseDocuments,
    bills: [],
  })
  const maritimeMissing = getMissingBookingDocuments({
    mode: 'SEA_FCL',
    documents: completeBaseDocuments,
    bills: [],
  })
  const maritimeWithoutHbl = getMissingBookingDocuments({
    mode: 'SEA_FCL',
    requiresHbl: false,
    documents: completeBaseDocuments,
    bills: [{ bl_type: 'MBL', status: 'MBL Validado' }],
  })

  assert.deepEqual(roadMissing, [])
  assert.deepEqual(maritimeMissing.map((item) => item.code), ['MASTER_BL', 'HOUSE_BL'])
  assert.deepEqual(maritimeWithoutHbl, [])
})

test('reconoce las modalidades canónicas y conserva UNKNOWN ante datos insuficientes', () => {
  assert.equal(inferBookingOperationalMode('Marítimo FCL'), 'SEA_FCL')
  assert.equal(inferBookingOperationalMode('Consolidado marítimo LCL'), 'SEA_LCL')
  assert.equal(inferBookingOperationalMode('Aéreo consolidado'), 'AIR')
  assert.equal(inferBookingOperationalMode('FTL terrestre'), 'ROAD_FTL')
  assert.equal(inferBookingOperationalMode(null), 'UNKNOWN')
})

test('una ETA pasada sin arribo es crítica y no desaparece por estar vencida', () => {
  const state = deriveBookingOperationalState({
    shipmentStatus: 'En Tránsito',
    bookingNumber: 'BK-001',
    carrierBooking: 'CB-001',
    etd: '2026-09-01',
    eta: '2026-09-10',
    assignedTo: 'profile-1',
    mode: 'ROAD_FTL',
    documents: completeBaseDocuments,
    bills: [],
    readiness: {
      ready: true,
      blocking_count: 0,
      warning_count: 0,
      overdue_cutoff_count: 0,
      missing_vgm_count: 0,
    },
    today: new Date(2026, 8, 18),
  })

  assert.equal(state.eta.kind, 'overdue')
  assert.equal(state.eta.days, -8)
  assert.equal(state.severity, 'critical')
  assert.equal(state.nextAction?.code, 'RECONCILE_ARRIVAL')
})

test('reconcilia el estado derivado con hechos sin sobrescribir el persistido', () => {
  const confirmed = deriveBookingOperationalState({
    shipmentStatus: 'Booking Solicitado',
    bookingNumber: 'BK-002',
    carrierBooking: 'CB-002',
    etd: '2026-09-20',
    eta: '2026-10-01',
    assignedTo: 'profile-1',
    mode: 'ROAD_LTL',
    documents: completeBaseDocuments,
    bills: [],
    readiness: null,
    today: new Date(2026, 8, 18),
  })
  const arrived = deriveBookingOperationalState({
    shipmentStatus: 'En Tránsito',
    bookingNumber: 'BK-003',
    carrierBooking: 'CB-003',
    etd: '2026-09-01',
    eta: '2026-09-15',
    actualEta: '2026-09-16',
    assignedTo: 'profile-1',
    mode: 'ROAD_LTL',
    documents: completeBaseDocuments,
    bills: [],
    readiness: null,
    today: new Date(2026, 8, 18),
  })

  assert.equal(confirmed.persistedStatus, 'Booking Solicitado')
  assert.equal(confirmed.displayStatus, 'Booking Confirmado')
  assert.equal(confirmed.hasStatusDrift, true)
  assert.equal(confirmed.isPendingConfirmation, false)
  assert.equal(arrived.displayStatus, 'Arribado')
  assert.equal(arrived.hasStatusDrift, true)
  assert.equal(arrived.nextAction?.code, 'RECONCILE_STATUS')
})

test('prioriza ownership antes del trabajo documental', () => {
  const state = deriveBookingOperationalState({
    shipmentStatus: 'Booking Solicitado',
    bookingNumber: null,
    carrierBooking: null,
    etd: null,
    eta: null,
    assignedTo: null,
    mode: 'SEA_FCL',
    documents: [],
    bills: [],
    readiness: {
      ready: false,
      blocking_count: 4,
      warning_count: 0,
      overdue_cutoff_count: 0,
      missing_vgm_count: 1,
    },
  })

  assert.equal(state.isUnassigned, true)
  assert.equal(state.nextAction?.code, 'ASSIGN_OPERATION')
  assert.equal(state.severity, 'warning')
})

test('una operación sin asignar no oculta una ETA vencida crítica', () => {
  const state = deriveBookingOperationalState({
    shipmentStatus: 'En Tránsito',
    bookingNumber: 'BK-004',
    carrierBooking: 'CB-004',
    etd: '2026-09-01',
    eta: '2026-09-10',
    assignedTo: null,
    mode: 'SEA_FCL',
    documents: completeBaseDocuments,
    bills: [
      { bl_type: 'MBL', status: 'MBL Validado' },
      { bl_type: 'HBL', status: 'Emitido' },
    ],
    readiness: {
      ready: true,
      blocking_count: 0,
      warning_count: 0,
      overdue_cutoff_count: 0,
      missing_vgm_count: 0,
    },
    today: new Date(2026, 8, 18),
  })

  assert.equal(state.isUnassigned, true)
  assert.equal(state.severity, 'critical')
  assert.equal(state.nextAction?.code, 'RECONCILE_ARRIVAL')
})
