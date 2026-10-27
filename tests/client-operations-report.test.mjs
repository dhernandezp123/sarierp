import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import { inflateSync } from 'node:zlib'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const clients = [{ id: 'client-a', nombre: 'Cliente de prueba A', codigo_cliente: 'CLI-001', rtn: '00000000000001' }, { id: 'client-b', nombre: 'Cliente de prueba B', codigo_cliente: 'CLI-002' }]
const quotation = (id, overrides = {}) => ({ id, cliente_id: 'client-a', quotation_number: `Q-${id}`, status: 'Ganada', deleted_at: null, origen: 'Shanghai, China', puerto_origen: 'Puerto de Shanghai', quote_type: 'FCL', tipo_transporte: 'Marítimo', service_product: 'other_origin_fcl', ...overrides })
const shipment = (id, overrides = {}) => ({ id, client_id: 'client-a', quotation_id: id, shipment_number: `OP-${id}`, origin: 'Ningbo, China', service_type: 'other_origin_fcl', operational_status: 'Sin bookings', closed_at: null, quotation: quotation(id), shipping_instruction: { id: `si-${id}`, consignee: 'Importador consignado, S. de R.L.', origin_address: null, deleted_at: null, shipment_status: 'Validada', operational_status: 'Listo para Booking' }, ...overrides })
const booking = (id, shipment_id, status, lifecycle = 'ACTIVE') => ({ id, shipment_id, shipment_status: status, booking_lifecycle_status: lifecycle })
const pure = loadTs('src/lib/client-operations-report.ts', { '@/src/lib/supabase/client': { supabase: {} } })

test('reporte del cliente usa consignatario real y origen canónico, conserva cotización y no duplica operaciones con varios bookings', () => {
  const rows = pure.clientOperationRows('client-a', [shipment('one'), shipment('loose', { quotation: [quotation('loose', { quote_type: 'LCL' })] })], [quotation('one'), quotation('pending')], [booking('b1', 'one', 'En Tránsito'), booking('b2', 'one', 'Arribado'), booking('b3', 'one', 'Finalizado', 'REPLACED')])
  assert.equal(rows.length, 3)
  const row = rows.find(r => r.id === 'one')
  assert.equal(row.consignee, 'Importador consignado, S. de R.L.')
  assert.equal(row.origin, 'Ningbo, China'); assert.equal(row.quotation, 'Q-one'); assert.equal(row.status, 'Arribo Parcial')
  assert.equal(row.modality, 'FCL'); assert.equal(rows.find(r => r.id === 'loose').modality, 'LCL')
  assert.equal(rows.find(r => r.phase === 'approved').consignee, 'Pendiente de confirmar')
})

test('excluye clientes ajenos, eliminados, cancelados, finalizados y cerrados sin resucitar sus cotizaciones ganadas', () => {
  const shipments = [shipment('closed', { closed_at: '2026-10-27T12:00:00Z' }), shipment('cancelled', { operational_status: 'Cancelado' }), shipment('completed'), shipment('hidden', { shipping_instruction: { id: 'hidden', deleted_at: '2026-10-27' } }), shipment('foreign', { client_id: 'client-b' }), shipment('reassigned', { quotation: quotation('reassigned', { cliente_id: 'client-b' }) }), shipment('deleted-quote', { quotation: quotation('deleted-quote', { deleted_at: '2026-10-27' }) })]
  const quotes = [...shipments.map(s => quotation(s.quotation_id)), quotation('draft', { status: 'Borrador' }), quotation('pricing', { status: 'Pricing Aprobado' }), quotation('lost', { status: 'Perdida' }), quotation('foreign-pending', { cliente_id: 'client-b' })]
  assert.deepEqual(pure.clientOperationRows('client-a', shipments, quotes, [booking('finished', 'completed', 'Finalizado')]), [])
  const rows = pure.clientOperationRows('client-a', [shipment('active', { operational_status: 'En Tránsito', shipping_instruction: null, quotation: quotation('active', { status: 'Pendiente de Fijar Precios' }) })], [], [])
  assert.equal(rows[0].status, 'En Tránsito')
})

