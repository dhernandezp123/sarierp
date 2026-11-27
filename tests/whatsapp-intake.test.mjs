import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const intake = loadTs('src/lib/whatsapp-intake.ts')
const permissions = loadTs('src/lib/permissions.ts')
const tenantContext = loadTs('src/lib/tenant-context.ts')

const tenantA = { id: 'e5a10000-0000-4000-8000-000000000100', slug: 'sari', hostname: 'sari.forwarders.app', requestHostname: 'sari.forwarders.app', name: 'Sari', tradeName: 'Sari', logoUrl: null, primaryColor: '#0038BD', secondaryColor: '#07111F' }
const tenantB = { ...tenantA, id: 'e5a10000-0000-4000-8000-000000000200', slug: 'otra', hostname: 'otra.forwarders.app', requestHostname: 'otra.forwarders.app' }

test('normaliza el número a dígitos con código de país', () => {
  assert.equal(intake.normalizeWhatsappPhone('+504 9999-8888'), '50499998888')
  assert.equal(intake.normalizeWhatsappPhone('(1) 305 555 0100'), '13055550100')
  assert.equal(intake.normalizeWhatsappPhone('9999'), null)
  assert.equal(intake.normalizeWhatsappPhone('0504999988'), null)
  assert.equal(intake.normalizeWhatsappPhone('1234567890123456'), null)
  assert.equal(intake.formatWhatsappPhone('50499998888'), '+504 9999 8888')
})

test('solo la empresa configurada recibe el webhook y sin configuración se rechaza', () => {
  assert.equal(intake.isWhatsappTenantAllowed('sari', 'sari'), true)
  assert.equal(intake.isWhatsappTenantAllowed('sari', ' Sari '), true)
  assert.equal(intake.isWhatsappTenantAllowed('otra', 'sari'), false)
  assert.equal(intake.isWhatsappTenantAllowed('sari', ''), false)
  assert.equal(intake.isWhatsappTenantAllowed('sari', undefined), false)
  assert.equal(intake.isWhatsappTenantAllowed(null, 'sari'), false)
})

test('phone_number_id se toma del evento, de conversation o del lote', () => {
  assert.equal(intake.eventPhoneNumberId({ phone_number_id: '111' }), '111')
  assert.equal(intake.eventPhoneNumberId({ conversation: { phone_number_id: '222' } }), '222')
  assert.equal(intake.eventPhoneNumberId({}, { phone_number_id: '333' }), '333')
  assert.equal(intake.isEventForPhoneNumber({ phone_number_id: '111' }, {}, '111'), true)
  assert.equal(intake.isEventForPhoneNumber({ phone_number_id: '999' }, {}, '111'), false)
  assert.equal(intake.isEventForPhoneNumber({}, {}, '111'), false)
  assert.equal(intake.isEventForPhoneNumber({ phone_number_id: '111' }, {}, ''), false)
})

test('rutas: bandeja para Admin, Pricing y Ventas; números solo Admin', () => {
  for (const role of ['Admin', 'Pricing', 'Ventas']) assert.equal(permissions.canAccessPath(role, '/solicitudes-whatsapp'), true, role)
  for (const role of ['Operaciones', 'Contabilidad', 'Finanzas', 'Cliente']) assert.equal(permissions.canAccessPath(role, '/solicitudes-whatsapp'), false, role)
  assert.equal(permissions.canAccessPath('Admin', '/settings/whatsapp'), true)
  for (const role of ['Pricing', 'Ventas', 'Operaciones', 'Contabilidad', 'Finanzas', 'Cliente']) assert.equal(permissions.canAccessPath(role, '/settings/whatsapp'), false, role)
})

function loadRoute(calls, result = { id: 'r1', codigo: 'SQ-0001', creada: true, duplicada: false }) {
  class FakeResponse {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200 }
    static json(body, init = {}) { return new FakeResponse(body, init) }
  }
  return loadTs('src/app/api/whatsapp/webhook/route.ts', {
    'next/server': { NextResponse: FakeResponse },
    '@/src/lib/kapso': {
      verifyKapsoSignature: (raw, signature) => { calls.push(['signature', signature]); return signature === 'ok' },
      sendWhatsAppText: async (to, body) => { calls.push(['send', to, body]) },
      soloDigitos: (value) => value.replace(/\D/g, ''),
    },
    '@/src/lib/whatsapp-db': {
      buscarUsuarioPorWhatsapp: async (tenantId, phone) => { calls.push(['find', tenantId, phone]); return { id: 'u1', nombre: 'Ana' } },
      yaProcesado: async () => false,
      crearSolicitudCotizacion: async (input) => { calls.push(['create', input.tenantId, input.forzar, input.notas]); return result },
    },
  })
}

