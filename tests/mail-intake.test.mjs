import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { classifyIntakeMessage, validateGraphCursor, SARI_MAILBOX, intakeAcknowledgement } = loadTs('src/lib/mail-intake.ts')
const message = (subject, content = '') => ({ id: 'm1', subject, body: { content }, from: { emailAddress: { address: 'cliente@example.com' } } })

test('acepta solicitudes explícitas en español e inglés; mantiene ambigüedad para revisión', () => {
  assert.equal(classifyIntakeMessage(message('Solicitud de cotización', '2 contenedores'), SARI_MAILBOX), 'request')
  assert.equal(classifyIntakeMessage(message('Carga nueva', 'Por favor cotizar transporte desde Miami'), SARI_MAILBOX), 'request')
  assert.equal(classifyIntakeMessage(message('New shipment', 'Please send a quotation'), SARI_MAILBOX), 'request')
  assert.equal(classifyIntakeMessage(message('Tarifas actualizadas'), SARI_MAILBOX), 'review')
})
test('no genera otra referencia para seguimientos ni responde a automáticos o listas', () => {
  for (const subject of ['Re: Solicitud de cotización', 'Seguimiento SARIHN-2610-0270-AP']) {
    assert.equal(classifyIntakeMessage(message(subject, 'Favor cotizar'), SARI_MAILBOX), 'review')
  }
  const automatic = message('Solicitud de cotización')
  automatic.internetMessageHeaders = [{ name: 'Auto-Submitted', value: 'auto-replied' }]
  assert.equal(classifyIntakeMessage(automatic, SARI_MAILBOX), 'ignored')
  automatic.internetMessageHeaders = [{ name: 'List-Unsubscribe', value: '<mailto:unsubscribe@example.com>' }]
  assert.equal(classifyIntakeMessage(automatic, SARI_MAILBOX), 'ignored')
  automatic.from.emailAddress.address = SARI_MAILBOX.toUpperCase()
  assert.equal(classifyIntakeMessage(automatic, SARI_MAILBOX), 'ignored')
})
test('un cursor no puede enviar el token Graph a otro host ni consultar otro buzón', () => {
  const valid = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SARI_MAILBOX)}/mailFolders/inbox/messages/delta?$deltatoken=x`
  assert.equal(validateGraphCursor(valid, SARI_MAILBOX), valid)
  assert.doesNotThrow(() => validateGraphCursor(valid.replace('%40', '@'), SARI_MAILBOX))
  for (const invalid of [valid.replace('graph.microsoft.com', 'evil.example'), valid.replace('pricing', 'ventas'), valid.replace('https:', 'http:'), valid.replace('/delta?', '?')]) {
    assert.throws(() => validateGraphCursor(invalid, SARI_MAILBOX))
  }
  assert.match(intakeAcknowledgement('SARIHN-2610-0270-AP'), /SARIHN-2610-0270-AP/)
})

test('el ejecutor rechaza llamadas sin secreto antes de acceder a correo o base', async () => {
  const { POST } = loadTs('src/app/api/integrations/outlook/run/route.ts', {
    '@/src/lib/mail-intake': { ...loadTs('src/lib/mail-intake.ts'), OUTLOOK_INTAKE_STANDBY: false },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/src/lib/server/outlook-intake': { intakeAdminClient: () => { throw new Error('No debe consultar la base') } },
  })
  const result = await POST(new Request('https://sari.forwarders.app/api/integrations/outlook/run', { method: 'POST' }))
  assert.equal(result.status, 401)
})

test('timeout despues de un envio deja estado incierto y un replay no reenvia', async () => {
  const secretBefore = process.env.SARI_OUTLOOK_RUN_SECRET
  const outboundBefore = process.env.OUTBOUND_EMAIL_ENABLED
  process.env.SARI_OUTLOOK_RUN_SECRET = 'test-only-run-secret-32-characters-long'
  process.env.OUTBOUND_EMAIL_ENABLED = 'true'
  let deliveryState = 'ready'
  let sends = 0
  const cfg = { enabled: true, mailbox: SARI_MAILBOX, starts_at: '2026-10-02T00:00:00Z' }
  const admin = { from(table) {
    let change
    let selection
    const filters = {}
    const query = {
      update(value) { change = value; return this },
      select(value) { selection = value; return this },
      eq(name, value) { filters[name] = value; return this },
      or() { return this }, gte() { return this }, limit() { return this },
      single() { return this }, maybeSingle() { return this },
      then(resolve) {
        let data = null
        if (table === 'tenant_domains') data = { tenant_id: 'sari' }
        if (table === 'mail_intake_settings') data = cfg
        if (table === 'mail_intake_runtime' && selection) data = { cursor: null }
        if (table === 'mail_intake_messages') {
          if (change) {
            if (!filters.status || filters.status === deliveryState) {
              deliveryState = change.status
              if (selection) data = { id: 'message-row' }
            }
          } else data = deliveryState === 'ready' ? [{ id: 'message-row', message_id: 'graph-message', quotations: { quotation_number: 'SARIHN-2610-0001-AP' } }] : []
        }
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return query
  } }
  const { POST } = loadTs('src/app/api/integrations/outlook/run/route.ts', {
    '@/src/lib/mail-intake': { ...loadTs('src/lib/mail-intake.ts'), OUTLOOK_INTAKE_STANDBY: false },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/src/lib/server/outlook-intake': {
      intakeAdminClient: () => admin, isIntakeDemo: async () => false, outlookToken: async () => 'test-token',
      inboxDeltaUrl: () => 'https://graph.microsoft.com/test',
      graphRequest: async (_token, _url, options) => {
        if (options?.method === 'POST') { sends++; throw new Error('Timeout simulado tras recibir Microsoft el envío') }
        return { ok: true, json: async () => ({ value: [], '@odata.deltaLink': 'cursor' }) }
      },
    },
  })
  const request = () => new Request('https://sari.forwarders.app/api/integrations/outlook/run', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SARI_OUTLOOK_RUN_SECRET}` } })
  try {
    assert.equal((await POST(request())).status, 503)
    assert.equal(deliveryState, 'uncertain')
    assert.equal((await POST(request())).status, 200)
    assert.equal(sends, 1)
  } finally {
    if (secretBefore === undefined) delete process.env.SARI_OUTLOOK_RUN_SECRET
    else process.env.SARI_OUTLOOK_RUN_SECRET = secretBefore
    if (outboundBefore === undefined) delete process.env.OUTBOUND_EMAIL_ENABLED
    else process.env.OUTBOUND_EMAIL_ENABLED = outboundBefore
  }
})

test('stand by bloquea lectura y envio antes de consultar sesion, base o Microsoft', async () => {
  const forbidden = () => { throw new Error('No debe conectar en stand by') }
  const mocks = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/src/lib/server/outlook-intake': { intakeAdminClient: forbidden, outlookToken: forbidden },
    '@/src/lib/supabase/server': { createClient: forbidden },
  }
  assert.equal(loadTs('src/lib/mail-intake.ts').OUTLOOK_INTAKE_STANDBY, true)
  for (const route of ['run', 'check']) {
    const { POST } = loadTs(`src/app/api/integrations/outlook/${route}/route.ts`, mocks)
    assert.equal((await POST(new Request('https://sari.forwarders.app', { method: 'POST' }))).status, 503)
  }
})