test('modalidades, filtros y proyección comercial preservan filas exactas sin costos, notas internas ni identificadores', () => {
  const quotes = [quotation('approved'), quotation('miami', { quote_type: null, service_product: 'miami_lcl' }), quotation('air', { quote_type: null, service_product: 'miami_air' })]
  const rows = pure.clientOperationRows('client-a', [shipment('active')], quotes, [])
  assert.equal(pure.filterClientOperations(rows, 'approved', 'LCL').length, 1)
  assert.equal(pure.filterClientOperations(rows, 'active', 'FCL').length, 1)
  assert.equal(pure.filterClientOperations(rows, 'all', 'other')[0].modality, 'Aéreo')
  const report = pure.clientOperationsReport(clients[0], rows.map(r => ({ ...r, total_cost: 999, pricing_notes: 'CONFIDENTIAL', supplier_name: 'INTERNAL' })), 'all', 'all', '2026-10-27T12:00:00Z')
  assert.equal(report.rows.length, 4)
  assert.deepEqual(Object.keys(report.rows[0]), ['quotation', 'operation', 'origin', 'consignee', 'modality', 'status'])
  assert.doesNotMatch(JSON.stringify(report), /CONFIDENTIAL|INTERNAL|total_cost|quotationId|instructionId/)
  assert.equal(report.columns.reduce((sum, c) => sum + parseInt(c.width), 0), 100)
  assert.match(report.subtitle, /CLI-001/); assert.equal(report.audience, 'client')
})

function backend({ fail = false, deferred } = {}) {
  const reads = [], selects = [], shipments = [shipment('one'), shipment('two', { quotation: quotation('two', { quote_type: 'LCL' }) })]
  let failure = fail
  return { reads, selects, recover() { failure = false }, from(table) {
    const filters = [], q = { select: fields => { selects.push([table, fields]); return q }, order: () => q,
      eq: (field, value) => { filters.push(row => row[field] === value); return q }, is: (field, value) => { filters.push(row => row[field] === value); return q }, in: (field, values) => { filters.push(row => values.includes(row[field])); return q },
      range: async (from, to) => {
        reads.push({ table, from, to }); if (table === 'shipments' && deferred) await deferred
        if (table === 'bookings' && failure) return { data: null, error: { message: 'offline' } }
        const data = table === 'clientes' ? clients : table === 'shipments' ? shipments : table === 'quotations' ? [quotation('one'), quotation('two'), quotation('pending')] : [booking('b1', 'one', 'En Tránsito'), booking('b2', 'two', 'Booking Confirmado')]
        return { data: data.filter(row => filters.every(f => f(row))).slice(from, from + 1), error: null }
      } }; return q
  } }
}

test('carga todas las páginas por cliente y estados de bookings; falla completo si falta una fuente o cambia la solicitud', async () => {
  const api = backend(), lib = loadTs('src/lib/client-operations-report.ts', { '@/src/lib/supabase/client': { supabase: api } })
  const rows = await lib.loadClientOperations('client-a', () => true)
  assert.equal(rows.length, 3); assert.ok(api.reads.filter(r => r.table === 'shipments').length >= 3)
  assert.ok(api.reads.filter(r => r.table === 'bookings').length >= 3)
  assert.ok(api.selects.every(([,fields]) => !/\*|pricing_notes|total_cost|profit/.test(fields)))
  assert.deepEqual(await lib.loadClientOperations('client-b', () => true), [])
  const broken = loadTs('src/lib/client-operations-report.ts', { '@/src/lib/supabase/client': { supabase: backend({ fail: true }) } })
  await assert.rejects(broken.loadClientOperations('client-a', () => true), /estados de embarque/)
  await assert.rejects(lib.loadClientOperations('client-a', () => false), /reemplazada/)
})

function workspace(api) {
  return mountPage('src/app/(protected)/reports/client-operations/page.tsx', {
    '@/src/lib/supabase/client': { supabase: api }, '@/src/components/ui/ClienteCombobox': { ClienteCombobox: 'ClientPicker' },
    '@/src/components/invoicing/FinancialReportExport': { FinancialReportExport: 'Export' },
  }, { exported: 'ClientOperationsWorkspace', props: { context: 'user-a:tenant-a' } })
}
const ready = async app => { await app.ready(); await app.tick(); app.render() }
const choose = async (app, id) => { app.find(n => n.type === 'ClientPicker').props.onChange(id); app.render(); await app.tick(); app.render() }

