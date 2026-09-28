import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { mergeShippingInstructionMutation } = loadTs(
  'src/lib/shipping-instruction-state.ts'
)

test('preserva cotizacion y cliente embebidos al aplicar la fila devuelta por un RPC', () => {
  const quotation = {
    id: 'quotation-1',
    quotation_number: 'COT-001',
    cliente: { id: 'client-1', nombre: 'Cliente prueba' },
  }
  const cliente = quotation.cliente
  const current = {
    id: 'si-1',
    supplier_name: null,
    carrier: 'MAERSK',
    quotation,
    cliente,
  }

  const merged = mergeShippingInstructionMutation(current, {
    id: 'si-1',
    supplier_name: 'Proveedor actualizado',
    carrier: null,
  })

  assert.equal(merged.supplier_name, 'Proveedor actualizado')
  assert.equal(merged.carrier, null)
  assert.equal(merged.quotation, quotation)
  assert.equal(merged.cliente, cliente)
  assert.notEqual(merged, current)
})

test('usa el resultado del RPC sin contexto previo', () => {
  const updated = { id: 'si-1', supplier_name: 'Proveedor' }

  assert.equal(mergeShippingInstructionMutation(null, updated), updated)
})
