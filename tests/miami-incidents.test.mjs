import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'
import { pagedClient } from './paged-client.mjs'

const identity = { userId: 'portal-user', tenantId: 'tenant', clientId: 'client' }
const input = { packageId: 'package', tipo: 'Otro', descripcion: '  Mi reporte  ' }
const receipt = (args, overrides = {}) => ({ incident_id: 'incident', package_id: args.p_package_id,
  tenant_id: identity.tenantId, cliente_id: identity.clientId, created_by: identity.userId,
  tipo: args.p_tipo, descripcion: args.p_descripcion, request_key: args.p_request_key,
  status: 'Abierta', package_status: 'Con incidencia', tracking_number: 'TRACK-1', already_applied: false, ...overrides })

test('incidencia usa una sola RPC, identidad esperada y confirmación persistida', async () => {
  const { reportMiamiIncident } = loadTs('src/lib/miami-incidents.ts')
  const calls = []
  const result = await reportMiamiIncident({ rpc: async (...args) => { calls.push(args); return { data: receipt(args[1]) } } }, input, identity)
  assert.equal(result.incident_id, 'incident')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'report_miami_incident')
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ['p_descripcion','p_expected_user_id','p_package_id','p_request_key','p_tipo'])
  assert.equal(calls[0][1].p_descripcion, 'Mi reporte')
  assert.equal(calls[0][1].p_expected_user_id, identity.userId)
})

test('respuesta perdida y recarga recuperan la misma clave sin guardar descripción en storage', async () => {
  const previous = globalThis.window, storage = new Map(), calls = []
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } }
  try {
    const first = loadTs('src/lib/miami-incidents.ts')
    await assert.rejects(first.reportMiamiIncident({ rpc: async (_name, args) => { calls.push(args); return { error: { message: 'response lost' } } } }, input, identity), /response lost/)
    assert.equal(storage.size, 1)
    assert.ok([...storage.keys()].every(key => !key.includes('Mi reporte')))
    const reloaded = loadTs('src/lib/miami-incidents.ts')
    const result = await reloaded.reportMiamiIncident({ rpc: async (_name, args) => { calls.push(args); return { data: receipt(args, { already_applied: true }) } } }, input, identity)
    assert.equal(result.already_applied, true)
    assert.equal(calls[0].p_request_key, calls[1].p_request_key)
    assert.equal(storage.size, 0)
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})

test('confirmaciones incompletas/ajenas no se aceptan ni liberan la clave pendiente', async () => {
  const { reportMiamiIncident } = loadTs('src/lib/miami-incidents.ts'), keys = []
  for (const override of [null, [], 'unexpected', { incident_id: null }, { package_id: 'other' }, { tenant_id: 'other' },
    { cliente_id: 'other' }, { created_by: 'other' }, { request_key: 'other' }, { tipo: 'Dañado' }, { descripcion: 'other' },
    { status: 'Cerrada' }, { package_status: 'Entregado' }, { already_applied: undefined }, { tracking_number: '' }]) {
    await assert.rejects(reportMiamiIncident({ rpc: async (_name, args) => {
      keys.push(args.p_request_key)
      return { data: override === null || typeof override !== 'object' || Array.isArray(override) ? override : receipt(args, override) }
    } }, input, identity), /No se confirmó/)
  }
  assert.equal(new Set(keys).size, 1)
  const recovered = await reportMiamiIncident({ rpc: async (_name, args) => ({ data: [receipt(args, { status: 'Cerrada', package_status: 'Entregado', already_applied: true })] }) }, input, identity)
  assert.equal(recovered.status, 'Cerrada')
})

test('datos inválidos o contexto reemplazado antes del envío no invocan la RPC', async () => {
  const { reportMiamiIncident } = loadTs('src/lib/miami-incidents.ts'); let calls = 0
  const client = { rpc: async () => { calls++; throw Error('must not send') } }
  for (const args of [{ ...input, packageId: '' }, { ...input, tipo: 'Invalid' }, { ...input, descripcion: '  ' }, { ...input, descripcion: 'x'.repeat(5001) }]) {
    await assert.rejects(reportMiamiIncident(client, args, identity))
  }
  await assert.rejects(reportMiamiIncident(client, input, { ...identity, userId: '' }))
  await assert.rejects(reportMiamiIncident(client, input, identity, () => false), /sesión cambió/)
  assert.equal(calls, 0)
})

function formFixture({ rpc, fail = () => false, rows } = {}) {
  let auth = { user: { id: identity.userId }, profile: { id: identity.userId, tenant_id: identity.tenantId,
    cliente_id: identity.clientId, rol: 'Cliente', status: 'Aprobado', is_active: true }, loading: false }
  const calls = [], messages = []
  const packages = rows || [{ id: 'package', cliente_id: 'client', tenant_id: 'tenant', tracking_number: 'TRACK-1', status: 'Asignado', cargo_status: 'Recibido en Miami' }]
  const db = pagedClient({ miami_packages: packages }, { cap: 40, fail })
  db.rpc = async (name, args) => { calls.push([name, args]); return rpc ? rpc(name, args, calls.length) : { data: receipt(args) } }
  const app = mountPage('src/app/portal/incidencias/nueva/page.tsx', {
    '@/src/hooks/useUser': { useUser: () => auth }, '@/src/lib/supabase/client': { supabase: db },
    '@/src/components/portal/PortalConfirmation': { PortalConfirmation: 'confirmation' },
    '@/src/components/portal/PortalFeedback': { PortalError: 'error' },
  })
  const fill = () => {
    app.find(n => n.type === 'select').props.onChange({ target: { value: 'package' } }); app.render()
    app.button('Otro').props.onClick(); app.render()
    app.find(n => n.type === 'textarea').props.onChange({ target: { value: 'Mi reporte' } }); app.render()
    return app.find(n => n.type === 'form').props.onSubmit
  }
  return { app, db, calls, messages, fill, identity: value => { auth = value } }
}

