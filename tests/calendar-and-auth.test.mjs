import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { formatDate, parseDateValue, toDateInputValue, calendarDaysUntil } = loadTs('src/lib/format.ts')
const { getLoginDestination } = loadTs('src/lib/auth-redirect.ts')

test('Honduras: fechas DATE, vencimientos y formularios conservan el día después de las 18:00', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Tegucigalpa'
  try {
    const lateToday = new Date('2026-09-08T01:30:00Z')
    assert.equal(toDateInputValue(lateToday), '2026-09-07')
    assert.equal(formatDate('2026-09-12'), '12/09/2026')
    assert.equal(calendarDaysUntil('2026-09-07', lateToday), 0)
    assert.equal(calendarDaysUntil('2026-09-08', lateToday), 1)
    assert.equal(calendarDaysUntil('2026-09-06', lateToday), -1)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Fechas imposibles no se convierten silenciosamente en otro mes', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', 'invalid']) {
    assert.equal(parseDateValue(date), null)
    assert.equal(formatDate(date), '-')
    assert.equal(calendarDaysUntil(date), null)
  }
  assert.equal(formatDate('2024-02-29'), '29/02/2024')
})

test('Los días de calendario sobreviven al cambio de horario de Miami', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.equal(calendarDaysUntil('2026-11-02', new Date(2026, 10, 1, 12)), 1)
    assert.equal(calendarDaysUntil('2026-03-09', new Date(2026, 2, 8, 12)), 1)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Login conserva filtros y fragmentos de rutas permitidas', () => {
  assert.equal(getLoginDestination('Ventas', '/quotations?status=Ganada#opciones'), '/quotations?status=Ganada#opciones')
  assert.equal(getLoginDestination('Pricing', '/pricing-comparison?id=123'), '/pricing-comparison?id=123')
  assert.equal(getLoginDestination('Cliente', '/portal?tab=envios'), '/portal?tab=envios')
  assert.equal(getLoginDestination('Cliente', '/portal/envios/123'), '/portal/envios/123')
})

test('Login valida la ruta normalizada y rechaza destinos externos o sin permisos', () => {
  for (const next of ['//evil.example', '/\\evil.example', '/\n/evil.example', 'https://evil.example', 'javascript:alert(1)', '/portal/../../admin/users']) {
    assert.equal(getLoginDestination('Cliente', next), '/portal')
  }
  for (const next of ['/portal/login?next=/portal', '/portal/reset-password/', '/portal/../portal/register', '/invoicing']) {
    assert.equal(getLoginDestination('Cliente', next), '/portal')
  }
  assert.equal(getLoginDestination('Ventas', '/operations/shipping-instructions/123/booking?x=1'), '/dashboard')
  assert.equal(getLoginDestination('Ventas', '/quotations/../admin/users'), '/dashboard')
  assert.equal(getLoginDestination('Ventas', '/invoicing'), '/dashboard')
})
