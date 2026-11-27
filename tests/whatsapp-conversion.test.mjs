import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const conversion = loadTs('src/lib/whatsapp-conversion.ts')
const products = loadTs('src/lib/quotation-products.ts', {
  '@/src/lib/pricing-catalogs': { defaultServiceProducts: [], fetchActiveServiceProducts: async () => [], tradeDirections: [], usesClientRatesFromCatalog: () => false },
})

test('modalidad de WhatsApp -> producto, transporte y modalidad del sistema', () => {
  const cases = {
    LCL: ['other_origin_lcl', 'Marítima', 'LCL'],
    'Marítimo LCL': ['other_origin_lcl', 'Marítima', 'LCL'],
    'carga consolidada': ['other_origin_lcl', 'Marítima', 'LCL'],
    FCL: ['other_origin_fcl', 'Marítima', 'FCL'],
    "1 contenedor 40'": ['other_origin_fcl', 'Marítima', 'FCL'],
    Aérea: ['other_origin_air', 'Aéreo', 'Consolidado'],
    'aereo consolidado': ['other_origin_air', 'Aéreo', 'Consolidado'],
    Courier: ['courier', 'Aéreo', 'Courier'],
    'courier aereo': ['courier', 'Aéreo', 'Courier'],
    LTL: ['usa_ltl_ftl', 'Terrestre', 'LTL'],
    'Terrestre FTL': ['usa_ltl_ftl', 'Terrestre', 'FTL'],
    Terrestre: ['usa_ltl_ftl', 'Terrestre', ''],
  }
  for (const [input, [service_product, tipo_transporte, quote_type]] of Object.entries(cases)) {
    assert.deepEqual(conversion.mapWhatsappModality(input), { service_product, tipo_transporte, quote_type }, input)
  }
  for (const input of ['', 'no se', 'LCL o aéreo', 'FCL/LCL', 'marítimo']) assert.equal(conversion.mapWhatsappModality(input), null, input)
})

test('cada modalidad mapeada respeta la regla de transporte de su producto', () => {
  for (const input of ['LCL', 'FCL', 'Aérea', 'Courier', 'LTL', 'FTL', 'Terrestre']) {
    const mapped = conversion.mapWhatsappModality(input)
    const rule = products.getProductTransportRule(mapped.service_product)
    assert.equal(rule.transport, mapped.tipo_transporte, input)
    assert.ok(mapped.quote_type === '' || rule.modalities.includes(mapped.quote_type), input)
  }
})

test('cantidades solo si son inequívocas y en la unidad esperada', () => {
  assert.equal(conversion.parseWhatsappQuantity('1200 kg', 'kg'), 1200)
  assert.equal(conversion.parseWhatsappQuantity('1,200 KGS', 'kg'), 1200)
  assert.equal(conversion.parseWhatsappQuantity('850', 'kg'), 850)
  assert.equal(conversion.parseWhatsappQuantity('1.2 toneladas', 'kg'), null)
  assert.equal(conversion.parseWhatsappQuantity('2000 lbs', 'kg'), null)
  assert.equal(conversion.parseWhatsappQuantity('4.5 cbm', 'cbm'), 4.5)
  assert.equal(conversion.parseWhatsappQuantity('4,5 m3', 'cbm'), 4.5)
  assert.equal(conversion.parseWhatsappQuantity('2x2x2 m', 'cbm'), null)
  assert.equal(conversion.parseWhatsappQuantity('3 pallets', 'count'), 3)
  assert.equal(conversion.parseWhatsappQuantity('5 cajas', 'count'), 5)
  assert.equal(conversion.parseWhatsappQuantity('2.5 cajas', 'count'), null)
  assert.equal(conversion.parseWhatsappQuantity('2 x 40', 'count'), null)
  assert.equal(conversion.parseWhatsappQuantity('0', 'count'), null)
  assert.equal(conversion.parseWhatsappQuantity(null, 'kg'), null)
})

test('sugerencias de clientes aproximadas, ignorando sufijos societarios y tildes', () => {
  const clients = [
    { id: '1', nombre: 'Distribuidora ABC, S.A. de C.V.' },
    { id: '2', nombre: 'Distribuidora ABD' },
    { id: '3', nombre: 'Importadora Centroamericana' },
    { id: '4', nombre: 'Ferretería El Martillo' },
  ]
  const abc = conversion.suggestClients(clients, 'distribuidora abc')
  assert.equal(abc[0].client.id, '1')
  assert.ok(abc[0].score >= 0.9)
  assert.ok(abc.some(item => item.client.id === '2'), 'nombre parecido también se sugiere')
  assert.ok(!abc.some(item => item.client.id === '4'))
  assert.equal(conversion.suggestClients(clients, 'Ferreteria el martillo')[0].client.id, '4')
  assert.equal(conversion.suggestClients(clients, 'Importadora Centroamerica')[0].client.id, '3')
  assert.deepEqual(conversion.suggestClients(clients, 'Panadería Sol'), [])
  assert.deepEqual(conversion.suggestClients(clients, 'S.A.'), [])
})

