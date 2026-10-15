import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { isWonRepricing } = loadTs('src/lib/quotation-status.ts')
const { requiresNewCommercialOptionSelection, getClientVisibleQuotationOptions } = loadTs('src/lib/quotation-options.ts')

test('won quote with accepted B and draft insurance C does not request another customer choice', () => {
  const options = [{ id: 'a', status: 'No seleccionada', agent_quote_id: 'other' },
    { id: 'b', status: 'Aceptada', agent_quote_id: 'won-agent' },
    { id: 'c', status: 'Borrador', agent_quote_id: 'won-agent' }]
  for (const status of ['Pendiente de Fijar Precios', 'Pricing Aprobado']) {
    assert.equal(isWonRepricing(status, 'Ganada'), true)
    assert.equal(requiresNewCommercialOptionSelection(options, 'won-agent'), false)
  }
  assert.equal(requiresNewCommercialOptionSelection(options, 'other'), true)
  assert.equal(requiresNewCommercialOptionSelection(options.filter(o => o.id !== 'b'), 'won-agent'), true)
  assert.equal(requiresNewCommercialOptionSelection([], 'won-agent'), false)
  assert.equal(isWonRepricing('Pricing Aprobado', null), false)
})

test('client PDF uses the approved adjustment while retaining the historical winning snapshot', () => {
  const original = { id: 'b', status: 'No seleccionada', agent_quote_id: 'agent', items: [{ description: 'Freight' }] }
  const adjusted = { id: 'c', status: 'Aceptada', supersedes_option_id: 'b', agent_quote_id: 'agent', items: [{ description: 'Freight' }, { description: 'Insurance' }] }
  assert.deepEqual(getClientVisibleQuotationOptions([original, adjusted]), [adjusted])
  assert.deepEqual(original.items, [{ description: 'Freight' }])
})
