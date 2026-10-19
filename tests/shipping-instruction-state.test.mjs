import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { getShippingInstructionClient, mergeShippingInstructionMutation } = loadTs(
  'src/lib/shipping-instruction-state.ts'
)

test('SI y PDF usan el cliente vigente de la cotización después de cambiar de consignatario', () => {
  const previous = { id: 'bomohsa', nombre: 'BOMOHSA' }
  const current = { id: 'agrosoluciones', nombre: 'AGROSOLUCIONES INTEGRALES' }
  assert.equal(getShippingInstructionClient({
    cliente: previous, quotation: { cliente: current },
  }), current)
})

test('SI sin cliente de cotización conserva el cliente operativo legacy', () => {
  const cliente = { id: 'legacy', nombre: 'Cliente legacy' }
  assert.equal(getShippingInstructionClient({ cliente }), cliente)
  assert.equal(getShippingInstructionClient({ cliente, quotation: { cliente: null } }), cliente)
  assert.equal(getShippingInstructionClient({}), null)
})

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
