import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { readAllReportRows } = loadTs('src/lib/report-query.ts')
const { defaultReportView, readReportView, reportViewQuery, reportDateRange, reportDateMatches, reportSortValue, reportCsvCell } = loadTs('src/lib/report-view.ts')

test('report loader retrieves all rows when the server caps responses below the requested size', async () => {
  const source = Array.from({ length: 1301 }, (_, index) => ({ id: 'id-' + index, amount: 1 }))
  const offsets = []
  const result = await readAllReportRows(async (from) => {
    offsets.push(from)
    return { data: source.slice(from, from + 100), error: null }
  }, { label: 'test' })
  assert.equal(result.length, 1301)
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), 1301)
  assert.equal(offsets.at(-1), 1301)
})

test('a later page failure rejects the entire report instead of exporting partial totals', async () => {
  await assert.rejects(readAllReportRows(async (from) => from === 0 ? { data: [{ id: 'one' }], error: null } : { data: null, error: { message: 'offline' } }, { label: 'cuentas' }), /No se pudo cargar cuentas/)
})

test('duplicate pages and obsolete loads are discarded', async () => {
  await assert.rejects(readAllReportRows(async () => ({ data: [{ booking_id: 'one' }], error: null }), { label: 'bookings', key: 'booking_id' }), /cambiaron durante la carga/)
  let active = true
  let calls = 0
  await assert.rejects(readAllReportRows(async () => { calls++; active = false; return { data: [{ id: 'old-user-row' }], error: null } }, { label: 'test', isCurrent: () => active }), /reemplazada/)
  assert.equal(calls, 1)
})

test('overdue defaults include older unpaid debts and normal reports retain this month', () => {
  const now = new Date(2026, 8, 14)
  const overdue = defaultReportView('overdue', now)
  assert.equal(reportDateMatches('2026-08-01', overdue.from, overdue.to), true)
  const commercial = defaultReportView('commercial', now)
  assert.equal(reportDateMatches('2026-08-01', commercial.from, commercial.to), false)
  assert.equal(reportDateMatches(undefined, commercial.from, commercial.to), false)
  assert.equal(reportDateMatches('2026-09-14', commercial.from, commercial.to), true)
})

test('calendar quarter starts in July during August; January does not include the previous year', () => {
  assert.deepEqual(reportDateRange('quarter', new Date(2026, 7, 14)), { from: '2026-07-01', to: '2026-08-14' })
  assert.deepEqual(reportDateRange('quarter', new Date(2026, 0, 14)), { from: '2026-01-01', to: '2026-01-14' })
})

test('report URLs preserve search, filters and pagination without enabling unauthorized reports', () => {
  const view = { ...defaultReportView('payable'), client: 'ACME & Hijos', currency: 'HNL', page: 4, pageSize: 50, sort: 'saldo', direction: 'desc' }
  assert.deepEqual(readReportView(new URLSearchParams(reportViewQuery(view)), ['billing', 'payable']), view)
  assert.equal(readReportView(new URLSearchParams('report=commercial'), ['billing', 'payable']).report, 'billing')
  const invalid = readReportView(new URLSearchParams('page=-2&pageSize=0&from=2026-02-30&level=unknown'), ['commercial'], new Date(2026, 8, 14))
  assert.equal(invalid.page, 1)
  assert.equal(invalid.pageSize, 25)
  assert.equal(invalid.from, '2026-09-01')
  assert.equal(invalid.level, 'operations')
  const operations = readReportView(new URLSearchParams('report=operations&currency=USD&fiscal=Factura'), ['operations'])
  assert.equal(operations.currency, 'Todos')
  assert.equal(operations.fiscal, 'Todos')
})

test('CSV quotes names and prevents spreadsheet formulas without changing negative numbers', () => {
  assert.equal(reportCsvCell('Cliente, "Especial"'), '"Cliente, ""Especial"""')
  assert.equal(reportCsvCell('-30'), '"-30"')
  for (const value of ['=1+1', ' +1+1', '@SUM(A1)', '-1+2', '\t=1']) assert.ok(reportCsvCell(value).startsWith('"\''))
})

test('report sorting compares monetary amounts and dates by value, not formatted text', () => {
  assert.ok(reportSortValue('USD 900.00') < reportSortValue('USD 1,000.00'))
  assert.ok(reportSortValue('USD -10.00') < reportSortValue('USD 0.00'))
  assert.ok(reportSortValue('31/08/2026') < reportSortValue('01/09/2026'))
  assert.equal(reportSortValue('DEMO-002'), 'DEMO-002')
})
