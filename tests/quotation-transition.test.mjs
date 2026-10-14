import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { quotationRevision, transitionQuotation } = loadTs('src/lib/quotation-transition.ts')
const { allowedTransitions, canTransitionForRole, isWonRepricing } = loadTs('src/lib/quotation-status.ts')

test('transitions send expected state/revision and trimmed reasons in one RPC', async () => {
  const calls = []
  const client = { rpc: async (...args) => {
    calls.push(args)
    return { data: { id: 'q1', status: 'Perdida', status_revision: 9, loss_reason: 'Otra', loss_reason_detail: 'Cancelado' }, error: null }
  } }
  const result = await transitionQuotation(client, { id: 'q1', status: 'Enviada al Cliente', status_revision: '8' }, 'Perdida', {
    reason: '  motivo  ', loss: { reason: 'Otra', detail: ' Cancelado ' },
  })
  assert.deepEqual(calls, [['transition_quotation', {
    p_quotation_id: 'q1', p_expected_status: 'Enviada al Cliente', p_expected_revision: 8,
    p_new_status: 'Perdida', p_reason: 'motivo', p_loss_reason: 'Otra', p_loss_detail: 'Cancelado', p_sync_operation: false,
  }]])
  assert.equal(result.loss_reason_detail, 'Cancelado')
})

test('unloaded/invalid revisions never send a mutation; zero is valid', async () => {
  assert.equal(quotationRevision({ status_revision: 0 }), 0)
  assert.equal(quotationRevision({ status_revision: '12' }), 12)
  for (const invalid of [undefined, null, '', ' ', -1, 1.2, '1.2', 'bad', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    let called = false
    await assert.rejects(transitionQuotation({ rpc: async () => { called = true } }, { id: 'q', status: 'Borrador', status_revision: invalid }, 'Pendiente de Fijar Precios'), /[Rr]ecarga/)
    assert.equal(called, false)
  }
})

test('a stale state/history transaction failure cannot produce a confirmed result', async () => {
  for (const message of ['La cotización cambió. Recarga antes de continuar', 'Simulated history failure']) {
    await assert.rejects(transitionQuotation({ rpc: async () => ({ error: { code: 'PT409', message }, data: null }) },
      { id: 'q', status: 'Borrador', status_revision: 0 }, 'Pendiente de Fijar Precios'), { message })
  }
  for (const data of [null, [], { id: 'other', status: 'Ganada', status_revision: 3 },
    { id: 'q', status: 'Perdida', status_revision: 3 }, { id: 'q', status: 'Ganada', status_revision: 2 },
    { id: 'q', status: 'Ganada' }]) {
    await assert.rejects(transitionQuotation({ rpc: async () => ({ data, error: null }) },
      { id: 'q', status: 'Enviada al Cliente', status_revision: 2 }, 'Ganada'), /[Rr]ecarga/)
  }
})

test('repricing approval includes the operational sync choice in the same RPC', async () => {
  let args
  const result = await transitionQuotation({ rpc: async (name, input) => {
    args = [name, input]
    return { data: { id: 'q', status: 'Ganada', status_revision: 7, total_cost: 100, total_sale: 150 }, error: null }
  } }, { id: 'q', status: 'Pendiente de Fijar Precios', status_revision: 6 }, 'Ganada', { reason: 'Nueva tarifa', syncOperation: true })
  assert.equal(args[1].p_sync_operation, true)
  assert.equal(result.total_sale, 150)
})

test('role hints preserve six current statuses and never offer historical transitions', () => {
  assert.equal(Object.keys(allowedTransitions).length, 6)
  for (const role of ['Operaciones', 'Contabilidad', 'Finanzas', 'Cliente', undefined]) {
    assert.equal(canTransitionForRole('Borrador', 'Pendiente de Fijar Precios', role), false)
  }
  assert.equal(canTransitionForRole('Pendiente de Fijar Precios', 'Pricing Aprobado', 'Ventas'), false)
  assert.equal(canTransitionForRole('Pendiente de Fijar Precios', 'Pricing Aprobado', 'Pricing'), true)
  assert.equal(canTransitionForRole('Enviada al Cliente', 'Ganada', 'Pricing'), false)
  assert.equal(canTransitionForRole('Enviada al Cliente', 'Ganada', 'Ventas'), true)
  assert.equal(canTransitionForRole('Pricing Aprobado', 'Enviada al Cliente', 'Admin'), true)
  assert.equal(canTransitionForRole('Solicitud', 'Pendiente de Fijar Precios', 'Admin'), false)
  assert.equal(canTransitionForRole('Perdida', 'Pendiente de Fijar Precios', 'Admin'), false)
})

test('a pre-sale reopening cannot be closed as won based on old logs or an operation', () => {
  assert.equal(isWonRepricing('Pendiente de Fijar Precios', 'Ganada'), true)
  for (const [status, previous] of [['Pendiente de Fijar Precios', undefined],
    ['Pendiente de Fijar Precios', 'Pricing Aprobado'], ['Pricing Aprobado', 'Ganada'], ['Ganada', 'Ganada']]) {
    assert.equal(isWonRepricing(status, previous), false)
  }
})
