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

function loadRoute(calls) {
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
      crearSolicitudCotizacion: async (input) => { calls.push(['create', input.tenantId]); return { id: 'r1', codigo: 'SQ-0001', creada: true } },
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
    assert.deepEqual(calls.filter(call => call[0] === 'find' || call[0] === 'create'), [['find', tenantA.id, '50499998888'], ['create', tenantA.id]])
  } finally { process.env = env }
})
