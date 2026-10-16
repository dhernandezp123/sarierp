import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import React from 'react'
import * as renderer from '@react-pdf/renderer'

const { visitReportRows, VISIT_REPORT_COLUMNS } = loadTs('src/lib/sales-visits.ts')
const { reportDateRange, reportDateMatches, defaultReportView, readReportView, reportViewQuery } = loadTs('src/lib/report-view.ts')

test('visitas delimita día, semana lunes-domingo y mes completo, incluso al cambiar de año', () => {
  const now = new Date(2027, 0, 1, 22)
  assert.deepEqual(reportDateRange('day', now), { from: '2027-01-01', to: '2027-01-01' })
  assert.deepEqual(reportDateRange('week', now), { from: '2026-12-28', to: '2027-01-03' })
  assert.deepEqual(reportDateRange('week', new Date(2027, 0, 3)), { from: '2026-12-28', to: '2027-01-03' })
  assert.deepEqual(reportDateRange('visit-month', new Date(2028, 1, 2)), { from: '2028-02-01', to: '2028-02-29' })
  const { from, to } = reportDateRange('week', now)
  for (const date of [from, '2027-01-01', to]) assert.equal(reportDateMatches(date, from, to), true)
  for (const date of ['2026-12-27', '2027-01-04']) assert.equal(reportDateMatches(date, from, to), false)
})

const visit = (id, status, date = '2026-10-16') => ({
  id, estado_ejecucion: status, fecha_actividad: date, tipo_cliente: 'Mantenimiento',
  hora_inicio: '09:00:00', hora_fin: '10:00:00', comentarios: 'Revisar rutas', resultado: 'Acuerdo',
  proxima_accion: 'Cotizar', fecha_proxima_accion: '2026-10-19', nombre_prospecto: null, empresa_prospecto: null,
  clientes: { id: 'c1', codigo_cliente: 'CLI-012', nombre: 'Cuenta' },
  profiles: [{ id: 's1', nombre: 'Ana', apellido: 'Pérez' }],
})

test('visitas no infiere ejecución por fecha o resultado y conserva cuenta, código y seguimiento', () => {
  const rows = visitReportRows([
    visit('legacy', null, '2026-10-10'), visit('done', 'Realizada', '2026-10-10'),
    visit('cancel', 'Cancelada', '2026-10-10'), visit('overdue', 'Pendiente', '2026-10-15'),
    visit('today', 'Pendiente'), visit('future', 'Pendiente', '2026-10-20'),
  ], '2026-10-16')
  assert.deepEqual(rows.map(row => row.estado), ['Sin clasificar', 'Realizada', 'Cancelada', 'Pendiente', 'Pendiente', 'Pendiente'])
  assert.deepEqual(rows.map(row => row.vencida), ['No', 'No', 'No', 'Sí', 'No', 'No'])
  assert.equal(rows[0].codigo, 'CLI-012')
  assert.equal(rows[0].fecha, '10/10/2026')
  assert.equal(rows[0].horario, '09:00 – 10:00')
  assert.equal(rows[0].vendedor, 'Ana Pérez')
  assert.equal(rows[0].fecha_proxima_accion, '19/10/2026')
  assert.equal(rows[0].__href, '/ventas?activity=legacy')
})

test('visitas incluye prospectos sin cliente y soporta relaciones nulas', () => {
  const row = visitReportRows([{ ...visit('new', 'Pendiente'), tipo_cliente: 'Nuevo', clientes: null,
    profiles: null, nombre_prospecto: 'Contacto', empresa_prospecto: 'Nueva empresa', hora_inicio: null, hora_fin: null,
  }])[0]
  assert.equal(row.cliente, 'Nueva empresa')
  assert.equal(row.contacto, 'Contacto')
  assert.equal(row.codigo, '-')
  assert.equal(row.vendedor, 'Sin vendedor')
  assert.equal(row.horario, '-')
})

test('visitas inicia por ejecutar en el mes completo y conserva filtros sin ampliar acceso a otros reportes', () => {
  const view = defaultReportView('visits', new Date(2026, 9, 16))
  assert.equal(view.status, 'Pendiente')
  assert.equal(view.to, '2026-10-31')
  const filtered = { ...view, seller: 'Ana Pérez', status: 'Realizada', client: 'Cuenta', page: 2 }
  assert.deepEqual(readReportView(new URLSearchParams(reportViewQuery(filtered)), ['commercial', 'visits']), filtered)
  assert.equal(readReportView(new URLSearchParams('report=visits'), ['pricing']).report, 'pricing')
  assert.equal(readReportView(new URLSearchParams('report=visits&currency=USD&service=FCL'), ['visits']).currency, 'Todos')
})

test('el PDF real de visitas conserva las columnas del reporte y pagina todo el detalle', async () => {
  const { ReportPdf } = loadTs('src/components/pdf/report-pdf.tsx', { '@react-pdf/renderer': renderer })
  const rows = visitReportRows(Array.from({ length: 50 }, (_, i) => visit('pdf-' + i, 'Pendiente')))
  const buffer = await renderer.renderToBuffer(React.createElement(ReportPdf, { data: {
    title: 'Reporte Visitas', subtitle: 'Prueba local', generatedAt: '16/10/2026',
    filters: ['Estado: Pendiente'], metrics: [{ label: 'Por ejecutar', value: '50' }],
    columns: VISIT_REPORT_COLUMNS, rows,
  } }))
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
  assert.ok((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1)
  assert.equal(VISIT_REPORT_COLUMNS.reduce((sum, column) => sum + Number.parseInt(column.width), 0), 100)
})
