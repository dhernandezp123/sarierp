import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { buildDocumentationWorkspace } = loadTs(
  'src/lib/documentation-workspace.ts'
)

function baseInput(overrides = {}) {
  return {
    shippingInstructionId: 'si-1',
    bookingId: 'booking-1',
    routingNumber: 'SARI-SI-001',
    origin: 'Shanghai',
    destination: 'Puerto Cortés',
    shipperName: 'Proveedor',
    consigneeName: 'Cliente',
    bookingReference: 'MAEU123456',
    carrier: 'MAERSK',
    vesselName: 'VESSEL ONE',
    voyage: '001S',
    transportMode: 'Marítimo FCL',
    containerCount: 1,
    documentTypes: ['Booking Confirmation'],
    bills: [],
    readiness: {
      ready: true,
      blocking_count: 0,
      requirements: [],
    },
    isArrived: false,
    ...overrides,
  }
}

test('habilita crear MBL cuando existe una referencia de booking', () => {
  const items = buildDocumentationWorkspace(baseInput())
  const mbl = items.find((item) => item.id === 'mbl')

  assert.equal(mbl.status, 'not_started')
  assert.equal(mbl.action.label, 'Crear MBL')
  assert.match(mbl.action.href, /\/bl\/new\?type=MBL$/)
})

test('bloquea el HBL hasta validar el MBL', () => {
  const items = buildDocumentationWorkspace(
    baseInput({
      bills: [
        {
          id: 'mbl-1',
          bl_type: 'MBL',
          parent_bl_id: null,
          bl_number: 'MASTER-001',
          status: 'Draft',
        },
      ],
    })
  )
  const hbl = items.find((item) => item.id === 'hbl')

  assert.equal(hbl.status, 'blocked')
  assert.equal(hbl.action.label, 'Continuar MBL')
})

test('habilita crear HBL desde el MBL validado y conserva el parentBlId', () => {
  const items = buildDocumentationWorkspace(
    baseInput({
      bills: [
        {
          id: 'mbl-validated',
          bl_type: 'MBL',
          parent_bl_id: null,
          bl_number: 'MASTER-002',
          status: 'MBL Validado',
        },
      ],
    })
  )
  const hbl = items.find((item) => item.id === 'hbl')

  assert.equal(hbl.status, 'not_started')
  assert.equal(hbl.action.label, 'Crear HBL')
  assert.match(hbl.action.href, /parentBlId=mbl-validated$/)
})

test('expone los bloqueos de readiness sin declararlo completo', () => {
  const items = buildDocumentationWorkspace(
    baseInput({
      readiness: {
        ready: false,
        blocking_count: 2,
        requirements: [
          { label: 'Shipping Instructions enviadas', blocking: true },
          { label: 'Documentación completa', blocking: true },
        ],
      },
    })
  )
  const readiness = items.find((item) => item.id === 'readiness')

  assert.equal(readiness.status, 'blocked')
  assert.deepEqual(readiness.details, [
    'Pendiente: Shipping Instructions enviadas',
    'Pendiente: Documentación completa',
  ])
})
