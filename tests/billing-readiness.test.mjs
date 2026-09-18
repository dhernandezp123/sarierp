import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  billingQueueActionHref,
  billingReturnHref,
  operationsAreComplete,
} = loadTs('src/lib/billing-readiness.ts')

test('solo considera completa una cotizacion con todas sus operaciones cerradas', () => {
  assert.equal(operationsAreComplete([]), false)
  assert.equal(operationsAreComplete([
    { operational_status: 'Finalizado', closed_at: '2026-09-18T10:00:00Z' },
    { operational_status: 'Cancelado', closed_at: '2026-09-18T09:00:00Z' },
  ]), true)
  assert.equal(operationsAreComplete([
    { operational_status: 'Finalizado', closed_at: '2026-09-18T10:00:00Z' },
    { operational_status: 'Arribado', closed_at: null },
  ]), false)
})

test('solo acepta retornos internos a la bandeja de facturacion', () => {
  assert.equal(billingReturnHref('/invoicing?view=documents&bad=1'), '/invoicing?view=documents')
  assert.equal(billingReturnHref('https://evil.example/invoicing'), '/invoicing?view=work')
})

test('dirige cada bloqueo a su siguiente paso sin inventar una accion', () => {
  const base = {
    quotation_id: 'quote-1',
    primary_shipping_instruction_id: 'si-1',
  }
  assert.equal(
    billingQueueActionHref({ ...base, readiness_code: 'READY_TO_INVOICE' }, '/invoicing?view=work'),
    '/invoicing/new?quotation=quote-1&returnTo=%2Finvoicing%3Fview%3Dwork'
  )
  assert.equal(
    billingQueueActionHref({ ...base, readiness_code: 'COSTS_PENDING' }, '/invoicing?view=work'),
    '/cost-validation/quote-1?returnTo=%2Finvoicing%3Fview%3Dwork'
  )
  assert.equal(
    billingQueueActionHref({ ...base, readiness_code: 'CLIENT_DATA_MISSING' }, '/invoicing?view=work'),
    null
  )
})
