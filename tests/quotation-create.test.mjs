import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { createQuotation } = loadTs('src/lib/quotation-create.ts')

test('quotation creation keeps all child lines in the existing atomic RPC', async () => {
  const input = { quotation: { id: 'quote' }, containers: [{ quantity: 2 }], cargo: [], pricing: [{ amount: 12 }] }
  const calls = []
  const client = { rpc: async (...args) => { calls.push(args); return { data: [{ id: 'quote', quotation_number: 'Q-1' }] } } }
  assert.equal((await createQuotation(client, input)).id, 'quote')
  assert.deepEqual(calls, [['create_quotation_with_child_lines', {
    p_quotation_data: input.quotation, p_container_lines: input.containers, p_cargo_lines: [], p_pricing_items: input.pricing,
  }]])
})

test('unconfirmed or unrelated quotation creation never clears the form', async () => {
  const input = { quotation: { id: 'quote' }, containers: [], cargo: [{ quantity: 2 }], pricing: [] }
  for (const data of [null, [], [{ id: 'other', quotation_number: 'Q-1' }], [{ id: 'quote' }]]) {
    await assert.rejects(createQuotation({ rpc: async () => ({ data }) }, input), /Consulta el listado/)
  }
  await assert.rejects(createQuotation({ rpc: async () => ({ error: { message: 'Rejected' } }) }, input), /Rejected/)
})
