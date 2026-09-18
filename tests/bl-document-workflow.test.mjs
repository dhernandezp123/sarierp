import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const {
  buildQuotationCargoDefaults,
  getBlConsistencyWarnings,
  getBlReadiness,
  inheritParentMblData,
  isBlValidationExceptionMatch,
} = loadTs('src/lib/bl-document-workflow.ts')

test('los defaults de carga suelta usan las líneas canónicas y convierten libras a kg', () => {
  const result = buildQuotationCargoDefaults(
    { commodity: 'Repuestos', peso_kg: 999, volumen_cbm: 99 },
    [
      { quantity: 2, package_type: 'Caja', weight_lbs: 22.0462, cbm: 1.25 },
      { quantity: 1, package_type: 'Pallet', weight_lbs: 44.0924, cbm: 0.75 },
    ]
  )

  assert.equal(result.description_of_goods, 'Repuestos')
  assert.equal(result.number_of_packages, '3')
  assert.equal(result.package_type, 'Caja / Pallet')
  assert.equal(result.gross_weight_kg, '40')
  assert.equal(result.measurement_cbm, '2')
})

test('un HBL hereda ruta y carga del MBL sin reemplazar sus partes comerciales', () => {
  const result = inheritParentMblData(
    {
      shipper: 'Proveedor real',
      consignee: 'Cliente real',
      notify_party: 'Notify comercial',
      carrier: 'Carrier del booking',
    },
    {
      bl_number: 'MASTER-001',
      shipper: 'Agente origen',
      consignee: 'Sari Express',
      notify_party: 'Agente destino',
      carrier: 'MAERSK',
      vessel_name: 'VESSEL ONE',
      voyage: '001S',
      description_of_goods: 'Repuestos',
    }
  )

  assert.equal(result.bl_number, '')
  assert.equal(result.shipper, 'Proveedor real')
  assert.equal(result.consignee, 'Cliente real')
  assert.equal(result.notify_party, 'Notify comercial')
  assert.equal(result.carrier, 'MAERSK')
  assert.equal(result.vessel_name, 'VESSEL ONE')
  assert.equal(result.description_of_goods, 'Repuestos')
})

test('la validación impide avanzar un MBL marítimo sin datos críticos ni draft', () => {
  const result = getBlReadiness(
    {
      bl_type: 'MBL',
      bl_number: 'MASTER-001',
      draft_file_url: '',
      shipper: 'Agente origen',
      shipper_address: '',
      consignee: 'Sari Express',
      consignee_address: '',
      consignee_email: '',
      notify_party: '',
      notify_party_address: '',
      notify_party_tax_id: '',
      notify_party_contact: '',
      notify_party_email: '',
      place_of_receipt: '',
      port_of_loading: 'Shanghai',
      port_of_discharge: 'Puerto Cortés',
      place_of_delivery: '',
      carrier: 'MAERSK',
      vessel_name: '',
      voyage: '',
      etd: '',
      eta: '',
      description_of_goods: 'Repuestos',
      marks_and_numbers: '',
      number_of_packages: '',
      package_type: '',
      gross_weight_kg: '100',
      measurement_cbm: '',
    },
    'Marítima',
    'MBL Validado'
  )

  assert.deepEqual(
    result.blocking.map(({ field }) => field),
    ['vessel_name', 'voyage', 'draft_file_url']
  )
  assert.ok(result.warnings.some(({ field }) => field === 'measurement_cbm'))
})