function request(tenant, body, signature = 'ok') {
  const headers = new Headers({ 'x-webhook-signature': signature, 'x-webhook-event': 'whatsapp.message.received' })
  if (tenant) tenantContext.writeTenantHeaders(headers, tenant)
  return { headers, text: async () => JSON.stringify(body) }
}

const message = (phoneNumberId) => ({
  phone_number_id: phoneNumberId,
  message: { id: 'wamid.1', from: '50499998888', type: 'text', text: { body: 'COTIZACION\nCliente: ABC\nModalidad: LCL\nOrigen: Shenzhen\nDestino: SPS\nMercancía: Repuestos' } },
})

test('webhook: otro tenant, plataforma o falta de configuración responden 404 sin leer el body', async () => {
  const env = { ...process.env }
  try {
    process.env.KAPSO_TENANT_SLUG = 'sari'
    process.env.KAPSO_PHONE_NUMBER_ID = '111'
    const calls = []
    const route = loadRoute(calls)
    assert.equal((await route.POST(request(tenantB, message('111')))).status, 404)
    assert.equal((await route.POST(request(null, message('111')))).status, 404)
    delete process.env.KAPSO_TENANT_SLUG
    assert.equal((await route.POST(request(tenantA, message('111')))).status, 404)
    assert.deepEqual(calls, [])
  } finally { process.env = env }
})

test('webhook: solo procesa eventos del phone_number_id configurado y con el tenant resuelto', async () => {
  const env = { ...process.env }
  try {
    process.env.KAPSO_TENANT_SLUG = 'sari'
    process.env.KAPSO_PHONE_NUMBER_ID = '111'
    const calls = []
    const route = loadRoute(calls)
    assert.equal((await route.POST(request(tenantA, message('111'), 'bad'))).status, 401)
    const ignored = await route.POST(request(tenantA, message('999')))
    assert.equal(ignored.status, 200)
    assert.equal(calls.some(call => call[0] === 'find'), false)
    const batch = await route.POST(request(tenantA, { batch: true, data: [message('999'), { ...message('111'), phone_number_id: undefined, conversation: { phone_number_id: '111' } }] }))
    assert.equal(batch.status, 200)
    assert.deepEqual(calls.filter(call => call[0] === 'find' || call[0] === 'create'), [['find', tenantA.id, '50499998888'], ['create', tenantA.id, false, undefined]])
  } finally { process.env = env }
})

const parser = loadTs('src/lib/parse-cotizacion.ts')

test('parser: líneas sin etiqueta van a notas, sin la primera línea ni las vacías', () => {
  const { datos, faltantes } = parser.parseSolicitud([
    'COTIZACION urgente',
    'Cliente: Distribuidora ABC',
    'Favor cotizar con dos navieras',
    '',
    '- Modalidad: LCL',
    'Origen: Shenzhen',
    'Destino: San Pedro Sula',
    'Notas: Requiere seguro',
    'Mercancía: Repuestos',
    'Hora de retiro: 10:00',
    '   Contacto en origen Sr. Li   ',
  ].join('\r\n'))
  assert.deepEqual(faltantes, [])
  assert.equal(datos.cliente, 'Distribuidora ABC')
  assert.equal(datos.modalidad, 'LCL')
  assert.equal(datos.mercancia, 'Repuestos')
  assert.equal(datos.notas, 'Favor cotizar con dos navieras\nRequiere seguro\nHora de retiro: 10:00\nContacto en origen Sr. Li')
})

test('parser: sin líneas extra ni Notas no crea notas; etiqueta vacía no pasa a notas', () => {
  const { datos, faltantes } = parser.parseSolicitud('COTIZACION\nCliente: ABC\nPeso:\nModalidad: FCL')
  assert.equal(datos.notas, undefined)
  assert.equal(datos.peso, undefined)
  assert.deepEqual(faltantes, ['origen', 'destino', 'mercancia'])
})

test('parser: "5 cajas" sin etiqueta queda en notas', () => {
  const { datos } = parser.parseSolicitud('COTIZACION\nCliente: ABC\n5 cajas\nModalidad: LCL\nOrigen: A\nDestino: B\nMercancía: Repuestos')
  assert.equal(datos.notas, '5 cajas')
})

test('parser: COTIZACION NUEVA se reconoce como solicitud forzada y no pasa a notas', () => {
  assert.equal(parser.esSolicitud('COTIZACION NUEVA\nCliente: A'), true)
  assert.equal(parser.esSolicitudNueva('cotización   nueva\nCliente: A'), true)
  assert.equal(parser.esSolicitudNueva('*COTIZACION NUEVA*'), true)
  assert.equal(parser.esSolicitudNueva('COTIZACION\nNUEVA'), false)
  assert.equal(parser.esSolicitudNueva('COTIZACION'), false)
  assert.equal(parser.esSolicitudNueva('COTIZACION NUEVAS'), false)
  assert.equal(parser.parseSolicitud('COTIZACION NUEVA\nCliente: A').datos.notas, undefined)
  assert.match(parser.FORMATO_AYUDA, /COTIZACION NUEVA/)
  assert.match(parser.FORMATO_AYUDA, /sin etiqueta se guardan como notas/)
})