test('prellenado del formulario y notas internas con lo no estructurado', () => {
  const { modality, fields } = conversion.buildWhatsappPrefill({
    id: 'r1', codigo: 'SQ-0007', cliente: 'Distribuidora ABC', modalidad: 'LCL', origen: 'Shenzhen', destino: 'San Pedro Sula',
    mercancia: 'Repuestos', peso: '1200 kg', volumen: 'aprox 4 cbm', bultos: '3 pallets', incoterm: 'fob', notas: '5 cajas',
  }, 'Valeria Soto')
  assert.equal(modality.quote_type, 'LCL')
  assert.equal(fields.service_product, 'other_origin_lcl')
  assert.equal(fields.origen, 'Shenzhen')
  assert.equal(fields.commodity, 'Repuestos')
  assert.equal(fields.incoterm, 'FOB')
  assert.equal(fields.peso_kg, '1200')
  assert.equal(fields.volumen_cbm, '', 'texto ambiguo no se convierte en número')
  assert.equal(fields.cantidad_bultos, '3')
  assert.match(fields.pricing_notes, /Solicitud WhatsApp SQ-0007 de Valeria Soto/)
  assert.match(fields.pricing_notes, /Volumen indicado: aprox 4 cbm/)
  assert.match(fields.pricing_notes, /Notas: 5 cajas/)

  const unknown = conversion.buildWhatsappPrefill({ id: 'r2', codigo: 'SQ-0008', cliente: 'X', modalidad: 'lo más barato', origen: 'A', destino: 'B',
    mercancia: 'C', peso: null, volumen: null, bultos: null, incoterm: null, notas: null }, 'Ana')
  assert.equal(unknown.modality, null)
  assert.deepEqual([unknown.fields.service_product, unknown.fields.tipo_transporte, unknown.fields.quote_type], ['', '', ''])
})

test('enlace de conversión con cliente existente o nuevo', () => {
  assert.equal(conversion.whatsappConversionHref('r1', { id: 'c1' }), '/quotations/new?fromWhatsapp=r1&cliente=c1')
  assert.equal(conversion.whatsappConversionHref('r1', 'new'), '/quotations/new?fromWhatsapp=r1&nuevoCliente=1')
})

test('el enlace a la cotización respeta el acceso de cada rol', () => {
  assert.equal(conversion.quotationHrefForRole('Ventas', 'q1'), '/quotations/q1')
  assert.equal(conversion.quotationHrefForRole('Admin', 'q1'), '/quotations/q1')
  assert.equal(conversion.quotationHrefForRole('Pricing', 'q1'), '/pricing-comparison?quotation=q1')
})

test('WA-05: medidas y valor declarado pasan a las notas internas', () => {
  const { fields } = conversion.buildWhatsappPrefill({
    id: 'r1', solicitado_por_id: 'u1', codigo: 'SQ-0009', cliente: 'X', modalidad: 'Aéreo', origen: 'Miami', destino: 'TGU', mercancia: 'Ropa',
    peso: '12 kg', volumen: '0.05 cbm', medidas: '37x37x10 cms', bultos: '2', incoterm: null, valor_declarado: 'USD 450', notas: null,
  }, 'Ana')
  assert.match(fields.pricing_notes, /Medidas indicadas: 37x37x10 cms/)
  assert.match(fields.pricing_notes, /Valor declarado indicado: USD 450/)
  assert.equal(fields.volumen_cbm, '0.05')
})

test('WA-05: "Aereo Consolidado" del mensaje real -> Aéreo / Consolidado', () => {
  assert.deepEqual(conversion.mapWhatsappModality('Aereo Consolidado'), { service_product: 'other_origin_air', tipo_transporte: 'Aéreo', quote_type: 'Consolidado' })
  const { fields } = conversion.buildWhatsappPrefill({
    id: 'r1', solicitado_por_id: 'u1', codigo: 'SQ-0010', cliente: 'BOMOHSA', modalidad: 'Aereo Consolidado', origen: 'Barranquilla', destino: 'San pedro Sula, Honduras.',
    mercancia: 'Repuestos', peso: '25 kg', volumen: '4.5 cbm', medidas: '37x37x10 cms', bultos: '1 caja', incoterm: 'EXW', valor_declarado: '$1,180', notas: 'Requiere seguro.',
  }, 'Ana')
  assert.deepEqual([fields.service_product, fields.tipo_transporte, fields.quote_type], ['other_origin_air', 'Aéreo', 'Consolidado'])
  assert.deepEqual([fields.peso_kg, fields.volumen_cbm, fields.cantidad_bultos, fields.incoterm], ['25', '4.5', '1', 'EXW'])
  assert.match(fields.pricing_notes, /Medidas indicadas: 37x37x10 cms/)
  assert.match(fields.pricing_notes, /Valor declarado indicado: \$1,180/)
})
