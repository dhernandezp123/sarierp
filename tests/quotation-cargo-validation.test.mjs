import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { validateCargoLines, summarizeUncarriedCargo, isBlankCargoLine } = loadTs('src/lib/quotation-cargo.ts')
const { getCargoStructure, getProductTransportRule, resolveProductQuoteType } = loadTs('src/lib/quotation-products.ts')

const line = (overrides = {}) => ({
  id: overrides.id || 'l1', quantity: '1', packageType: 'Caja', length: '', width: '', height: '',
  dimensionUnit: 'm', weight: '', weightUnit: 'lbs', volumeMode: 'dimensions', manualCbm: '', ...overrides,
})
const complete = (id) => line({ id, length: '1', width: '1', height: '1', weight: '100' })

test('la fila inicial vacía no permite enviar carga suelta a Pricing', () => {
  const result = validateCargoLines([line()], 'pricing')
  assert.match(result.message, /al menos una línea/)
  assert.deepEqual(result.issuesByLine.l1, ['volume', 'weight'])
  assert.equal(isBlankCargoLine(line()), true)
})

test('Pricing señala líneas con datos parciales aunque otra esté completa', () => {
  const result = validateCargoLines([complete('a'), line({ id: 'b', weight: '50' })], 'pricing')
  assert.equal(result.message, 'Completa la línea de carga #2: falta volumen (dimensiones o CBM)')
  assert.equal(result.issuesByLine.a, undefined)
})

test('Pricing exige peso; CBM manual cuenta como volumen', () => {
  const noWeight = line({ volumeMode: 'manual', manualCbm: '2.5' })
  assert.match(validateCargoLines([noWeight], 'pricing').message, /falta peso/)
  assert.equal(validateCargoLines([{ ...noWeight, weight: '10' }], 'pricing').message, null)
})

test('borrador acepta la fila vacía y sin peso, pero no descarta líneas con datos', () => {
  assert.equal(validateCargoLines([line()], 'draft').message, null)
  assert.equal(validateCargoLines([line({ length: '1', width: '1', height: '1' })], 'draft').message, null)
  assert.match(validateCargoLines([line({ weight: '20' })], 'draft').message, /#1: falta volumen/)
  assert.match(validateCargoLines([line({ length: '1', width: '1', height: '1', quantity: '0' })], 'draft').message, /falta cantidad/)
})

test('duplicado FCL normalizado a producto LCL informa contenedores y peso no trasladados', () => {
  const quoteType = resolveProductQuoteType(getProductTransportRule('other_origin_lcl'), 'FCL')
  assert.equal(quoteType, 'LCL')
  const summary = summarizeUncarriedCargo({
    containers: [{ quantity: 2, container_type_name: "40' HC" }],
    cargoLines: [],
    quote: { peso_kg: 2000 },
  }, getCargoStructure(quoteType))
  assert.deepEqual(summary, ["Contenedores: 2 × 40' HC", 'Peso: 2,000.00 kg'])
})

test('duplicado LCL normalizado a FCL informa sus líneas de carga', () => {
  const summary = summarizeUncarriedCargo({
    containers: [],
    cargoLines: [{ quantity: 3, cbm: 1.5, weight_lbs: 100 }],
    quote: { peso_kg: 136, volumen_cbm: 1.5 },
  }, 'containers')
  assert.deepEqual(summary, ['Líneas de carga: 1 (3 bultos, 1.500 CBM, 300 lbs)'])
})

test('sin cambio de estructura y con líneas copiadas no hay aviso; legacy sin líneas sí', () => {
  const source = { containers: [], cargoLines: [{ quantity: 1, cbm: 1, weight_lbs: 10 }], quote: { peso_kg: 5 } }
  assert.deepEqual(summarizeUncarriedCargo(source, 'loose'), [])
  assert.deepEqual(
    summarizeUncarriedCargo({ containers: [], cargoLines: [], quote: { volumen_cbm: 3, cantidad_bultos: 4 } }, 'loose'),
    ['Volumen: 3.000 CBM', 'Bultos: 4']
  )
  assert.deepEqual(
    summarizeUncarriedCargo({ containers: [], cargoLines: [], quote: { container_type: '20GP', container_qty: 2, peso_kg: 900 } }, 'containers'),
    ['Contenedor (dato anterior): 2 × 20GP']
  )
})

test('estructura de carga por modalidad', () => {
  assert.equal(getCargoStructure('FTL'), 'containers')
  assert.equal(getCargoStructure('Courier'), 'loose')
  assert.equal(getCargoStructure('Aduanas'), 'none')
  assert.equal(getCargoStructure(''), 'none')
})

test('peso cobrable aéreo usa el divisor IATA compartido con Pricing', () => {
  const { getAirChargeableWeights, AIR_VOLUMETRIC_KG_PER_CBM } = loadTs('src/lib/quotation-cargo.ts')
  assert.equal(Number(AIR_VOLUMETRIC_KG_PER_CBM.toFixed(4)), 166.6667)
  assert.equal(getAirChargeableWeights(22.68, 1).chargeableWeightKg, AIR_VOLUMETRIC_KG_PER_CBM)
  assert.equal(getAirChargeableWeights(500, 1).chargeableWeightKg, 500)
})
