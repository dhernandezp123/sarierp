import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const hr = loadTs('src/lib/hr.ts')
const permissions = loadTs('src/lib/permissions.ts')
const crumbs = loadTs('src/lib/workspace-breadcrumbs.ts')

test('RRHH: Admin administra y cualquier usuario interno accede solo a su ficha', () => {
  for (const path of ['/rrhh', '/rrhh/solicitudes', '/rrhh/configuracion', '/rrhh/mi-ficha']) assert.equal(permissions.canAccessPath('Admin', path), true, path)
  for (const role of ['Ventas', 'Pricing', 'Operaciones', 'Contabilidad', 'Finanzas']) {
    assert.equal(permissions.canAccessPath(role, '/rrhh/mi-ficha'), true, role)
    for (const path of ['/rrhh', '/rrhh/solicitudes', '/rrhh/configuracion']) assert.equal(permissions.canAccessPath(role, path), false, `${role} ${path}`)
  }
  for (const role of ['Cliente', 'Desconocido', '', null]) assert.equal(permissions.canAccessPath(role, '/rrhh/mi-ficha'), false, String(role))
})

test('RRHH: permisos de UI exigen perfil aprobado y activo', () => {
  assert.equal(hr.canManageHr({ rol: 'Admin', status: 'Aprobado', is_active: true }), true)
  assert.equal(hr.canManageHr({ rol: 'Admin', status: 'Pendiente', is_active: true }), false)
  assert.equal(hr.canManageHr({ rol: 'Admin', status: 'Aprobado', is_active: false }), false)
  assert.equal(hr.canManageHr({ rol: 'Ventas', status: 'Aprobado', is_active: true }), false)
  assert.equal(hr.canUseHrSelfService({ rol: 'Ventas', status: 'Aprobado', is_active: true }), true)
  assert.equal(hr.canUseHrSelfService({ rol: 'Cliente', status: 'Aprobado', is_active: true }), false)
  assert.equal(hr.canUseHrSelfService(null), false)
})

test('RRHH: escala legal del Art. 346', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 12].map(hr.legalVacationDays), [10, 12, 15, 20, 20, 20])
})

test('RRHH: totales por período descuentan el anticipo del siguiente', () => {
  const base = { ends_on: '', entitlement: 0, adjustments: 0, approved: 0, pending: 0, accumulated: false, overdue_unscheduled: false, expired_unused: false }
  const periods = [
    { ...base, period_number: 1, earned_on: '2025-03-01', is_earned: true, available: 2 },
    { ...base, period_number: 2, earned_on: '2026-03-01', is_earned: true, available: 4 },
    { ...base, period_number: 3, earned_on: '2027-03-01', is_earned: false, available: -3 },
  ]
  assert.deepEqual(hr.vacationTotals(periods), { available: 3, advance: 3, nextEarnedOn: '2027-03-01', nextEntitlement: 15 })
  assert.deepEqual(hr.vacationTotals([{ ...base, period_number: 1, earned_on: '2027-01-06', is_earned: false, available: 0 }]),
    { available: 0, advance: 0, nextEarnedOn: '2027-01-06', nextEntitlement: 10 })
})

test('RRHH: Pascua y sugerencias del Art. 339', () => {
  assert.equal(hr.easterSunday(2026), '2026-04-05')
  assert.equal(hr.easterSunday(2027), '2027-03-28')
  assert.equal(hr.easterSunday(2025), '2025-04-20')
  const days = hr.suggestedHolidays(2026)
  assert.equal(days.length, 11)
  assert.deepEqual(days.filter(item => /Santo|Gloria/.test(item.name)).map(item => item.date), ['2026-04-02', '2026-04-03', '2026-04-04'])
  assert.deepEqual(days.map(item => item.date), [...days.map(item => item.date)].sort())
  // Semana Santa que cruza de mes.
  assert.deepEqual(hr.suggestedHolidays(2027).filter(item => /Santo|Gloria/.test(item.name)).map(item => item.date), ['2027-03-25', '2027-03-26', '2027-03-27'])
})

test('RRHH: jornada y validación de fechas', () => {
  assert.equal(hr.workScheduleLabel('L-S medio'), 'Lunes a viernes y sábado medio día')
  assert.equal(hr.workScheduleLabel(undefined), 'Lunes a viernes')
  assert.match(hr.validateLeaveDates('', ''), /fechas/)
  assert.match(hr.validateLeaveDates('2026-11-20', '2026-11-19'), /anterior/)
  assert.equal(hr.validateLeaveDates('2026-12-30', '2027-01-04'), '')
})

test('RRHH: breadcrumbs no enlazan la raíz restringida', () => {
  assert.deepEqual(crumbs.workspaceBreadcrumbs('/rrhh/mi-ficha').map(crumb => crumb.label), ['Inicio', 'Recursos Humanos', 'Mi ficha'])
  assert.equal(crumbs.workspaceBreadcrumbs('/rrhh/mi-ficha')[1].href, undefined)
  assert.equal(crumbs.workspaceBreadcrumbs('/rrhh/configuracion').at(-1).label, 'Calendario y reglas')
})