async function runWebhook(text, result) {
  const env = { ...process.env }
  try {
    process.env.KAPSO_TENANT_SLUG = 'sari'
    process.env.KAPSO_PHONE_NUMBER_ID = '111'
    const calls = []
    const route = loadRoute(calls, result)
    const event = message('111')
    event.message.text.body = text
    assert.equal((await route.POST(request(tenantA, event))).status, 200)
    return calls
  } finally { process.env = env }
}

const solicitud = 'COTIZACION\nCliente: ABC\nModalidad: LCL\nOrigen: Shenzhen\nDestino: SPS\nMercancía: Repuestos\n5 cajas'

test('webhook: duplicado responde con el código existente y no confirma registro', async () => {
  const calls = await runWebhook(solicitud, { id: 'r1', codigo: 'SQ-0007', creada: false, duplicada: true })
  const sent = calls.filter(call => call[0] === 'send')
  assert.equal(sent.length, 1)
  assert.equal(sent[0][2], 'Ya existe la solicitud SQ-0007 con los mismos datos. Si es una solicitud distinta, envíela de nuevo empezando con COTIZACION NUEVA.')
  assert.deepEqual(calls.find(call => call[0] === 'create'), ['create', tenantA.id, false, '5 cajas'])
})

test('webhook: COTIZACION NUEVA pide registrar aunque coincida y confirma', async () => {
  const calls = await runWebhook(solicitud.replace('COTIZACION', 'COTIZACION NUEVA'), { id: 'r2', codigo: 'SQ-0008', creada: true, duplicada: false })
  assert.equal(calls.find(call => call[0] === 'create')[2], true)
  const sent = calls.filter(call => call[0] === 'send')
  assert.equal(sent.length, 1)
  assert.match(sent[0][2], /Solicitud SQ-0008 registrada/)
})

// WA-05. Mensaje real: sin COTIZACION, sin Mercancía y con Medidas después de Volumen.
const mensajeReal = [
  'Cliente: Comercial Hernández',
  'Modalidad: Aéreo',
  'Origen: Miami',
  'Destino: Tegucigalpa',
  'Peso: 12 kg',
  'Volumen: 0.05 cbm',
  'Medidas: 37x37x10 cms',
  'Valor FOB: USD 450',
  '2 cajas',
].join('\n')

test('WA-05: mensaje real sin COTIZACION se acepta y Medidas no pisa Volumen', () => {
  assert.equal(parser.esSolicitud(mensajeReal), true)
  const { datos, faltantes } = parser.parseSolicitud(mensajeReal)
  assert.equal(datos.cliente, 'Comercial Hernández', 'sin encabezado la primera línea no se descarta')
  assert.equal(datos.volumen, '0.05 cbm')
  assert.equal(datos.medidas, '37x37x10 cms')
  assert.equal(datos.valor, 'USD 450')
  assert.equal(datos.notas, '2 cajas')
  assert.deepEqual(faltantes, ['mercancia'])
})

test('WA-05: sin COTIZACION exige 3 etiquetas reconocidas e incluir Cliente', () => {
  assert.equal(parser.esSolicitud('Cliente: ABC\nOrigen: A\nDestino: B'), true)
  assert.equal(parser.esSolicitud('Cliente: ABC\nOrigen: A'), false, 'solo dos etiquetas')
  assert.equal(parser.esSolicitud('Modalidad: LCL\nOrigen: A\nDestino: B\nPeso: 3 kg'), false, 'sin Cliente')
  assert.equal(parser.esSolicitud('Cliente:\nOrigen: A\nDestino: B'), false, 'Cliente vacío no cuenta')
  assert.equal(parser.esSolicitud('Hola, buenos días\nHora: 10:00\nCliente: ABC'), false, 'etiquetas desconocidas no cuentan')
  assert.equal(parser.esSolicitud('Buenas tardes'), false)
})

test('WA-05: etiquetas nuevas de valor y medidas', () => {
  for (const label of ['Valor FOB', 'Valor', 'Valor mercancía', 'valor declarado']) {
    assert.equal(parser.parseSolicitud(`COTIZACION\n${label}: USD 100`).datos.valor, 'USD 100', label)
  }
  for (const label of ['Medidas', 'Dimensiones']) {
    assert.equal(parser.parseSolicitud(`COTIZACION\n${label}: 10x10x10 cm`).datos.medidas, '10x10x10 cm', label)
  }
  assert.equal(parser.parseSolicitud('COTIZACION\nMercancía: Telas\nValor mercancía: USD 9').datos.mercancia, 'Telas', 'valor mercancía no pisa mercancía')
})

