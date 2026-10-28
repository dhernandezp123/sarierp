import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const lib = loadTs('src/lib/supplier-payables.ts')
const row = overrides => ({
  id: 'ap', tenant_id: 'tenant', proveedor_id: 'supplier', tipo: 'AP', parent_ap_id: null,
  descripcion: 'Flete', numero_factura_proveedor: 'INV-1', monto: '1000.00', moneda: 'USD',
  fecha_factura: '2026-10-01', fecha_vencimiento: '2026-10-15', status: 'Pendiente', stored_status: 'Pendiente',
  proveedores: { id: 'supplier', nombre: 'Proveedor', tipo: 'Agente' }, quotations: null,
  credit_notes: '200.00', debit_notes: '0.00', total_adjusted: '800.00', paid_total: '0.00', pending_balance: '800.00',
  paid_this_month: '0.00', days_overdue: 0, has_overpayment: false,
  has_inconsistent_movements: false, has_negative_obligation: false, needs_reconciliation: false,
  ...overrides,
})

test('NC: resumen de bandeja/proveedor y fila de tabla/CSV/PDF conservan saldo canonico800', () => {
  const balance = row()
  const summary = lib.supplierPayableSummary([balance], 'USD')
  const report = lib.supplierPayableReportRow(balance)
  assert.equal(summary.pending, 800)
  assert.equal(report.__amount, 800)
  assert.equal(report.saldo, 'USD 800.00')
  assert.equal(report.ajustado, 'USD 800.00')
  assert.equal(report.base, 'USD 1,000.00')
  assert.match(report.notas, /NC USD 200.00/)
  assert.equal(report.vencimiento, '15/10/2026')
})

test('ND: saldo1200 y vencido parcial derivado coinciden aunque el estado almacenado sea Pendiente', () => {
  const balance = row({ credit_notes: '0.00', debit_notes: '300.00', total_adjusted: '1300.00', paid_total: '100.00', pending_balance: '1200.00',
    paid_this_month: '100.00', status: 'Parcialmente Pagada', days_overdue: 3 })
  assert.deepEqual(lib.supplierPayableSummary([balance], 'USD'), { pending: 1200, overdue: 1200, paidThisMonth: 100, overpaid: 0, reconciliationCount: 0 })
  const report = lib.supplierPayableReportRow(balance)
  assert.equal(report.saldo, 'USD 1,200.00')
  assert.equal(report.pagado, 'USD 100.00')
  assert.equal(report.estado, 'Parcialmente Pagada')
})

test('sobrepago negativo visible y separado: no reduce obligaciones de otras cuentas', () => {
  const overpayment = row({ id: 'overpaid', monto: '100.00', credit_notes: '0.00', total_adjusted: '100.00', paid_total: '120.00',
    pending_balance: '-20.00', has_overpayment: true, needs_reconciliation: true, status: 'Pagada' })
  const totals = lib.supplierPayableSummary([row(), overpayment], 'USD')
  assert.equal(totals.pending, 800)
  assert.equal(totals.overpaid, 20)
  assert.equal(totals.reconciliationCount, 1)
  const report = lib.supplierPayableReportRow(overpayment)
  assert.equal(report.saldo, 'USD -20.00')
  assert.equal(report.__amount, 0)
  assert.equal(report.__overpayment, 20)
  assert.match(report.revision, /Sobrepago/)
})

test('anuladas se conservan en filas, sin sumar al pendiente; monedas nunca se mezclan', () => {
  const rows = [row(), row({ id: 'hnl', moneda: 'HNL', pending_balance: '1200.00' }), row({ id: 'cancelled', status: 'Anulada', pending_balance: '9999.00' })]
  assert.equal(lib.supplierPayableSummary(rows, 'USD').pending, 800)
  assert.equal(lib.supplierPayableSummary(rows, 'HNL').pending, 1200)
  assert.equal(lib.supplierPayableReportRow(rows[2]).__amount, 0)
  assert.equal(lib.supplierPayableReportRow(rows[2]).estado, 'Anulada')
})

