import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  collectQuotationSubmitIssues, createInitialQuotationForm, filterPortsForTransport, getRouteLabels,
} = loadTs('src/lib/quotation-form.ts')
const { createEmptyCargoLine } = loadTs('src/lib/quotation-cargo.ts')

const today = '2026-10-30'
const input = (formOverrides = {}, overrides = {}) => ({
  status: 'Pendiente de Fijar Precios',
  formData: { ...createInitialQuotationForm('2026-11-14'), cliente_id: 'client', ...formOverrides },
  todayString: today,
  missingReactivationReason: false,
  isMiamiFlow: false,
  isCustomsFlow: false,
  customsCharges: [],
  miamiLclEstimated: 0,
  miamiAirEstimated: 0,
  containerCount: 0,
  cargoLines: [],
  ...overrides,
})
const fields = issues => issues.map(issue => issue.field)

test('sin producto solo se piden los datos del primer bloque', () => {
  const issues = collectQuotationSubmitIssues(input({ cliente_id: '' }, { missingReactivationReason: true }))
  assert.deepEqual(fields(issues), ['reactivation_reason', 'cliente_id', 'service_product'])
})

test('FCL a Pricing reúne Incoterm, contenedores y mercancía en un solo envío', () => {
  const issues = collectQuotationSubmitIssues(input({ service_product: 'other_origin_fcl', tipo_transporte: 'Marítima', quote_type: 'FCL' }))
  assert.deepEqual(fields(issues), ['incoterm', 'containers', 'commodity'])
  assert.deepEqual(fields(collectQuotationSubmitIssues(input(
    { service_product: 'other_origin_fcl', tipo_transporte: 'Marítima', quote_type: 'FCL', incoterm: 'FOB', commodity: 'Repuestos' },
    { containerCount: 1 }
  ))), [])
})

test('borrador no exige Incoterm, modalidad ni mercancía y valida la fecha local', () => {
  const draft = input({ service_product: 'other_origin_fcl', valid_until: '2026-10-29' }, { status: 'Borrador' })
  assert.deepEqual(fields(collectQuotationSubmitIssues(draft)), ['valid_until'])
  assert.deepEqual(fields(collectQuotationSubmitIssues({ ...draft, formData: { ...draft.formData, valid_until: today } })), [])
})

test('carga suelta enfoca la primera línea incompleta', () => {
  const line = createEmptyCargoLine()
  const issues = collectQuotationSubmitIssues(input(
    { service_product: 'other_origin_lcl', tipo_transporte: 'Marítima', quote_type: 'LCL', incoterm: 'FOB', commodity: 'Repuestos' },
    { cargoLines: [line] }
  ))
  assert.deepEqual(fields(issues), [`cargo-line-${line.id}`])
})

test('Miami y Aduanas usan sus propias validaciones y no las de Pricing', () => {
  const miami = collectQuotationSubmitIssues(input({ service_product: 'miami_air', incoterm: 'FOB' }, { isMiamiFlow: true }))
  assert.deepEqual(miami.map(issue => issue.message), ['Ingresa KG para calcular la tarifa Miami Aéreo'])
  const customs = collectQuotationSubmitIssues(input({ service_product: 'customs_only' }, {
    isCustomsFlow: true,
    customsCharges: [{ code: 'customs_fee', description: 'Honorarios', cost: '0', sale: '', taxable: true }],
  }))
  assert.deepEqual(fields(customs), ['customs'])
})

test('etiquetas y sugerencias de ruta según el transporte', () => {
  assert.equal(getRouteLabels('Aéreo').place, 'Aeropuerto')
  assert.equal(getRouteLabels('Terrestre').carrierLabel, 'Transportista de preferencia')
  assert.equal(getRouteLabels('').place, 'Puerto')
  const ports = [{ name: 'Shanghai', type: 'Puerto' }, { name: 'PVG', type: 'Aeropuerto' }, { name: 'Laredo', type: 'Frontera' }, { name: 'Sin tipo', type: null }]
  assert.deepEqual(filterPortsForTransport(ports, 'Aéreo').map(port => port.name), ['PVG'])
  assert.deepEqual(filterPortsForTransport(ports, 'Marítima').map(port => port.name), ['Shanghai', 'Sin tipo'])
  assert.deepEqual(filterPortsForTransport(ports, 'Terrestre').map(port => port.name), ['Laredo'])
  assert.equal(filterPortsForTransport([{ name: 'Shanghai', type: 'Puerto' }], 'Aéreo').length, 1)
})
