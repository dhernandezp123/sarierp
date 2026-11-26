import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { getShippingInstructionHandoffAccess: access } = loadTs('src/lib/shipping-instruction-state.ts')
const pending = {
  created_by: 'creator', sales_submitted_at: null, operations_accepted_at: null,
  operations_assigned_to: null, operational_status: 'Pendiente Validación',
  shipment_status: 'Pendiente Validación',
}

test('Admin puede enviar expedientes propios y ajenos, incluso ya asignados', () => {
  for (const created_by of ['admin', 'creator']) {
    for (const operational_status of ['Pendiente Validación', 'Asignado']) {
      assert.equal(access('Admin', 'admin', { ...pending, created_by, operational_status }).canSubmit, true)
    }
  }
})

test('Admin completa envio y aceptacion; Operaciones conserva restriccion de responsable', () => {
  assert.equal(access('Admin', 'admin', pending).canAccept, false)
  const submitted = { ...pending, sales_submitted_at: '2026-11-23', operations_assigned_to: 'ops' }
  assert.deepEqual(access('Admin', 'admin', submitted), { canSubmit: false, canAccept: true })
  assert.equal(access('Operaciones', 'ops', submitted).canAccept, true)
  assert.equal(access('Operaciones', 'other', submitted).canAccept, false)
  assert.equal(access('Admin', 'admin', { ...submitted, operations_accepted_at: '2026-11-23' }).canAccept, false)
})

test('Ventas conserva propiedad; otros roles no pueden enviar ni aceptar', () => {
  assert.equal(access('Ventas', 'creator', pending).canSubmit, true)
  assert.equal(access('Ventas', 'other', pending).canSubmit, false)
  for (const role of ['Finanzas', 'Pricing', 'Operaciones', null]) {
    assert.deepEqual(access(role, 'creator', pending), { canSubmit: false, canAccept: false })
  }
  assert.deepEqual(access('Admin', undefined, pending), { canSubmit: false, canAccept: false })
})

test('ningun rol reabre expedientes cerrados mediante envio o aceptacion', () => {
  for (const role of ['Admin', 'Ventas', 'Operaciones']) {
    for (const status of ['Finalizado', 'Cancelada']) {
      for (const field of ['operational_status', 'shipment_status']) {
        for (const sales_submitted_at of [null, '2026-11-23']) {
          assert.deepEqual(access(role, 'creator', { ...pending, [field]: status, sales_submitted_at }),
            { canSubmit: false, canAccept: false })
        }
      }
    }
  }
})
