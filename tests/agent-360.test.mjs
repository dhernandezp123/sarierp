import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { buildAgent360Snapshot } = loadTs('src/lib/agent-360.ts')

const quotations = [
  {
    id: 'q-1', quotation_number: 'COT-001', status: 'Ganada',
    origin: 'Shanghai', destination: 'Puerto Cortés',
    port_origin: null, port_destination: null,
    created_at: '2026-09-01T10:00:00Z', valid_until: '2026-09-30', client_name: 'Cliente Uno',
  },
  {
    id: 'q-2', quotation_number: 'COT-002', status: 'Enviada al Cliente',
    origin: 'Miami', destination: 'San Pedro Sula',
    port_origin: null, port_destination: null,
    created_at: '2026-09-02T10:00:00Z', valid_until: '2026-09-25', client_name: 'Cliente Dos',
  },
  {
    id: 'q-3', quotation_number: 'COT-003', status: 'Ganada',
    origin: 'Houston', destination: 'Tegucigalpa',
    port_origin: null, port_destination: null,
    created_at: '2026-09-03T10:00:00Z', valid_until: null, client_name: 'Cliente Tres',
  },
]

test('Agent 360 separa ofertas de selecciones y no duplica cotizaciones', () => {
  const snapshot = buildAgent360Snapshot({
    agentQuotes: [
      { quotation_id: 'q-1', is_selected: false, created_at: '2026-09-01T11:00:00Z' },
      { quotation_id: 'q-1', is_selected: true, created_at: '2026-09-01T12:00:00Z', carrier: 'MSC' },
      { quotation_id: 'q-2', is_selected: false, created_at: '2026-09-02T11:00:00Z' },
      { quotation_id: 'q-3', is_selected: true, created_at: '2026-09-03T11:00:00Z', deleted_at: '2026-09-04T00:00:00Z' },
    ],
    quotations,
    shipments: [],
    bookings: [],
  })

  assert.equal(snapshot.metrics.offeredQuotations, 2)
  assert.equal(snapshot.metrics.selectedQuotations, 1)
  assert.equal(snapshot.metrics.wonQuotations, 1)
  assert.equal(snapshot.quotations.find((item) => item.id === 'q-1')?.agent_carrier, 'MSC')
})

test('Agent 360 atribuye operaciones solo a la tarifa seleccionada y usa cierre canónico', () => {
  const snapshot = buildAgent360Snapshot({
    agentQuotes: [
      { quotation_id: 'q-1', is_selected: true, created_at: '2026-09-01T12:00:00Z' },
      { quotation_id: 'q-2', is_selected: false, created_at: '2026-09-02T12:00:00Z' },
    ],
    quotations,
    shipments: [
      {
        id: 's-1', shipment_number: 'RT-001', quotation_id: 'q-1', shipping_instruction_id: 'si-1',
        operational_status: 'En tránsito', origin: 'CNSHA', destination: 'HNPCR', closed_at: null,
        created_at: '2026-09-05T10:00:00Z', updated_at: '2026-09-08T10:00:00Z',
      },
      {
        id: 's-2', shipment_number: 'RT-002', quotation_id: 'q-1', shipping_instruction_id: 'si-2',
        operational_status: 'Finalizado', origin: 'CNSHA', destination: 'HNPCR',
        closed_at: '2026-09-10T10:00:00Z', created_at: '2026-09-06T10:00:00Z', updated_at: '2026-09-10T10:00:00Z',
      },
      {
        id: 's-other', shipment_number: 'RT-OTHER', quotation_id: 'q-2', shipping_instruction_id: 'si-3',
        operational_status: 'En tránsito', origin: 'Miami', destination: 'SPS', closed_at: null,
        created_at: '2026-09-07T10:00:00Z', updated_at: '2026-09-11T10:00:00Z',
      },
    ],
    bookings: [
      {
        id: 'b-1', shipment_id: 's-1', booking_number: 'BK-1', carrier_booking: null,
        carrier: 'MSC', shipment_status: 'Booking Confirmado', etd: '2026-09-15', eta: '2026-10-01',
        actual_etd: null, actual_eta: null, updated_at: '2026-09-12T10:00:00Z',
      },
      {
        id: 'b-other', shipment_id: 's-other', booking_number: 'BK-X', carrier_booking: null,
        carrier: 'OTRO', shipment_status: 'Booking Solicitado', etd: null, eta: null,
        actual_etd: null, actual_eta: null, updated_at: '2026-09-13T10:00:00Z',
      },
    ],
  })

  assert.deepEqual(snapshot.metrics, {
    offeredQuotations: 2,
    selectedQuotations: 1,
    wonQuotations: 1,
    shipments: 2,
    activeShipments: 1,
    bookings: 1,
    lastActivityAt: '2026-09-12T10:00:00Z',
  })
  assert.equal(snapshot.lanes[0].origin, 'CNSHA')
  assert.equal(snapshot.lanes[0].shipments, 2)
  assert.equal(snapshot.shipments.some((shipment) => shipment.id === 's-other'), false)
})