test('formulario real ignora doble clic y solo confirma después de la RPC', async () => {
  let finish, args
  const f = formFixture({ rpc: (_name, params) => { args = params; return new Promise(done => { finish = done }) } })
  try {
    await f.app.ready(); const submit = f.fill()
    const first = submit({ preventDefault() {} }); await submit({ preventDefault() {} }); await f.app.tick(); f.app.render()
    assert.equal(f.calls.length, 1)
    assert.equal(f.app.find(n => n.type === 'confirmation'), undefined)
    assert.equal(f.app.find(n => n.type === 'fieldset').props.disabled, true)
    finish({ data: receipt(args) }); await first; f.app.render()
    assert.equal(f.app.find(n => n.type === 'confirmation').props.reference, 'TRACK-1')
    assert.equal(f.calls[0][0], 'report_miami_incident')
  } finally { f.app.cleanup() }
})

test('formulario conserva texto ante fallo y recupera la misma solicitud sin duplicar el caso', async () => {
  const f = formFixture({ rpc: (_name, args, n) => n === 1 ? { data: null, error: { message: 'No se confirmó. Consulta Incidencias.' } }
    : { data: receipt(args, { already_applied: true }) } })
  try {
    await f.app.ready(); const submit = f.fill()
    await submit({ preventDefault() {} }); f.app.render()
    assert.equal(f.app.find(n => n.type === 'textarea').props.value, 'Mi reporte')
    assert.match(f.app.text(), /Consultar Incidencias/)
    assert.equal(f.app.find(n => n.type === 'confirmation'), undefined)
    await f.app.find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); f.app.render()
    assert.equal(f.calls[0][1].p_request_key, f.calls[1][1].p_request_key)
    assert.ok(f.app.find(n => n.type === 'confirmation'))
  } finally { f.app.cleanup() }
})

test('selector real carga más de 1000 paquetes propios y excluye entregados y otro cliente/tenant', async () => {
  const rows = Array.from({ length: 1005 }, (_, n) => ({ id: String(n).padStart(4,'0'), tracking_number: 'TRACK-' + n,
    cliente_id: 'client', tenant_id: 'tenant', status: 'Asignado', cargo_status: 'Recibido en Miami' }))
  rows.push({ ...rows[0], id: 'delivered', status: 'Entregado' }, { ...rows[0], id: 'cargo-delivered', cargo_status: 'Entregado' },
    { ...rows[0], id: 'other-client', cliente_id: 'other' }, { ...rows[0], id: 'other-tenant', tenant_id: 'other' })
  const f = formFixture({ rows })
  try {
    await f.app.ready()
    assert.match(f.app.text(), /TRACK-1004/)
    assert.ok(f.db.calls.length > 25)
    assert.equal(f.app.find(n => n.type === 'option' && n.props.value === 'delivered'), undefined)
    assert.equal(f.app.find(n => n.type === 'option' && n.props.value === 'cargo-delivered'), undefined)
    assert.equal(f.app.find(n => n.type === 'option' && n.props.value === 'other-client'), undefined)
    assert.equal(f.app.find(n => n.type === 'option' && n.props.value === 'other-tenant'), undefined)
    assert.equal(f.calls.length, 0)
  } finally { f.app.cleanup() }
})

test('fallo en una página del selector permite reintento sin presentar paquetes parciales', async () => {
  let broken = true
  const rows = Array.from({ length: 45 }, (_, n) => ({ id: String(n), tracking_number: 'TRACK-' + n, cliente_id: 'client', tenant_id: 'tenant', status: 'Asignado', cargo_status: 'Recibido en Miami' }))
  const f = formFixture({ rows, fail: call => broken && call.start >= 40 })
  try {
    await f.app.ready(); assert.ok(f.app.find(n => n.type === 'error')); assert.equal(f.app.find(n => n.type === 'form'), undefined)
    broken = false; f.app.find(n => n.type === 'error').props.onRetry(); await f.app.tick(); f.app.render()
    assert.ok(f.app.find(n => n.type === 'form'))
    assert.match(f.app.text(), /TRACK-44/)
  } finally { f.app.cleanup() }
})

test('respuesta tardía de otra sesión no muestra confirmación ni restaura texto ajeno', async () => {
  let finish, args
  const f = formFixture({ rpc: (_name, params) => { args = params; return new Promise(done => { finish = done }) } })
  try {
    await f.app.ready(); const pending = f.fill()({ preventDefault() {} }); await f.app.tick()
    f.identity({ user: { id: 'other' }, profile: { id: 'other', tenant_id: 'other', cliente_id: 'other', rol: 'Cliente', status: 'Aprobado', is_active: true }, loading: false })
    await f.app.ready()
    finish({ data: receipt(args) }); await pending; f.app.render()
    assert.equal(f.app.find(n => n.type === 'confirmation'), undefined)
    assert.equal(f.app.find(n => n.type === 'textarea').props.value, '')
  } finally { f.app.cleanup() }
})
