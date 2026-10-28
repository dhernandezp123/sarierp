import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { emitMeasurement, measureOperation } = loadTs('src/lib/browser/measurements.ts')

test('local measurements allow only names, outcomes and elapsed time; no private fields', async () => {
  const previous = globalThis.window, events = []
  globalThis.window = { dispatchEvent: event => events.push(event.detail) }
  try {
    emitMeasurement({ name: 'demo_form', stage: 'started', email: 'private@example.invalid', duration_ms: NaN })
    emitMeasurement({ name: 'private@example.invalid', stage: 'started' })
    assert.deepEqual(events, [{ name: 'demo_form', stage: 'started' }])
    const result = { value: 1 }
    assert.equal(await measureOperation('quotation_create', async () => result), result)
    assert.equal(events.at(-1).stage, 'succeeded')
    const failure = new Error('private exception')
    await assert.rejects(measureOperation('manual_invoice_pdf', async () => { throw failure }), error => error === failure)
    assert.equal(events.at(-1).stage, 'failed')
    assert.doesNotMatch(JSON.stringify(events), /private|email|exception/)
    assert.ok(events.at(-1).duration_ms >= 0)
  } finally { globalThis.window = previous }
})

test('a missing measurement listener/window does not affect business work', async () => {
  const previous = globalThis.window
  delete globalThis.window
  try { assert.equal(await measureOperation('demo_submit', async () => 'confirmed'), 'confirmed') }
  finally { globalThis.window = previous }
})