test('inconsistencias y obligaciones negativas requieren conciliacion, sin inventar ceros', () => {
  for (const value of [null, undefined, '', '  ', 'NaN', Infinity]) assert.equal(lib.formatSupplierAmount(value, 'USD'), 'Por conciliar')
  const inconsistent = row({ id: 'bad', has_inconsistent_movements: true, needs_reconciliation: true, status: 'Revisar',
    pending_balance: null, total_adjusted: null, paid_total: null, paid_this_month: null })
  const excessiveNotes = row({ id: 'negative', has_negative_obligation: true, needs_reconciliation: true, pending_balance: '-200.00', total_adjusted: '-200.00' })
  const totals = lib.supplierPayableSummary([row(), inconsistent, excessiveNotes], 'USD')
  assert.equal(totals.pending, 800)
  assert.equal(totals.reconciliationCount, 2)
  assert.equal(lib.supplierPayableReportRow(inconsistent).saldo, 'Por conciliar')
  assert.equal(lib.supplierPayableReportRow(excessiveNotes).saldo, 'USD -200.00')
  assert.match(lib.supplierPayableIssue(excessiveNotes), /notas superan/)
})

test('totales monetarios de resumen conservan centavos exactos', () => {
  const rows = [row({ pending_balance: '0.10' }), row({ id: 'two', pending_balance: '0.20' })]
  assert.equal(lib.supplierPayableSummary(rows, 'USD').pending, 0.30)
})

function client(rows, { failAfter, duplicate, onRead = () => {} } = {}) {
  const requests = []
  return {
    requests,
    from(table) {
      assert.equal(table, 'supplier_payable_balances')
      let supplier
      const query = {
        select(columns) { assert.equal(columns, '*'); return query },
        order(column) { assert.equal(column, 'id'); return query },
        eq(column, value) { assert.equal(column, 'proveedor_id'); supplier = value; return query },
        async range(from, to) {
          onRead()
          requests.push({ from, to, supplier })
          if (failAfter != null && from >= failAfter) return { data: null, error: { message: 'offline' } }
          const source = supplier ? rows.filter(row => row.proveedor_id === supplier) : rows
          return { data: duplicate ? source.slice(0, 50) : source.slice(from, from + 50), error: null }
        },
      }
      return query
    },
  }
}

test('lectura de vista con limite50 incluye1301 principales y filtra proveedor en servidor', async () => {
  const rows = Array.from({ length: 1301 }, (_, index) => row({ id: 'id-' + index, pending_balance: '1.00', proveedor_id: index === 1300 ? 'other' : 'supplier' }))
  const db = client(rows)
  const result = await lib.loadSupplierPayables(db)
  assert.equal(result.length, 1301)
  assert.equal(lib.supplierPayableSummary(result, 'USD').pending, 1301)
  assert.equal(db.requests.at(-1).from, 1301)
  const filtered = await lib.loadSupplierPayables(db, { supplierId: 'other' })
  assert.deepEqual(filtered.map(row => row.id), ['id-1300'])
  assert.equal(db.requests.at(-1).supplier, 'other')
})

test('un error en pagina posterior, una pagina repetida o cambio de contexto rechaza toda la lectura', async () => {
  const rows = Array.from({ length: 100 }, (_, index) => row({ id: 'id-' + index }))
  await assert.rejects(lib.loadSupplierPayables(client(rows, { failAfter: 50 })), /No se pudo cargar saldos/)
  await assert.rejects(lib.loadSupplierPayables(client(rows, { duplicate: true })), /cambiaron durante la carga/)
  let current = true
  await assert.rejects(lib.loadSupplierPayables(client(rows, { onRead() { current = false } }), { isCurrent: () => current }), /reemplazada/)
})
