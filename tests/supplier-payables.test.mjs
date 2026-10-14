import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

test('los reversos permanecen en historial pero no en los importes pagados', () => {
  const { appliedSupplierPayments } = loadTs('src/lib/supplier-payables.ts')
  const rows = [{ monto: 60, status: 'Aplicado' }, { monto: 40, status: 'Reversado' }]
  assert.equal(rows.length, 2)
  assert.deepEqual(appliedSupplierPayments(rows), [rows[0]])
  assert.equal(appliedSupplierPayments(rows).reduce((total, row) => total + row.monto, 0), 60)
  assert.deepEqual(appliedSupplierPayments(null), [])
})

test('un resultado incierto conserva la clave al reintentar y reconstruir el cliente', () => {
  const data = new Map()
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  const first = loadTs('src/lib/supplier-payables.ts')
  assert.equal(first.supplierActionKey('tenant:user:account:pay', storage, () => 'key-1'), 'key-1')
  assert.equal(first.supplierActionKey('tenant:user:account:pay', storage, () => 'key-2'), 'key-1')
  const reloaded = loadTs('src/lib/supplier-payables.ts')
  assert.equal(reloaded.supplierActionKey('tenant:user:account:pay', storage, () => 'key-3'), 'key-1')
  reloaded.completeSupplierAction('tenant:user:account:pay', 'other-key', storage)
  assert.equal(reloaded.pendingSupplierActionKey('tenant:user:account:pay', storage), 'key-1')
  reloaded.completeSupplierAction('tenant:user:account:pay', 'key-1', storage)
  assert.equal(reloaded.supplierActionKey('tenant:user:account:pay', storage, () => 'key-4'), 'key-4')
  assert.equal(reloaded.supplierActionKey('tenant:user:account:note', storage, () => 'note-key'), 'note-key')
  assert.equal(reloaded.supplierActionKey('tenant:other:account:pay', storage, () => 'other-user'), 'other-user')
})

test('un almacenamiento bloqueado no crea claves nuevas durante los reintentos', () => {
  const h = loadTs('src/lib/supplier-payables.ts')
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.equal(h.supplierActionKey('blocked', storage, () => 'same-key'), 'same-key')
  assert.equal(h.supplierActionKey('blocked', storage, () => 'different'), 'same-key')
  h.completeSupplierAction('blocked', 'same-key', storage)
  assert.equal(h.pendingSupplierActionKey('blocked', storage), null)
})
