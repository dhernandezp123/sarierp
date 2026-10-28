import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'
import { pagedClient } from './paged-client.mjs'
import { miamiFixture } from './read-error-fixture.mjs'

const { miamiDayRange, formatMiamiDateTime } = loadTs('src/lib/format.ts')
const { loadMiamiDashboard } = loadTs('src/lib/miami-dashboard.ts')
const zones = ['America/Tegucigalpa', 'America/New_York', 'UTC', 'Asia/Tokyo']
async function inZone(zone, fn) {
  const previous = process.env.TZ
  process.env.TZ = zone
  try { return await fn() } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
}

const cases = [
  ['2026-01-15T03:30:00Z', '2026-01-14T05:00:00.000Z', '2026-01-15T05:00:00.000Z', 24],
  ['2026-07-15T03:30:00Z', '2026-07-14T04:00:00.000Z', '2026-07-15T04:00:00.000Z', 24],
  ['2026-03-08T05:00:00Z', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
  ['2026-11-01T04:00:00Z', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
  ['2026-01-01T02:00:00Z', '2025-12-31T05:00:00.000Z', '2026-01-01T05:00:00.000Z', 24],
  ['2024-02-29T17:00:00Z', '2024-02-29T05:00:00.000Z', '2024-03-01T05:00:00.000Z', 24],
]
test('Miami: medianoches reales, días de 23/25 horas y cambio de año no dependen de la zona del navegador', async () => {
  for (const zone of zones) await inZone(zone, () => {
    for (const [instant, start, end, hours] of cases) {
      const range = miamiDayRange(new Date(instant))
      assert.deepEqual(range, { start, end }, `${zone}: ${instant}`)
      assert.equal((Date.parse(range.end) - Date.parse(range.start)) / 3_600_000, hours)
    }
    // Ambas 01:30 del cambio de horario pertenecen al mismo día.
    assert.deepEqual(miamiDayRange(new Date('2026-11-01T05:30:00Z')), miamiDayRange(new Date('2026-11-01T06:30:00Z')))
    assert.equal(miamiDayRange(new Date('2026-03-09T03:59:59.999Z')).start, '2026-03-08T05:00:00.000Z')
    assert.equal(miamiDayRange(new Date('2026-03-09T04:00:00Z')).start, '2026-03-09T04:00:00.000Z')
  })
  assert.throws(() => miamiDayRange(new Date('invalid')), /día de Miami/)
})

test('Miami: ambos contadores de hoy usan >= inicio y < próxima medianoche con tenant, sin tocar timestamps', async () => {
  for (const [instant, start, end] of cases) {
    const rows = [
      { stamp: new Date(Date.parse(start) - 1).toISOString() }, { stamp: start },
      { stamp: new Date(Date.parse(end) - 1).toISOString() }, { stamp: end },
      { stamp: new Date(Date.parse(end) + 86_400_000).toISOString() },
    ]
    const original = structuredClone(rows), f = miamiFixture()
    f.respond((index, call) => {
      if (index >= 4) return { data: [], count: null, error: null }
      if (index !== 1 && index !== 3) return { data: null, count: 10, error: null }
      const column = index === 1 ? 'assigned_at' : 'received_at'
      assert.deepEqual(call.comparisons, [['gte', column, start], ['lt', column, end]])
      assert.ok(call.filters.some(([f, v]) => f === 'tenant_id' && v === 'tenant-A'))
      const count = rows.filter(row => call.comparisons.every(([op, , value]) => op === 'gte' ? row.stamp >= value : row.stamp < value)).length
      return { data: null, error: null, count }
    })
    const data = await loadMiamiDashboard(f.client, 'tenant-A', new Date(instant))
    assert.equal(data.metrics.asignadosHoy, 2)
    assert.equal(data.metrics.recibidosHoy, 2)
    assert.equal(data.metrics.sinAsignar, 10)
    assert.deepEqual(rows, original)
  }
  const f = miamiFixture()
  await assert.rejects(loadMiamiDashboard(f.client, 'tenant-A', new Date('invalid')))
  assert.equal(f.calls.length, 0)
})

test('Miami: fechas visibles del dashboard usan calendario de bodega y formato DD/MM/YYYY', async () => {
  await inZone('America/Tegucigalpa', async () => {
    const f = miamiFixture()
    f.respond(index => ({ count: index < 4 ? 1 : null, error: null, data: index < 4 ? null : index === 4
      ? [{ id: 'manifest', manifest_number: 'MAN-1', total_packages: 1, created_at: '2026-10-15T04:30:00Z' }]
      : [{ id: 'package', tracking_number: 'TRACK-1', received_at: '2026-10-15T04:30:00Z' }] }))
    const app = mountPage('src/app/(protected)/miami/page.tsx', f.mocks)
    try {
      await app.ready()
      assert.equal((app.text().match(/15\/10\/2026/g) || []).length, 2)
      assert.equal((app.text().match(/hora Miami/g) || []).length, 2)
      assert.doesNotMatch(app.text(), /14\/10\/2026/)
      assert.match(app.text(), /America\/New_York/)
    } finally { app.cleanup() }
  })
  const instant = '2026-10-15T04:30:00Z'
  assert.match(formatMiamiDateTime(instant), /octubre/)
  assert.match(formatMiamiDateTime(instant, '-', { numericDate: true }), /15\/10\/2026/)
  assert.equal(formatMiamiDateTime('invalid', '-', { numericDate: true }), '-')
})

const history = (rows, agents = []) => mountPage('src/app/(protected)/historico/page.tsx', {
  '../../../lib/supabase/client': { supabase: pagedClient({ quotations: rows, agent_quotes: agents }) },
})
const quote = (id, created_at) => ({ id, quotation_number: 'Q-' + id, created_at, status: 'Borrador', deleted_at: null })
function period(app, from, to) {
  app.find(n => n.type === 'input' && n.props.type === 'date' && n.props.value === '').props.onChange({ target: { value: from } }); app.render()
  app.find(n => n.type === 'input' && n.props.type === 'date' && n.props.value === '').props.onChange({ target: { value: to } }); app.render()
}

test('Histórico: filtro del día de Honduras incluye madrugada UTC y excluye ambas medianoches exteriores', async () => {
  await inZone('America/Tegucigalpa', async () => {
    const rows = [quote('before', '2026-10-14T05:59:59.999Z'), quote('start', '2026-10-14T06:00:00Z'),
      quote('late', '2026-10-15T01:30:00Z'), quote('end', '2026-10-15T05:59:59.999Z'), quote('after', '2026-10-15T06:00:00Z'),
      quote('offset', '2026-10-14T23:30:00-04:00'), quote('invalid', 'invalid'), quote('missing', null)]
    const original = structuredClone(rows), app = history(rows)
    try {
      await app.ready(); period(app, '2026-10-14', '2026-10-14')
      for (const id of ['start', 'late', 'end', 'offset']) assert.match(app.text(), new RegExp('Q-' + id))
      for (const id of ['before', 'after', 'invalid', 'missing']) assert.doesNotMatch(app.text(), new RegExp('Q-' + id))
      assert.equal(app.find(n => n.type === 'Pagination').props.total, 4)
      assert.match(app.text(), /14\/10\/2026/)
      assert.deepEqual(rows, original)
      app.button('Limpiar filtros').props.onClick(); app.render()
      assert.equal(app.find(n => n.type === 'Pagination').props.total, 8)
    } finally { app.cleanup() }
  })
})

test('Histórico: filtro y fecha visible comparten calendario local en Miami, UTC y Tokio', async () => {
  for (const [zone, day] of [['America/New_York', '2026-10-14'], ['UTC', '2026-10-15'], ['Asia/Tokyo', '2026-10-15']]) {
    await inZone(zone, async () => {
      const app = history([quote('local', '2026-10-15T01:30:00Z')])
      try {
        await app.ready(); period(app, day, day)
        assert.match(app.text(), /Q-local/)
        assert.match(app.text(), day.endsWith('14') ? /14\/10\/2026/ : /15\/10\/2026/)
      } finally { app.cleanup() }
    })
  }
})

test('Histórico: rango invertido no incluye filas y el filtro de una sola fecha respeta el calendario', async () => {
  await inZone('America/Tegucigalpa', async () => {
    const app = history([quote('local', '2026-10-15T01:30:00Z')])
    try {
      await app.ready(); period(app, '2026-10-14', '')
      assert.match(app.text(), /Q-local/)
      app.find(n => n.type === 'input' && n.props.type === 'date' && n.props.value === '').props.onChange({ target: { value: '2026-10-13' } }); app.render()
      assert.doesNotMatch(app.text(), /Q-local/)
    } finally { app.cleanup() }
  })
})

test('Histórico: vigencia de ocho días tras DST no se reduce a siete y fechas imposibles no se muestran', async () => {
  await inZone('America/New_York', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-03-08T17:00:00Z') })
    const rows = [quote('valid', '2026-03-08T12:00:00Z'), quote('invalid', '2026-03-08T12:00:00Z')]
    const app = history(rows, [
      { id: 'a', quotation_id: 'valid', is_selected: true, valid_until: '2026-03-16' },
      { id: 'b', quotation_id: 'invalid', is_selected: true, valid_until: '2026-02-30' },
    ])
    try {
      await app.ready()
      const validity = app.find(n => n.type === 'span' && app.text(n) === '16/03/2026')
      assert.ok(validity)
      assert.match(validity.props.className, /bg-slate-100/)
      assert.doesNotMatch(app.text(), /Invalid Date|02\/03\/2026/)
    } finally { app.cleanup(); mock.timers.reset() }
  })
})

test('CxP: listado conserva el vencimiento canónico de Honduras aunque el navegador ya esté en otro día', async () => {
  const row = { id: 'ap', tipo: 'AP', parent_ap_id: null, descripcion: 'Vence hoy Honduras', monto: 100, moneda: 'USD',
    fecha_vencimiento: '2026-10-14', as_of_date: '2026-10-14', status: 'Pendiente', stored_status: 'Pendiente', days_overdue: 0,
    total_adjusted: 100, pending_balance: 100, paid_total: 0, paid_this_month: 0, proveedores: { nombre: 'Proveedor' } }
  for (const zone of zones) await inZone(zone, async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-15T04:30:00Z') })
    const app = mountPage('src/app/(protected)/accounts-payable/page.tsx', { '@/src/lib/supabase/client': { supabase: pagedClient({ supplier_payable_balances: [row] }) } })
    try {
      await app.ready()
      assert.match(app.text(), /14\/10\/2026/)
      assert.match(app.text(), /Pendiente/)
      assert.doesNotMatch(app.text(), /día.*vencida/)
      app.find(n => n.type === 'select' && n.props.value === 'Pendientes').props.onChange({ target: { value: 'Vencidas' } }); app.render()
      assert.doesNotMatch(app.text(), /Vence hoy Honduras/)
    } finally { app.cleanup(); mock.timers.reset() }
  })
})
