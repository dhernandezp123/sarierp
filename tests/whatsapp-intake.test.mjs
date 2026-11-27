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
