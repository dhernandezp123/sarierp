import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const { hrMonthRange, hrCsv, hrRequestRows, hrBalanceRows } = loadTs('src/lib/hr-report.ts')
const { canAccessPath } = loadTs('src/lib/permissions.ts')

test('HR: monthly calendar includes leap day and aligns Monday-first weeks', () => {
  assert.equal(hrMonthRange('2028-02').end, '2028-02-29')
  assert.equal(hrMonthRange('2028-02').days.length, 29)
  assert.equal(hrMonthRange('2026-11').offset, 6)
  for (const month of ['2026-13', '2026-00', 'invalid', '0000-01']) assert.throws(() => hrMonthRange(month))
})
test('HR: exports include every supplied row, numeric days and no private notes or formula execution', () => {
  const employee = { id: 'A', employee_code: '=cmd', first_name: 'Ana', last_name: 'A', department: 'Ventas', work_schedule: 'L-V', status: 'Activo' }
  const employees = new Map([['A', employee]])
  const requests = Array.from({ length: 501 }, () => ({ employee_id: 'A', leave_type: 'Vacaciones', start_date: '2026-11-23', end_date: '2026-11-27', business_days: 5, status: 'Aprobada', reason: 'private medical reason' }))
  const rows = hrRequestRows(requests, employees)
  assert.equal(rows.length, 502)
  assert.equal(rows[1][5], 5)
  const csv = hrCsv(rows)
  assert.ok(csv.includes('23/11/2026'))
  assert.ok(!csv.includes('private medical reason'))
  assert.ok(!csv.includes('"=cmd"'))
  assert.ok(csv.includes("'=cmd"))
  assert.throws(() => hrBalanceRows([employee], new Map()), /incompleto/)
  assert.equal(hrBalanceRows([employee], new Map([['A', { available: 0, advance_used: 0 }]]))[1][5], 0)
})
test('HR: calendar and notices allow internal self-service but never the Client role', () => {
  for (const path of ['/rrhh/calendario', '/rrhh/avisos']) {
    for (const role of ['Admin', 'Ventas', 'Operaciones', 'Pricing', 'Contabilidad', 'Finanzas']) assert.equal(canAccessPath(role, path), true)
    assert.equal(canAccessPath('Cliente', path), false)
  }
})