test('WA-05: etiqueta repetida no sobrescribe', () => {
  const { datos } = parser.parseSolicitud([
    'COTIZACION', 'Cliente: ABC', 'Volumen: 2 cbm', 'Medidas: 37x37x10 cms', 'Medidas: 50x40x30 cms', 'Volumen: 3 cbm', 'Cliente: XYZ',
  ].join('\n'))
  assert.equal(datos.cliente, 'ABC')
  assert.equal(datos.volumen, '2 cbm')
  assert.equal(datos.medidas, '37x37x10 cms; 50x40x30 cms', 'medidas se suman')
  assert.equal(datos.notas, 'Volumen: 3 cbm\nCliente: XYZ', 'la segunda línea va a notas completa')
})

test('WA-05: faltantes devuelve lo leído como plantilla para completar', () => {
  const { datos, faltantes } = parser.parseSolicitud(mensajeReal)
  const mensaje = parser.mensajeFaltantes(datos, faltantes)
  assert.match(mensaje, /^Faltan datos obligatorios: Mercancía\./)
  for (const linea of ['COTIZACION', 'Cliente: Comercial Hernández', 'Volumen: 0.05 cbm', 'Medidas: 37x37x10 cms', 'Valor FOB: USD 450', 'Mercancía: ', 'Notas: 2 cajas']) {
    assert.ok(mensaje.split('\n').includes(linea), linea)
  }
  // Al completar y reenviar la plantilla se obtienen los mismos datos más lo que faltaba.
  const reenviado = parser.parseSolicitud(mensaje.split('\n').slice(3).join('\n').replace('Mercancía: ', 'Mercancía: Repuestos'))
  assert.deepEqual(reenviado.faltantes, [])
  assert.deepEqual({ ...reenviado.datos, mercancia: undefined }, { ...datos, mercancia: undefined })
  assert.match(parser.FORMATO_AYUDA, /Medidas: /)
  assert.match(parser.FORMATO_AYUDA, /Valor FOB: /)
})

test('WA-05: webhook responde con lo leído cuando falta un obligatorio y no registra', async () => {
  const calls = await runWebhook(mensajeReal, { id: 'x', codigo: 'SQ-0001', creada: true, duplicada: false })
  assert.equal(calls.some(call => call[0] === 'create'), false)
  const sent = calls.filter(call => call[0] === 'send')
  assert.equal(sent.length, 1)
  assert.match(sent[0][2], /Faltan datos obligatorios: Mercancía/)
  assert.match(sent[0][2], /Medidas: 37x37x10 cms/)
})

// WA-05. Mensaje real del vendedor, tal cual.
const mensajeRealVendedor = `Cliente: BOMOHSA
Modalidad: Aereo Consolidado
Origen: HIDROMAC S.A. Calle 19 No.1 -314 calle 30 Autopista Aeropuerto Soledad, Atlántico | Barranquilla, Colombia.
Destino: San pedro Sula, Honduras.
Incoterm: EXW
Peso: 25 kg
Volumen: 4.5 cbm
Bultos: 1 caja
Medidas: 37x37x10 cms

Notas: Requiere seguro. Valor FOB: $1,180`

test('WA-05: mensaje real BOMOHSA', () => {
  assert.equal(parser.esSolicitud(mensajeRealVendedor), true)
  const { datos, faltantes } = parser.parseSolicitud(mensajeRealVendedor)
  assert.equal(datos.cliente, 'BOMOHSA')
  assert.equal(datos.modalidad, 'Aereo Consolidado')
  assert.equal(datos.origen, 'HIDROMAC S.A. Calle 19 No.1 -314 calle 30 Autopista Aeropuerto Soledad, Atlántico | Barranquilla, Colombia.', 'la dirección no se parte')
  assert.equal(datos.destino, 'San pedro Sula, Honduras.')
  assert.equal(datos.incoterm, 'EXW')
  assert.equal(datos.peso, '25 kg')
  assert.equal(datos.volumen, '4.5 cbm')
  assert.equal(datos.bultos, '1 caja')
  assert.equal(datos.medidas, '37x37x10 cms')
  assert.match(datos.notas, /Requiere seguro/)
  assert.doesNotMatch(datos.notas, /Valor FOB/)
  assert.equal(datos.valor, '$1,180')
  assert.deepEqual(faltantes, ['mercancia'], 'solo falta Mercancía')
  const respuesta = parser.mensajeFaltantes(datos, faltantes)
  assert.match(respuesta, /^Faltan datos obligatorios: Mercancía\.\n/)
  assert.ok(respuesta.split('\n').includes('Mercancía: '))
})