test('un HBL exige MBL padre antes de enviarse al cliente', () => {
  const result = getBlReadiness(
    {
      bl_type: 'HBL',
      parent_bl_id: null,
      bl_number: 'SARI-HBL-001',
      draft_file_url: '',
      shipper: 'Proveedor',
      shipper_address: 'Shanghai',
      consignee: 'Cliente',
      consignee_address: 'San Pedro Sula',
      consignee_email: 'cliente@example.com',
      notify_party: '',
      notify_party_address: '',
      notify_party_tax_id: '',
      notify_party_contact: '',
      notify_party_email: '',
      place_of_receipt: '',
      port_of_loading: 'Shanghai',
      port_of_discharge: 'Puerto Cortés',
      place_of_delivery: '',
      carrier: 'MAERSK',
      vessel_name: 'VESSEL ONE',
      voyage: '001S',
      etd: '2026-09-20',
      eta: '2026-10-10',
      description_of_goods: 'Repuestos',
      marks_and_numbers: '',
      number_of_packages: '10',
      package_type: 'Caja',
      gross_weight_kg: '100',
      measurement_cbm: '2',
    },
    'Marítimo',
    'Pendiente Aprobación Cliente'
  )

  assert.deepEqual(result.blocking.map(({ field }) => field), ['parent_bl_id'])
})

test('detecta diferencias del HBL contra MBL y partes comerciales sin bloquear excepciones', () => {
  const warnings = getBlConsistencyWarnings(
    {
      bl_type: 'HBL',
      carrier: 'COSCO',
      vessel_name: 'VESSEL TWO',
      voyage: '002N',
      port_of_loading: 'Ningbo',
      port_of_discharge: 'Puerto Cortés',
      shipper: 'Proveedor alterno',
      consignee: 'Cliente real',
      gross_weight_kg: '101',
    },
    {
      operational: {
        carrier: 'MAERSK',
        vessel_name: 'VESSEL ONE',
        voyage: '001S',
      },
      parentMbl: {
        carrier: 'MAERSK',
        vessel_name: 'VESSEL ONE',
        voyage: '001S',
        port_of_loading: 'Shanghai',
        port_of_discharge: 'Puerto Cortés',
        gross_weight_kg: 100,
      },
      commercial: {
        shipper: 'Proveedor real',
        consignee: 'Cliente real',
      },
    }
  )

  assert.deepEqual(
    warnings.map(({ field, sourceLabel }) => [field, sourceLabel]),
    [
      ['carrier', 'MBL padre'],
      ['vessel_name', 'MBL padre'],
      ['voyage', 'MBL padre'],
      ['port_of_loading', 'MBL padre'],
      ['gross_weight_kg', 'MBL padre'],
      ['shipper', 'Shipping Instruction / cotización'],
    ]
  )
})

test('detecta ETA anterior al ETD y POL igual a POD', () => {
  const warnings = getBlConsistencyWarnings(
    {
      bl_type: 'MBL',
      etd: '2026-10-10',
      eta: '2026-10-01',
      port_of_loading: 'Shanghai',
      port_of_discharge: 'SHANGHAI',
    },
    { operational: {}, commercial: {} }
  )

  assert.deepEqual(warnings.map(({ kind, field }) => [kind, field]), [
    ['logical', 'eta'],
    ['logical', 'port_of_discharge'],
  ])
})

test('una excepción solo resuelve la diferencia exacta que fue justificada', () => {
  const warning = {
    field: 'carrier',
    label: 'Carrier',
    documentValue: 'COSCO',
    sourceValue: 'MAERSK',
    sourceLabel: 'MBL padre',
    kind: 'source_mismatch',
  }
  const exception = {
    id: 'exception-1',
    bl_id: 'bl-1',
    field_name: 'carrier',
    document_value: 'cosco',
    source_value: 'maersk',
    source_label: 'MBL PADRE',
    reason: 'Switch BL autorizado por el cliente',
    status: 'ACTIVE',
    created_by: 'user-1',
    created_by_name: 'Operador Uno',
    created_at: '2026-09-18T10:00:00Z',
    closed_at: null,
    closed_by: null,
    closure_reason: null,
  }

  assert.equal(isBlValidationExceptionMatch(exception, warning), true)
  assert.equal(
    isBlValidationExceptionMatch(exception, { ...warning, sourceValue: 'HAPAG-LLOYD' }),
    false
  )
  assert.equal(
    isBlValidationExceptionMatch({ ...exception, status: 'REVOKED' }, warning),
    false
  )
})
