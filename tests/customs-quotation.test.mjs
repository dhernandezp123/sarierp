import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { defaultServiceProducts } = loadTs('src/lib/pricing-catalogs.ts')
const { validatePricingCompleteness } = loadTs('src/lib/pricing-validation.ts')
const { buildCustomsPricingItems, hydrateCustomsCharges, newCustomsCharges, validateCustomsQuotation, nextCustomsStatus } = loadTs('src/lib/customs-quotation.ts')
const { canTransitionForRole } = loadTs('src/lib/quotation-status.ts')
const { ownCustomsZeroCostIds } = loadTs('src/lib/customs-quotation.ts')
const { analyzeCosts } = loadTs('src/lib/cost-analysis.ts')
const { resolveShippingInstructionStatus } = loadTs('src/lib/operation-status.ts')
const data = { commodity: 'Repuestos', puerto_destino: 'Puerto Cortés', valid_until: '2026-11-01', delivery_address: 'San Pedro Sula' }

test('Servicio de Aduanas es un producto independiente de las tarifas Miami', () => {
  const product = defaultServiceProducts.find(item => item.value === 'customs_only')
  assert.ok(product)
  assert.equal(product.appliesClientRates, false)
})

test('aduanas con venta propia y costo cero no exige tarifa, carrier ni vigencia de agente', () => {
  const result = validatePricingCompleteness({
    selectedQuote: { service_product: 'customs_only', quote_type: 'Aduanas' },
    pricingItems: [{ sale_amount: 200, cost_amount: 0, quantity: 1 }],
  })
  assert.deepEqual(result.errors, [])
  assert.equal(result.isValid, true)
})

test('aduanas no permite aprobar sin venta; FCL sigue exigiendo agente', () => {
  assert.equal(validatePricingCompleteness({ selectedQuote: { service_product: 'customs_only' } }).isValid, false)
  assert.equal(validatePricingCompleteness({
    selectedQuote: { service_product: 'other_origin_fcl', quote_type: 'FCL' },
    pricingItems: [{ sale_amount: 200 }],
  }).isValid, false)
})

test('honorarios y entrega generan cargos propios con costo, venta e ISV; cero fiscal explícito se conserva', () => {
  const charges = [{ ...newCustomsCharges()[0], sale: '200' }, { code: 'customs_delivery', description: 'Entrega final', cost: '50', sale: '100', taxable: true }]
  assert.equal(validateCustomsQuotation(charges, data), null)
  const items = buildCustomsPricingItems('q', charges, 15, 'Sari Express', 'seller')
  assert.equal(items[0].cost_amount, 0)
  assert.equal(items[0].tax_amount, 30)
  assert.equal(items[1].total_amount, 115)
  assert.equal(items[1].supplier, 'Sari Express')
  assert.equal(items.reduce((sum, item) => sum + item.total_amount, 0), 345)
  assert.ok(items.every(item => item.item_type === 'destination_charge'))
  assert.equal(buildCustomsPricingItems('q', charges, 0, 'Sari')[0].total_amount, 200)
})

test('editar o duplicar conserva precio, costo, cantidad y tasa guardada aunque cambie el default', () => {
  const charges = hydrateCustomsCharges([{ rate_code: 'customs_service', description: 'Honorarios', sale_amount: 100, cost_amount: 20, quantity: 2, taxable: true, tax_rate: 0 }])
  const item = buildCustomsPricingItems('new-id', charges, 15, 'Sari')[0]
  assert.equal(item.sale_amount, 200)
  assert.equal(item.cost_amount, 40)
  assert.equal(item.tax_rate, 0)
  assert.equal(item.total_amount, 200)
})

