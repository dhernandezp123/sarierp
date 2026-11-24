import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { realTransitDays } = loadTs('src/lib/booking-transit.ts')

test('cuenta días calendario entre salida y arribo reales', () => {
  assert.equal(realTransitDays('2026-12-05', '2027-01-02'), 28)
  assert.equal(realTransitDays('2026-12-05T23:30:00', '2026-12-06T01:00:00'), 1)
  assert.equal(realTransitDays('2026-12-05', '2026-12-05'), 0)
})

test('sin ambas fechas o con arribo anterior no calcula', () => {
  assert.equal(realTransitDays(null, '2027-01-02'), null)
  assert.equal(realTransitDays('2026-12-05', null), null)
  assert.equal(realTransitDays('2027-01-02', '2026-12-05'), null)
})

const { effectiveRemainingFreeDays, lastFreeDay } = loadTs('src/lib/booking-transit.ts')
const day = (value) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d, 12) }

test('el día de arribo cuenta como día 1', () => {
  const booking = { free_days: 14, actual_eta: '2027-01-02', remaining_free_days: 99 }
  assert.equal(effectiveRemainingFreeDays(booking, day('2027-01-02')), 14)
  assert.equal(effectiveRemainingFreeDays(booking, day('2027-01-15')), 1)
  assert.equal(effectiveRemainingFreeDays(booking, day('2027-01-16')), 0)
  assert.equal(effectiveRemainingFreeDays(booking, day('2027-01-20')), -4)
  assert.equal(lastFreeDay(booking).getDate(), 15)
})

test('antes del arribo o sin días libres conserva el valor capturado', () => {
  assert.equal(effectiveRemainingFreeDays({ free_days: 14, actual_eta: null, remaining_free_days: 10 }, day('2027-01-02')), 10)
  assert.equal(effectiveRemainingFreeDays({ free_days: null, actual_eta: '2027-01-02', remaining_free_days: 5 }, day('2027-01-10')), 5)
  assert.equal(effectiveRemainingFreeDays({ free_days: 14, actual_eta: '2027-01-05' }, day('2027-01-02')), 14)
  assert.equal(lastFreeDay({ free_days: 0, actual_eta: '2027-01-02' }), null)
})
