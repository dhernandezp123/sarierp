import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { pagedClient } from './paged-client.mjs'

const { loadInvoiceList } = loadTs('src/lib/invoice-list.ts')
const { loadHistoricalQuotations } = loadTs('src/lib/history-quotations.ts')
const { loadMiamiInventory, loadMiamiDispatch } = loadTs('src/lib/miami-reads.ts')
const { getSystemAlerts } = loadTs('src/lib/alerts.ts')
const { readReportRowsByIds } = loadTs('src/lib/report-query.ts')
const id = n => String(n).padStart(5, '0')

function invoices() {
  return {
    invoices: Array.from({ length: 1301 }, (_, n) => ({ id: id(n), invoice_type: 'Factura', status: 'Aprobada', created_at: '2026-01-01', deleted_at: null })),
    invoice_receivables: Array.from({ length: 1301 }, (_, n) => ({ invoice_id: id(n), balance: 80, paid_total: 20, receivable_status: 'Parcialmente Pagada' })),
    invoice_payments: Array.from({ length: 2602 }, (_, n) => ({ id: id(n), invoice_id: id(Math.floor(n / 2)), amount: 20, status: n % 2 ? 'Reversado' : 'Aplicado' })),
    get_billing_work_queue: Array.from({ length: 1101 }, (_, n) => ({ quotation_id: id(n), readiness_code: 'READY_TO_INVOICE' })),
  }
}

test('facturacion completa1301 documentos/saldos,2602 cobros y1101 pendientes con limite50', async () => {
  const db = pagedClient(invoices())
  const result = await loadInvoiceList(db)
  assert.equal(result.invoices.length, 1301)
  assert.equal(result.receivables.reduce((sum, row) => sum + row.balance, 0), 104080)
  assert.equal(result.workQueue.length, 1101)
  assert.equal(result.invoices.at(-1).invoice_payments.length, 2)
  assert.equal(result.invoices.at(-1).status, 'Parcialmente Pagada')
  assert.ok(db.calls.filter(call => call.table === 'invoice_payments').every(call => call.filters[0].value.length <= 100))
})

test('fallos posteriores no publican facturas/saldos parciales; cola fallida queda explicitamente indisponible', async () => {
  await assert.rejects(loadInvoiceList(pagedClient(invoices(), { fail: call => call.table === 'invoice_receivables' && call.start >= 50 })), /saldos de facturas/)
  await assert.rejects(loadInvoiceList(pagedClient(invoices(), { fail: call => call.table === 'invoice_payments' && call.start >= 50 })), /cobros de facturas/)
  const result = await loadInvoiceList(pagedClient(invoices(), { fail: call => call.table === 'get_billing_work_queue' && call.start >= 50 }))
  assert.equal(result.workQueue.length, 0)
  assert.match(result.workQueueError, /cola por facturar/)
  assert.equal(result.invoices.length, 1301)
})

test('factura activa sin saldo o saldo sin cabecera obliga a recargar en lugar de usar cero', async () => {
  const missing = invoices(); missing.invoice_receivables.pop()
  await assert.rejects(loadInvoiceList(pagedClient(missing)), /cambiaron durante la carga/)
  const orphan = invoices(); orphan.invoices.pop()
  await assert.rejects(loadInvoiceList(pagedClient(orphan)), /cambiaron durante la carga/)
})

test('historico encuentra registro1301 con todas sus lineas y vigencias', async () => {
  const db = pagedClient({
    quotations: Array.from({ length: 1301 }, (_, n) => ({ id: id(n), quotation_number: 'COT-' + n, deleted_at: null, created_at: '2026-01-01' })),
    agent_quotes: [{ id: 'agent', quotation_id: id(1300), is_selected: true, valid_until: '2026-12-31' }],
    quotation_containers: Array.from({ length: 1005 }, (_, n) => ({ id: id(n), quotation_id: id(1300), quantity: 1 })),
  })
  const rows = await loadHistoricalQuotations(db)
  const last = rows.find(row => row.quotation_number === 'COT-1300')
  assert.equal(rows.length, 1301)
  assert.equal(last.quotation_containers.reduce((sum, row) => sum + row.quantity, 0), 1005)
  assert.equal(last.agent_quotes[0].is_selected, true)
  await assert.rejects(loadHistoricalQuotations(pagedClient({ quotations: [{ id: 'one' }] }, { fail: call => call.table === 'agent_quotes' })), /vigencias/)
})

function miami() {
  return {
    miami_packages: Array.from({ length: 1301 }, (_, n) => ({ id: id(n), tracking_number: 'TRACK-' + n, cargo_status: n === 1300 ? 'En Tránsito' : 'Recibido en Miami', received_at: '2026-01-01' })),
    miami_package_documents: Array.from({ length: 1005 }, (_, n) => ({ id: id(n), package_id: id(1299), status: 'Activo' })),
    miami_shipments: Array.from({ length: 101 }, (_, n) => ({ id: id(n), dispatched_at: '2026-01-01' })),
  }
}

