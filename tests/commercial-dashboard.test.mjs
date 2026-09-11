import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { isInCreationPeriod, previousCreationPeriod, summarizeCommercialQuotes, commercialChange } = loadTs('src/lib/commercial-dashboard.ts')

test('Dashboard respeta año completo, fechas locales y rangos inválidos', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Tegucigalpa'
  try {
    assert.equal(isInCreationPeriod('2026-01-15T12:00:00Z', '2026-01-01', '2026-09-11'), true)
    assert.equal(isInCreationPeriod('2026-09-01T01:00:00Z', '2026-09-01', '2026-09-30'), false)
    assert.equal(isInCreationPeriod('2026-10-01T01:00:00Z', '2026-09-01', '2026-09-30'), true)
    assert.equal(isInCreationPeriod('2026-09-05', '2026-09-11', '2026-09-01'), false)
    assert.equal(isInCreationPeriod(null, '2026-09-01', ''), false)
    assert.equal(isInCreationPeriod(null, '', ''), true)
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Comparación usa días equivalentes incluso al cruzar mes, año o cambio de hora', () => {
  assert.deepEqual(previousCreationPeriod('2026-09-01', '2026-09-11'), { from: '2026-08-21', to: '2026-08-31' })
  assert.deepEqual(previousCreationPeriod('2026-01-01', '2026-01-01'), { from: '2025-12-31', to: '2025-12-31' })
  assert.equal(previousCreationPeriod('', ''), null)
  assert.equal(previousCreationPeriod('2026-09-11', '2026-09-01'), null)
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.deepEqual(previousCreationPeriod('2026-03-08', '2026-03-09'), { from: '2026-03-06', to: '2026-03-07' })
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('Margen ponderado y cierre excluyen borradores y oportunidades abiertas', () => {
  const rows = [
    { status: 'Ganada', sale: 100, profit: 50 },
    { status: 'Ganada', sale: 900, profit: 90 },
    { status: 'Perdida', sale: 700, profit: 100 },
    { status: 'Borrador', sale: 2000, profit: 400 },
    { status: 'Pendiente de Fijar Precios', sale: 300, profit: 10 },
    { status: 'Pricing Aprobado', sale: 500, profit: 100 },
    { status: 'Enviada al Cliente', sale: 200, profit: 20 },
  ]
  const summary = summarizeCommercialQuotes(rows, (row) => row)
  assert.equal(summary.wonSale, 1000)
  assert.equal(summary.wonProfit, 140)
  assert.ok(Math.abs(summary.margin - 14) < 1e-10)
  assert.equal(summary.openSale, 1000)
  assert.equal(summary.closeRate, 2 / 3 * 100)
  const empty = summarizeCommercialQuotes([], (row) => row)
  assert.equal(empty.margin, null)
  assert.equal(empty.closeRate, null)
})

test('Variaciones sin base y tasas en puntos porcentuales no inventan crecimiento', () => {
  assert.equal(commercialChange(100, 0), 'Sin base comparable')
  assert.equal(commercialChange(100, -10), 'Sin base comparable')
  assert.equal(commercialChange(0, 0), 'Sin variación')
  assert.equal(commercialChange(null, 50, true), 'Sin base comparable')
  assert.equal(commercialChange(75, 50, true), '+25.0 pp')
  assert.equal(commercialChange(120, 100), '+20.0%')
})
