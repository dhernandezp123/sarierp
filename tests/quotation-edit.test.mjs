import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { getCargoSignature, getEditCargoTotals, getProductRuleMismatch, planQuotationEditCargo } = loadTs('src/lib/quotation-edit.ts')
const { createEmptyCargoLine, normalizeLegacyBlankInchLine } = loadTs('src/lib/quotation-cargo.ts')

const line = (overrides = {}) => ({ ...createEmptyCargoLine(), ...overrides })
const complete = (overrides = {}) => line({ length: '1', width: '1', height: '1', weight: '100', ...overrides })
const container = { container_type_id: 'c40', container_type_name: "40' HC", quantity: 2, notes: null }
const plan = (overrides = {}) => planQuotationEditCargo({
  status: 'Borrador',
  sendToPricing: false,
  isMiamiFlow: false,
  quoteType: 'LCL',
  cargoIntact: false,
  containerLines: [],
  cargoLines: [],
  ...overrides,
})

test('borrador descarta filas vacías, admite falta de peso y bloquea filas sin volumen', () => {
  const blank = line()
  const noWeight = complete({ weight: '' })
  const result = plan({ cargoLines: [noWeight, blank] })
  assert.equal(result.ok, true)
  assert.equal(result.replace, true)
  assert.deepEqual(result.cargoLinesToSave.map((item) => item.id), [noWeight.id])

  const partial = line({ weight: '50' })
  const blocked = plan({ cargoLines: [partial] })
  assert.equal(blocked.ok, false)
  assert.equal(blocked.field, `cargo-line-${partial.id}`)
})

test('borrador modificado con solo filas vacías se bloquea porque la RPC exige una línea', () => {
  const result = plan({ cargoLines: [line()] })
  assert.deepEqual([result.ok, result.field], [false, 'cargo'])
  // Sin tocar la carga no se reemplaza nada y el guardado procede.
  const intact = plan({ cargoLines: [line()], cargoIntact: true })
  assert.deepEqual([intact.ok, intact.replace, intact.warning], [true, false, null])
})

test('enviar a Pricing exige carga completa aunque no se haya modificado', () => {
  const result = plan({ sendToPricing: true, cargoIntact: true, cargoLines: [complete({ weight: '' })] })
  assert.equal(result.ok, false)
  assert.match(result.message, /falta peso/)
  const ok = plan({ sendToPricing: true, cargoIntact: true, cargoLines: [complete()] })
  assert.deepEqual([ok.ok, ok.replace], [true, true])
})

test('fuera de Borrador: carga modificada exige completa; intacta se conserva con aviso', () => {
  const historical = [complete({ weight: '' })]
  const modified = plan({ status: 'Pricing Aprobado', cargoLines: historical })
  assert.equal(modified.ok, false)

  const intact = plan({ status: 'Pricing Aprobado', cargoIntact: true, cargoLines: historical })
  assert.equal(intact.ok, true)
  assert.equal(intact.replace, false)
  assert.deepEqual(intact.cargoLinesToSave, [])
  assert.match(intact.warning, /Se conservó la carga registrada.*falta peso/)
  assert.deepEqual(intact.issuesByLine[historical[0].id], ['weight'])

  const intactComplete = plan({ status: 'Enviada al Cliente', cargoIntact: true, cargoLines: [complete()] })
  assert.deepEqual([intactComplete.ok, intactComplete.replace, intactComplete.warning], [true, false, null])
})

test('contenedores: modificados exigen al menos uno; intactos sin contenedores se conservan', () => {
  assert.deepEqual([plan({ quoteType: 'FCL', containerLines: [container] }).replace], [true])
  const empty = plan({ quoteType: 'FCL' })
  assert.deepEqual([empty.ok, empty.field], [false, 'containers'])
  const intact = plan({ quoteType: 'FTL', status: 'Ganada', cargoIntact: true })
  assert.equal(intact.ok, true)
  assert.equal(intact.replace, false)
  assert.match(intact.warning, /no tiene contenedores/)
})

test('Miami conserva su regla: reemplaza todas sus líneas sin validar peso por línea', () => {
  const lines = [line(), line({ weight: '20' })]
  const result = plan({ isMiamiFlow: true, cargoIntact: true, cargoLines: lines })
  assert.deepEqual([result.ok, result.replace, result.cargoLinesToSave.length], [true, true, 2])
  assert.equal(plan({ isMiamiFlow: true }).ok, false)
})

test('sin modalidad no se reemplaza la carga', () => {
  assert.deepEqual([plan({ quoteType: '' }).ok, plan({ quoteType: '' }).replace], [true, false])
})

