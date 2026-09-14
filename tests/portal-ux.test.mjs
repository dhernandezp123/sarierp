import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { portalPackageStatus, portalTrackingFilter, portalDeadline, convertPortalDimension, positivePortalNumber } = loadTs('src/lib/portal.ts')

test('portal separates transport from assignment and preserves delivery', () => {
  assert.equal(portalPackageStatus({ status: 'Asignado', cargo_status: 'En Tránsito' }), 'En Tránsito')
  assert.equal(portalPackageStatus({ status: 'Asignado' }), 'Asignado a envío')
  assert.equal(portalPackageStatus({ status: 'Entregado', cargo_status: 'En Tránsito' }), 'Entregado')
  assert.equal(portalPackageStatus({ status: 'Con incidencia', cargo_status: 'Llegado Honduras' }), 'Llegado Honduras')
})

test('tracking filters quote punctuation and escape literal SQL wildcard characters', () => {
  assert.equal(portalTrackingFilter('  1Z,000(25)  '), 'tracking_number.ilike."%1Z,000(25)%",warehouse_number.ilike."%1Z,000(25)%"')
  const filter = portalTrackingFilter('AB%_"\\')
  const quotedPattern = filter.slice('tracking_number.ilike.'.length, filter.indexOf(',warehouse_number'))
  assert.equal(JSON.parse(quotedPattern), '%AB\\%\\_"\\\\%')
  assert.equal((filter.match(/\.ilike\./g) || []).length, 2)
})

test('deadlines use the labelled zone, including daylight saving and invalid-zone fallback', () => {
  const summer = portalDeadline('2026-09-15T15:00:00Z', 'America/New_York')
  assert.match(summer, /11:00/)
  assert.match(summer, /America\/New_York/)
  assert.match(portalDeadline('2026-01-15T15:00:00Z', 'America/New_York'), /10:00/)
  assert.match(portalDeadline('2026-09-15T15:00:00Z', 'America/Tegucigalpa'), /09:00/)
  assert.match(portalDeadline('2026-09-15T15:00:00Z', 'invalid'), /15:00.*UTC/)
  assert.equal(portalDeadline(null), 'Por confirmar')
  assert.equal(portalDeadline('invalid'), 'Fecha por confirmar')
})

test('switching dimensions keeps the physical volume and does not manufacture invalid measures', () => {
  assert.equal(convertPortalDimension('12', 'in', 'cm'), '30.48')
  assert.equal(convertPortalDimension('30.48', 'cm', 'in'), '12')
  let value = '12.5'
  for (let i = 0; i < 20; i++) value = convertPortalDimension(convertPortalDimension(value, 'in', 'cm'), 'cm', 'in')
  assert.equal(value, '12.5')
  assert.equal(convertPortalDimension('', 'in', 'cm'), '')
  for (const invalid of ['-1', '0', 'Infinity', 'NaN', '12x']) assert.equal(positivePortalNumber(invalid), 0)
  assert.equal(positivePortalNumber('0.125'), 0.125)
})
