import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const hr = loadTs('src/lib/hr.ts')
const permissions = loadTs('src/lib/permissions.ts')
const crumbs = loadTs('src/lib/workspace-breadcrumbs.ts')

test('RRHH: Admin administra y cualquier usuario interno accede solo a su ficha', () => {
  for (const path of ['/rrhh', '/rrhh/solicitudes', '/rrhh/mi-ficha']) assert.equal(permissions.canAccessPath('Admin', path), true, path)
  for (const role of ['Ventas', 'Pricing', 'Operaciones', 'Contabilidad', 'Finanzas']) {
    assert.equal(permissions.canAccessPath(role, '/rrhh/mi-ficha'), true, role)
    assert.equal(permissions.canAccessPath(role, '/rrhh'), false, role)
    assert.equal(permissions.canAccessPath(role, '/rrhh/solicitudes'), false, role)
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

test('RRHH: días hábiles excluyen fines de semana', () => {
  assert.equal(hr.hrBusinessDays('2026-11-16', '2026-11-20'), 5) // lunes a viernes
  assert.equal(hr.hrBusinessDays('2026-11-20', '2026-11-23'), 2) // viernes a lunes
  assert.equal(hr.hrBusinessDays('2026-11-21', '2026-11-22'), 0) // fin de semana
  assert.equal(hr.hrBusinessDays('2026-11-20', '2026-11-19'), 0)
  assert.equal(hr.hrBusinessDays('2026-12-28', '2027-01-01'), 5)
})

test('RRHH: saldo de vacaciones reserva pendientes y solo cuenta el año', () => {
  const employee = { id: 'e1', vacation_days_per_year: 10 }
  const base = { reason: '', review_notes: '', reviewed_at: null, created_at: '' }
  const requests = [
    { ...base, id: 'a', employee_id: 'e1', leave_type: 'Vacaciones', status: 'Aprobada', start_date: '2026-03-02', end_date: '2026-03-04', business_days: 3 },
    { ...base, id: 'b', employee_id: 'e1', leave_type: 'Vacaciones', status: 'Pendiente', start_date: '2026-12-01', end_date: '2026-12-02', business_days: 2 },
    { ...base, id: 'c', employee_id: 'e1', leave_type: 'Vacaciones', status: 'Rechazada', start_date: '2026-05-04', end_date: '2026-05-08', business_days: 5 },
    { ...base, id: 'd', employee_id: 'e1', leave_type: 'Incapacidad', status: 'Aprobada', start_date: '2026-06-01', end_date: '2026-06-05', business_days: 5 },
    { ...base, id: 'e', employee_id: 'e1', leave_type: 'Vacaciones', status: 'Aprobada', start_date: '2025-06-02', end_date: '2025-06-06', business_days: 5 },
    { ...base, id: 'f', employee_id: 'e2', leave_type: 'Vacaciones', status: 'Aprobada', start_date: '2026-06-01', end_date: '2026-06-05', business_days: 5 },
  ]
  assert.deepEqual(hr.vacationBalance(employee, requests, 2026), { allowance: 10, used: 3, pending: 2, available: 5 })
})

test('RRHH: el saldo se calcula por el año de la solicitud, no por el año en curso', () => {
  const employee = { id: 'e1', vacation_days_per_year: 10 }
  const base = { employee_id: 'e1', leave_type: 'Vacaciones', status: 'Aprobada', reason: '', review_notes: '', reviewed_at: null, created_at: '' }
  const requests = [{ ...base, id: 'a', start_date: '2026-02-02', end_date: '2026-02-13', business_days: 10 }]
  assert.equal(hr.vacationBalance(employee, requests, 2026).available, 0)
  const available2027 = hr.vacationBalance(employee, requests, 2027).available
  assert.equal(available2027, 10)
  assert.equal(hr.validateLeaveRequest({ leave_type: 'Vacaciones', start_date: '2027-01-04', end_date: '2027-01-08' }, available2027), '')
})

test('RRHH: validación de solicitud', () => {
  assert.match(hr.validateLeaveRequest({ leave_type: 'Vacaciones', start_date: '', end_date: '' }, 10), /fechas/)
  assert.match(hr.validateLeaveRequest({ leave_type: 'Vacaciones', start_date: '2026-11-20', end_date: '2026-11-19' }, 10), /anterior/)
  assert.match(hr.validateLeaveRequest({ leave_type: 'Vacaciones', start_date: '2026-12-30', end_date: '2027-01-04' }, 10), /año calendario/)
  assert.match(hr.validateLeaveRequest({ leave_type: 'Permiso con goce', start_date: '2026-11-21', end_date: '2026-11-22' }, 10), /días hábiles/)
  assert.match(hr.validateLeaveRequest({ leave_type: 'Vacaciones', start_date: '2026-11-16', end_date: '2026-11-20' }, 4), /Saldo insuficiente/)
  assert.equal(hr.validateLeaveRequest({ leave_type: 'Incapacidad', start_date: '2026-11-16', end_date: '2026-11-20' }, 0), '')
  assert.equal(hr.validateLeaveRequest({ leave_type: 'Vacaciones', start_date: '2026-11-16', end_date: '2026-11-20' }, 5), '')
})

test('RRHH: breadcrumbs no enlazan la raíz restringida', () => {
  assert.deepEqual(crumbs.workspaceBreadcrumbs('/rrhh/mi-ficha').map(crumb => crumb.label), ['Inicio', 'Recursos Humanos', 'Mi ficha'])
  assert.equal(crumbs.workspaceBreadcrumbs('/rrhh/mi-ficha')[1].href, undefined)
})