test('la huella detecta cambios de modalidad, contenedores y líneas', () => {
  const lines = [complete()]
  const base = getCargoSignature('LCL', [], lines)
  assert.equal(getCargoSignature('LCL', [], lines.map((item) => ({ ...item }))), base)
  assert.notEqual(getCargoSignature('FCL', [], lines), base)
  assert.notEqual(getCargoSignature('LCL', [container], lines), base)
  assert.notEqual(getCargoSignature('LCL', [], [{ ...lines[0], weight: '101' }]), base)
})

test('regla de producto: solo marca inconsistencias y propone el ajuste', () => {
  assert.equal(getProductRuleMismatch('other_origin_lcl', 'Marítima', 'LCL'), null)
  assert.equal(getProductRuleMismatch('miami_lcl', 'Marítima', 'FCL'), null)
  assert.deepEqual(getProductRuleMismatch('other_origin_lcl', 'Marítima', 'FCL').target,
    { tipo_transporte: 'Marítima', quote_type: 'LCL' })
  assert.deepEqual(getProductRuleMismatch('usa_ltl_ftl', 'Marítima', 'LCL').target,
    { tipo_transporte: 'Terrestre', quote_type: '' })
})

test('líneas guardadas en pulgadas sin medidas se abren en metros', () => {
  assert.equal(normalizeLegacyBlankInchLine(line({ dimensionUnit: 'in', weight: '5' })).dimensionUnit, 'm')
  assert.equal(normalizeLegacyBlankInchLine(line({ dimensionUnit: 'in', length: '10' })).dimensionUnit, 'in')
  assert.equal(normalizeLegacyBlankInchLine(line({ dimensionUnit: 'in', volumeMode: 'manual', manualCbm: '2' })).dimensionUnit, 'in')
  assert.equal(normalizeLegacyBlankInchLine(line({ dimensionUnit: 'cm' })).dimensionUnit, 'cm')
})

test('modalidad vacía: se conserva si venía vacía; vaciarla fuera de Borrador o enviar sin ella se bloquea', () => {
  const emptied = plan({ status: 'Pricing Aprobado', quoteType: '', cargoIntact: false })
  assert.deepEqual([emptied.ok, emptied.field], [false, 'quote_type'])
  const historical = plan({ status: 'Pricing Aprobado', quoteType: '', cargoIntact: true })
  assert.deepEqual([historical.ok, historical.replace], [true, false])
  assert.equal(plan({ quoteType: '', cargoIntact: false }).ok, true)
  assert.equal(plan({ quoteType: '', cargoIntact: true, sendToPricing: true }).ok, false)
  assert.equal(plan({ quoteType: 'Aduanas', status: 'Ganada', cargoIntact: false }).ok, true)
})

test('producto inconsistente: se guarda el registro histórico pero no se envía a Pricing', () => {
  const lines = { quoteType: 'FCL', containerLines: [container], cargoIntact: true }
  const saved = plan({ ...lines, status: 'Enviada al Cliente', productMismatch: true })
  assert.deepEqual([saved.ok, saved.replace], [true, false])
  const sent = plan({ ...lines, sendToPricing: true, productMismatch: true })
  assert.deepEqual([sent.ok, sent.field], [false, 'quote_type'])
  assert.match(sent.message, /Ajusta transporte y modalidad al producto/)
  assert.equal(plan({ isMiamiFlow: true, cargoLines: [line()], sendToPricing: true, productMismatch: true }).ok, false)
})

test('totales del payload: sin reemplazo se omiten para conservar lbs y FT³ guardados', () => {
  const formTotals = { peso_kg: '45.36', volumen_cbm: '2.5', cantidad_bultos: '3' }
  // Modalidad vacía histórica (plan sin reemplazo): ninguna clave de totales.
  const historical = plan({ status: 'Pricing Aprobado', quoteType: '', cargoIntact: true })
  assert.deepEqual(getEditCargoTotals({ structure: 'none', replace: historical.replace, savedCargoLines: [], formTotals }), {})
  assert.deepEqual(getEditCargoTotals({ structure: 'loose', replace: false, savedCargoLines: [], formTotals }), {})
  assert.deepEqual(getEditCargoTotals({ structure: 'containers', replace: false, savedCargoLines: [], formTotals }), {})

  const loose = getEditCargoTotals({ structure: 'loose', replace: true, savedCargoLines: [complete({ quantity: '2' })], formTotals })
  assert.equal(loose.cantidad_bultos, 2)
  assert.equal(loose.peso_lbs, 200)
  assert.equal(loose.volumen_cbm, 2)

  assert.deepEqual(getEditCargoTotals({ structure: 'containers', replace: true, savedCargoLines: [], formTotals }),
    { peso_kg: 45.36, peso_lbs: null, volumen_cbm: 2.5, volumen_ft3: null, cantidad_bultos: 3 })
})
