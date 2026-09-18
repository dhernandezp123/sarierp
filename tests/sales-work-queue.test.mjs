import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { buildSalesWorkQueue } = loadTs('src/lib/sales-work-queue.ts')
const today = new Date(2026, 8, 18)

test('Mi día prioriza seguimientos vencidos y conserva solo la actividad más reciente por cuenta', () => {
  const queue = buildSalesWorkQueue({
    today,
    activities: [
      {
        id: 'old',
        cliente_id: 'client-1',
        clientName: 'Acme',
        fecha_actividad: '2026-09-01',
        proxima_accion: 'Acción vieja',
        fecha_proxima_accion: '2026-09-02',
      },
      {
        id: 'latest',
        cliente_id: 'client-1',
        clientName: 'Acme',
        fecha_actividad: '2026-09-15',
        proxima_accion: 'Confirmar decisión',
        fecha_proxima_accion: '2026-09-17',
      },
    ],
    quotations: [],
    leads: [],
  })

  assert.equal(queue.length, 1)
  assert.equal(queue[0].sourceId, 'latest')
  assert.equal(queue[0].severity, 'critical')
  assert.equal(queue[0].agingDays, 1)
})

test('usa el último cambio de estado para medir aging y escala una cotización enviada', () => {
  const queue = buildSalesWorkQueue({
    today,
    activities: [],
    leads: [],
    quotations: [{
      id: 'quote-1',
      quotation_number: 'COT-100',
      status: 'Enviada al Cliente',
      created_at: '2026-01-01T12:00:00Z',
      clientName: 'Cliente Uno',
      statusHistory: [
        { new_status: 'Pricing Aprobado', created_at: '2026-08-01T12:00:00Z' },
        { new_status: 'Enviada al Cliente', created_at: '2026-09-03T12:00:00Z' },
      ],
    }],
  })

  assert.equal(queue[0].title, 'Esperando respuesta del cliente')
  assert.equal(queue[0].agingDays, 15)
  assert.equal(queue[0].severity, 'critical')
  assert.equal(queue[0].lastChangeAt, '2026-09-03T12:00:00Z')
})

test('una cotización ganada sin shipment encabeza el handoff comercial', () => {
  const queue = buildSalesWorkQueue({
    today,
    activities: [],
    leads: [],
    quotations: [{
      id: 'quote-2',
      quotation_number: 'COT-200',
      status: 'Ganada',
      shipmentCount: 0,
      created_at: '2026-09-17T12:00:00Z',
      statusHistory: [{ new_status: 'Ganada', created_at: '2026-09-17T12:00:00Z' }],
    }],
  })

  assert.equal(queue[0].category, 'handoff')
  assert.equal(queue[0].severity, 'critical')
  assert.equal(queue[0].nextAction, 'Crear Shipping Instruction')
})

test('un lead deja de aparecer cuando ya existe gestión del prospecto', () => {
  const queue = buildSalesWorkQueue({
    today,
    activities: [{
      id: 'activity-1',
      empresa_prospecto: 'Logística Demo',
      fecha_actividad: '2026-09-18',
    }],
    quotations: [],
    leads: [{
      id: 'lead-1',
      nombre: 'Ana',
      empresa: 'Logística Demo',
      created_at: '2026-09-17T12:00:00Z',
    }],
  })

  assert.deepEqual(queue, [])
})