test('borrador conserva la entrega sin precio; aprobación exige honorarios, aduana y dirección', () => {
  const charges = [...newCustomsCharges(), { code: 'customs_delivery', description: 'Entrega', sale: '', cost: '0', taxable: true }]
  assert.equal(validateCustomsQuotation(charges, data, true), null)
  assert.equal(buildCustomsPricingItems('q', charges, 15, 'Sari').length, 2)
  assert.ok(validateCustomsQuotation(charges, data))
  charges[0].sale = '200'; charges[1].sale = '100'
  for (const patch of [{ commodity: '' }, { puerto_destino: '' }, { valid_until: '' }, { delivery_address: '' }])
    assert.ok(validateCustomsQuotation(charges, { ...data, ...patch }))
  for (const sale of ['-1', 'NaN', 'Infinity']) assert.ok(validateCustomsQuotation([{ ...charges[0], sale }], data))
})

test('Ventas aprueba un borrador de aduanas; el ciclo de FCL y los roles de lectura se conservan', () => {
  assert.equal(canTransitionForRole('Borrador', 'Pricing Aprobado', 'Ventas', 'customs_only'), true)
  assert.equal(canTransitionForRole('Borrador', 'Pricing Aprobado', 'Ventas', 'other_origin_fcl'), false)
  assert.equal(canTransitionForRole('Borrador', 'Pricing Aprobado', 'Operaciones', 'customs_only'), false)
  assert.equal(canTransitionForRole('Borrador', 'Pendiente de Fijar Precios', 'Ventas', 'customs_only'), false)
})

test('aduanas se cierra sin booking; entrega cotizada impide saltar de liberado al cierre', () => {
  assert.equal(nextCustomsStatus('Pendiente Validación', false), 'En gestión aduanera')
  assert.equal(nextCustomsStatus('En gestión aduanera', false), 'Liberado')
  assert.equal(nextCustomsStatus('Liberado', false), 'Finalizado')
  assert.equal(nextCustomsStatus('Liberado', true), 'Entregado')
  assert.equal(nextCustomsStatus('Entregado', true), 'Finalizado')
  assert.equal(nextCustomsStatus('Finalizado', true), null)
  assert.equal(nextCustomsStatus('Cancelada', false), null)
  assert.equal(resolveShippingInstructionStatus({ shipment_status: 'Pendiente Validación', operational_status: 'Liberado' }), 'Liberado')
})

test('honorarios propios de costo externo cero permiten revisión financiera sin inventar facturas', () => {
  const items = [{ id: 'own', rate_code: 'customs_service', description: 'Honorarios', item_type: 'destination_charge', quantity: 1, cost_amount: 0, sale_amount: 200, currency: 'USD', supplier: 'Sari Express' }]
  const ids = ownCustomsZeroCostIds('customs_only', items)
  assert.deepEqual(ids, ['own'])
  const [pending] = analyzeCosts(items, [], false, ids)
  assert.equal(pending.reconciled, true)
  assert.equal(pending.closed, false)
  assert.equal(pending.registeredProfit, null)
  const [approved] = analyzeCosts(items, [], true, ids)
  assert.equal(approved.closed, true)
  assert.equal(approved.base, 0)
  assert.equal(approved.registeredProfit, 200)
  assert.equal(analyzeCosts(items, [], true)[0].closed, false)
  assert.deepEqual(ownCustomsZeroCostIds('other_origin_fcl', items), [])
  assert.deepEqual(ownCustomsZeroCostIds('customs_only', [{ ...items[0], cost_amount: 20 }]), [])
  const delivery = { ...items[0], id: 'delivery', rate_code: 'customs_delivery', sale_amount: 100 }
  assert.equal(analyzeCosts([...items, delivery], [], true, ids)[0].closed, false)
})

test('margen menor al 5% requiere justificación interna también en el flujo propio', () => {
  const charges = [{ ...newCustomsCharges()[0], sale: '100', cost: '110' }]
  assert.ok(validateCustomsQuotation(charges, data))
  assert.equal(validateCustomsQuotation(charges, { ...data, pricing_notes: 'Ajuste comercial autorizado' }), null)
})