test('pantalla real filtra la exportación completa, oculta resultados al cambiar cliente y permite recuperar errores', async () => {
  const api = backend({ fail: true }), app = workspace(api)
  try {
    await ready(app); await choose(app, 'client-a')
    assert.match(app.text(), /No se pudo cargar estados de embarque/); assert.equal(app.find(n => n.type === 'Export'), undefined)
    api.recover(); app.button('Reintentar reporte').props.onClick(); app.render(); await app.tick(); app.render()
    assert.equal(app.find(n => n.type === 'Export').props.data.rows.length, 3)
    app.find(n => n.props?.id === 'operation-report-mode').props.onChange({ target: { value: 'LCL' } }); app.render()
    assert.equal(app.find(n => n.type === 'Export').props.data.rows.length, 1)
    app.find(n => n.type === 'ClientPicker').props.onChange('client-b'); app.render()
    assert.equal(app.find(n => n.type === 'Export'), undefined); assert.doesNotMatch(app.text(), /Importador consignado/)
    await app.tick(); app.render(); assert.equal(app.find(n => n.type === 'Export').props.disabled, true)
  } finally { app.cleanup() }
})

test('una consulta anterior no reaparece al cambiar de cliente; desmontar cancela los resultados', async () => {
  let release; const deferred = new Promise(r => { release = r }), api = backend({ deferred }), app = workspace(api)
  try {
    await ready(app); await choose(app, 'client-a'); await choose(app, 'client-b')
    release(); await app.tick(); app.render()
    const report = app.find(n => n.type === 'Export').props.data
    assert.match(report.subtitle, /prueba B/); assert.deepEqual(report.rows, [])
  } finally { release(); app.cleanup() }
})

test('acceso a reporte comercial por rol conserva los límites de reportes internos', () => {
  const { canAccessPath, canViewClientOperationsReport } = loadTs('src/lib/permissions.ts')
  for (const role of ['Admin', 'Operaciones', 'Ventas']) assert.equal(canAccessPath(role, '/reports/client-operations'), true)
  for (const role of ['Cliente', 'Finanzas', 'Contabilidad', 'Pricing', null]) {
    assert.equal(canViewClientOperationsReport(role), false); assert.equal(canAccessPath(role, '/reports/client-operations'), false)
  }
  assert.equal(canAccessPath('Contabilidad', '/reports'), true)
})

test('PDF comercial real incluye la fila 501 y paginación; Excel conserva las seis columnas y todos los registros', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ quotation: `QUOTE${String(i + 1).padStart(4, '0')}`, operation: `OP${i + 1}`, origin: 'Puerto de prueba', consignee: 'Consignatario de prueba', modality: 'FCL', status: 'En Tránsito' }))
  const data = pure.clientOperationsReport(clients[0], rows, 'all', 'all', '2026-10-27T12:00:00Z')
  const { ReportPdf } = loadTs('src/components/pdf/report-pdf.tsx', { '@react-pdf/renderer': renderer })
  const buffer = await renderer.renderToBuffer(React.createElement(ReportPdf, { data }))
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF'); assert.ok((buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length > 1)
  const text = [...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(([,stream]) => {
    try { return inflateSync(Buffer.from(stream, 'latin1')).toString('latin1') } catch { return '' }
  }).join('\n')
  const decoded = [...text.matchAll(/<([a-f0-9]+)>/gi)].map(([,hex]) => Buffer.from(hex, 'hex').toString('latin1')).join('')
  assert.match(decoded, /QUOTE0501/)
  const { createXlsx } = loadTs('src/lib/xlsx.ts')
  const bytes = createXlsx([data.columns.map(c => c.label), ...data.rows.map(row => data.columns.map(c => row[c.key]))], data.title)
  const xml = new TextDecoder().decode(bytes)
  assert.match(xml, /QUOTE0501/); assert.match(xml, /Consignatario/); assert.doesNotMatch(xml, /total_cost|pricing_notes/)
})
