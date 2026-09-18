import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  buildOperationsControlTower,
  filterOperationsControlTower,
} = loadTs('src/lib/operations-control-tower.ts')

function state(patch = {}) {
  return {
    persistedStatus: 'Booking Confirmado',
    displayStatus: 'Booking Confirmado',
    hasStatusDrift: false,
    statusDriftReason: null,
    isFinal: false,
    isUnassigned: false,
    isPendingConfirmation: false,
    missingDocuments: [],
    eta: { kind: 'scheduled', days: 20, label: '08/10/2026', date: '2026-10-08' },
    severity: 'normal',
    attentionReason: null,
    nextAction: { code: 'CONTINUE_OPERATION', label: 'Continuar operación', target: 'booking_header' },
    ...patch,
  }
}

function source(id, patch = {}) {
  return {
    id,
    shippingInstructionId: `si-${id}`,
    bookingLabel: `BK-${id}`,
    routingNumber: `RT-${id}`,
    clientName: `Cliente ${id}`,
    createdAt: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-02T12:00:00Z',
    state: state(),
    readinessAlerts: [],
    ...patch,
  }
}

test('la torre reutiliza la alerta crítica de readiness y la ubica primero', () => {
  const queue = buildOperationsControlTower([
    source('normal'),
    source('cutoff', {
      readinessAlerts: [{
        alert_key: 'cutoff-1',
        severity: 'CRITICAL',
        alert_code: 'CUTOFF_OVERDUE',
        title: 'Cut-off documental vencido',
        description: 'El cut-off venció sin evidencia.',
        due_at: '2026-09-17T12:00:00Z',
      }],
    }),
  ], new Date(2026, 8, 18))

  assert.equal(queue[0].id, 'cutoff')
  assert.equal(queue[0].level, 'immediate')
  assert.equal(queue[0].reason, 'Cut-off documental vencido')
  assert.equal(queue[0].actionTarget, 'booking_readiness')
})

test('calcula aging desde el último evento operativo, no desde la creación', () => {
  const queue = buildOperationsControlTower([
    source('event', {
      lastEvent: {
        eventLabel: 'Booking confirmado',
        occurredAt: '2026-09-16T14:00:00Z',
      },
    }),
  ], new Date(2026, 8, 18))

  assert.equal(queue[0].agingDays, 2)
  assert.equal(queue[0].lastChangeLabel, 'Booking confirmado')
})

test('sin asignar es trabajo inmediato y conserva filtros operativos', () => {
  const queue = buildOperationsControlTower([
    source('unassigned', {
      state: state({
        isUnassigned: true,
        severity: 'warning',
        attentionReason: 'Operación sin responsable asignado',
        nextAction: { code: 'ASSIGN_OPERATION', label: 'Asignar operación', target: 'shipping_instruction' },
      }),
    }),
    source('other'),
  ], new Date(2026, 8, 18))

  assert.equal(queue[0].id, 'unassigned')
  assert.equal(queue[0].level, 'immediate')
  assert.deepEqual(
    filterOperationsControlTower(queue, 'unassigned', '').map((item) => item.id),
    ['unassigned']
  )
  assert.deepEqual(
    filterOperationsControlTower(queue, 'all', 'cliente other').map((item) => item.id),
    ['other']
  )
})