test('inventario completo y documentos posteriores; despachos disponibles mas alla del paquete500', async () => {
  const data = miami()
  const inventory = await loadMiamiInventory(pagedClient(data))
  assert.equal(inventory.length, 1301)
  assert.equal(inventory.find(row => row.id === id(1299)).miami_package_documents.length, 1005)
  const dispatch = await loadMiamiDispatch(pagedClient(data))
  assert.equal(dispatch.packages.length, 1300)
  assert.ok(dispatch.packages.some(row => row.tracking_number === 'TRACK-1299'))
  assert.equal(dispatch.shipments.length, 101)
  assert.ok(!dispatch.packages.some(row => row.tracking_number === 'TRACK-1300'))
})

test('errores de inventario/documentos/despachos y cambio de usuario rechazan resultados', async () => {
  await assert.rejects(loadMiamiInventory(pagedClient(miami(), { fail: call => call.table === 'miami_package_documents' && call.start >= 50 })), /documentos de paquetes/)
  await assert.rejects(loadMiamiDispatch(pagedClient(miami(), { fail: call => call.table === 'miami_packages' && call.start >= 50 })), /paquetes disponibles/)
  let active = true
  await assert.rejects(loadMiamiInventory(pagedClient(miami(), { afterRead() { active = false } }), () => active), /reemplazada/)
})

test('alertas antiguas despues de primera pagina y pricing sin truncar ni filtros URL gigantes', async () => {
  const quotations = Array.from({ length: 1301 }, (_, n) => ({ id: id(n), quotation_number: 'Q' + n, status: 'Pendiente de Fijar Precios', created_at: '2020-01-01', deleted_at: null }))
  const db = pagedClient({ quotations, pricing_items: Array.from({ length: 1005 }, (_, n) => ({ id: id(n), quotation_id: id(1300), cost_amount: 1, sale_amount: 2, quantity: 1 })) })
  const alerts = await getSystemAlerts(db, { rol: 'Admin' }, { id: 'user' })
  assert.equal(alerts.filter(row => row.id.startsWith('pricing-')).length, 1301)
  assert.ok(alerts.some(row => row.id === 'pricing-' + id(1300)))
  assert.ok(db.calls.filter(call => call.table === 'pricing_items').every(call => call.filters[0].value.length <= 100))
  await assert.rejects(getSystemAlerts(pagedClient({ quotations }, { fail: call => call.table === 'quotations' && call.start >= 50 }), { rol: 'Admin' }), /cotizaciones para alertas/)
})

test('readiness y bookings completos; roles mantienen filtros de propiedad y finanzas', async () => {
  const data = {
    bookings: Array.from({ length: 1301 }, (_, n) => ({ id: id(n), shipping_instruction_id: 'si', shipment_id: 'shipment', shipment_status: 'Booking Confirmado', booking_lifecycle_status: 'ACTIVE' })),
    get_booking_readiness_alerts: Array.from({ length: 1301 }, (_, n) => ({ alert_key: id(n), booking_id: id(n), severity: 'WARNING', title: 'Prueba', description: '', alert_code: 'TEST' })),
  }
  const alerts = await getSystemAlerts(pagedClient(data), { rol: 'Admin' })
  assert.equal(alerts.filter(row => row.id.startsWith('readiness-')).length, 1301)
  await assert.rejects(getSystemAlerts(pagedClient(data, { fail: call => call.table === 'get_booking_readiness_alerts' && call.start >= 50 }), { rol: 'Admin' }), /alertas de preparacion/)
  const finance = pagedClient(data)
  assert.deepEqual(await getSystemAlerts(finance, { rol: 'Finanzas' }), [])
  assert.ok(!finance.calls.some(call => ['bookings','shipments','get_booking_readiness_alerts'].includes(call.table)))
  const sales = await getSystemAlerts(pagedClient({ quotations: [{ id: 'owned', status: 'Pendiente de Fijar Precios', created_by: 'sales', created_at: '2020-01-01' }, { id: 'other', status: 'Pendiente de Fijar Precios', created_by: 'other', created_at: '2020-01-01' }] }), { rol: 'Ventas' }, { id: 'sales' })
  assert.ok(sales.some(row => row.id === 'pricing-owned'))
  assert.ok(!sales.some(row => row.id === 'pricing-other'))
})

test('batch de IDs vacio no consulta, IDs repetidos se deduplican y resultados obsoletos se descartan', async () => {
  let reads = 0
  assert.deepEqual(await readReportRowsByIds([], async () => { reads++; return { data: [], error: null } }, { label: 'test' }), [])
  assert.equal(reads, 0)
  const rows = await readReportRowsByIds(['a', 'a'], async batch => { assert.deepEqual(batch, ['a']); return { data: reads++ ? [] : [{ id: 'one' }], error: null } }, { label: 'test' })
  assert.equal(rows.length, 1)
  await assert.rejects(readReportRowsByIds([], async () => ({ data: [], error: null }), { label: 'test', isCurrent: () => false }), /reemplazada/)
})
