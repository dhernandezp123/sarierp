import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server.js'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const actor = { id: 'fa260000-0000-4000-8000-000000000001', rol: 'Admin', status: 'Aprobado', is_active: true, is_platform_admin: true, tenant_id: null }
const companyId = 'fa260000-0000-4000-8000-000000000100'
const targetId = 'fa260000-0000-4000-8000-000000000004'
const admin = loadTs('src/lib/platform-admin.ts')
const { getPlatformLoginDestination, getLoginDestination } = loadTs('src/lib/auth-redirect.ts')

test('el superadmin entra a la consola y el Admin de una empresa conserva su acceso operativo', () => {
  assert.equal(admin.canManagePlatform(actor), true)
  for (const profile of [null, { ...actor, is_platform_admin: false }, { ...actor, tenant_id: companyId }, { ...actor, is_active: false }, { ...actor, status: 'Pendiente' }, { ...actor, rol: 'Cliente' }, { ...actor, rol: 'Ventas' }]) {
    assert.equal(admin.canManagePlatform(profile), false)
  }
  assert.equal(getPlatformLoginDestination(actor, null), '/platform')
  assert.equal(getPlatformLoginDestination(actor, '/platform/users?page=2'), '/platform/users?page=2')
  assert.equal(getPlatformLoginDestination(actor, '/support/' + targetId), '/support/' + targetId)
  for (const path of ['//evil.test', '/\\evil.test', '/platform/../admin/users', '/platforming', '/platform/new', '/dashboard']) {
    assert.equal(getPlatformLoginDestination(actor, path), '/platform')
  }
  assert.equal(getPlatformLoginDestination({ ...actor, rol: 'Ventas' }, '/platform'), '/support')
  assert.equal(getLoginDestination('Admin', '/platform/users'), '/dashboard')
  assert.equal(getLoginDestination('Admin', '/admin/users'), '/admin/users')
})

function apiFixture({ host = 'forwarders.app', profile = actor, user = { id: actor.id }, authError = null, profileError = null, rpcError = null } = {}) {
  const calls = { clients: 0, auth: 0, rpc: [] }
  const client = {
    auth: { getUser: async () => { calls.auth++; return { data: { user }, error: authError } } },
    from(table) {
      assert.equal(table, 'profiles')
      const query = { select() { return query }, eq(key, value) { assert.equal(key, 'id'); assert.equal(value, user.id); return query }, maybeSingle: async () => ({ data: profile, error: profileError }) }
      return query
    },
    rpc: async (name, params) => { calls.rpc.push({ name, params }); return { data: { total: 0, companies: [], page: 1, page_size: 25 }, error: rpcError } },
  }
  const routes = loadTs('src/app/api/platform/route.ts', {
    'server-only': {},
    'next/headers': { headers: async () => new Headers({ host }) },
    '@/src/lib/supabase/server': { createClient: async () => { calls.clients++; return client } },
  })
  return {
    calls,
    read: query => routes.GET(new Request('https://' + host + '/api/platform' + (query ? '?' + query : ''))),
    write: (body, origin = 'https://forwarders.app') => routes.POST(new Request('https://' + host + '/api/platform', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body),
    })),
  }
}

test('API verifica host, sesión y perfil antes de leer o escribir información global', async () => {
  for (const [input, expected] of [
    [{ host: 'sari.forwarders.app' }, 404], [{ host: 'forwarders.app.evil.test' }, 404],
    [{ user: null }, 401], [{ authError: { message: 'expired' } }, 401], [{ profileError: { message: 'offline' } }, 403],
    [{ profile: { ...actor, tenant_id: companyId } }, 403], [{ profile: { ...actor, is_platform_admin: false } }, 403],
    [{ profile: { ...actor, is_active: false } }, 403], [{ profile: { ...actor, status: 'Pendiente' } }, 403], [{ profile: { ...actor, rol: 'Cliente' } }, 403],
  ]) {
    const f = apiFixture(input)
    assert.equal((await f.read()).status, expected)
    assert.equal((await f.write({ action: 'create-company', name: 'Empresa', slug: 'empresa', reason: 'Alta autorizada' })).status, expected)
    assert.equal(f.calls.rpc.length, 0)
  }
})

test('API rechaza escrituras de otro origen o sin origen sin invocar la base', async () => {
  for (const origin of [null, 'https://evil.test', 'https://sari.forwarders.app', 'https://forwarders.app.evil.test']) {
    const f = apiFixture()
    assert.equal((await f.write({ action: 'create-company' }, origin)).status, 403)
    assert.equal(f.calls.clients, 0)
  }
})

test('la lectura es paginada y no cacheable; los filtros inválidos no llegan al RPC', async () => {
  const f = apiFixture()
  const response = await f.read('section=users&search=Test&status=Pendiente&page=3')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(f.calls.rpc[0], { name: 'platform_admin_console', params: { p_section: 'users', p_search: 'Test', p_status: 'Pendiente', p_page: 3 } })
  for (const query of ['section=auth.users', 'page=-1', 'page=1.5', 'page=Infinity', 'search=' + 'a'.repeat(101), 'section=activity&status=Aprobado']) {
    const rejected = apiFixture(); assert.equal((await rejected.read(query)).status, 400); assert.equal(rejected.calls.rpc.length, 0)
  }
})

test('altas y cambios de acceso llaman solo operaciones permitidas sin aceptar privilegios adicionales', async () => {
  const f = apiFixture()
  assert.equal((await f.write({ action: 'create-company', name: ' Empresa nueva ', slug: 'Nueva', reason: ' Alta autorizada ', is_platform_admin: true, tenant_id: 'injected' })).status, 200)
  assert.deepEqual(f.calls.rpc[0], { name: 'platform_create_company', params: { p_name: 'Empresa nueva', p_slug: 'nueva', p_reason: 'Alta autorizada' } })
  const expected = { rol: 'Ventas', status: 'Pendiente', is_active: true, tenant_id: companyId }
  assert.equal((await f.write({ action: 'update-user', id: targetId, rol: 'Admin', status: 'Aprobado', is_active: true, expected, reason: 'Aprobar acceso', is_platform_admin: true })).status, 200)
  assert.deepEqual(f.calls.rpc[1], { name: 'platform_update_user_access', params: { p_id: targetId, p_role: 'Admin', p_status: 'Aprobado', p_is_active: true, p_expected: expected, p_reason: 'Aprobar acceso' } })
  for (const body of [
    { action: 'arbitrary-rpc', reason: 'Intento inválido' }, { action: 'create-company', name: 'X', slug: 'admin', reason: 'Reservado' },
    { action: 'create-company', name: 'X', slug: 'https://evil.test', reason: 'Inválido' }, '{bad json',
    { action: 'update-user', id: targetId, rol: 'Superadmin', status: 'Aprobado', is_active: true, expected, reason: 'No permitido' },
    { action: 'update-user', id: targetId, rol: 'Admin', status: 'Aprobado', is_active: 'true', expected, reason: 'No permitido' },
  ]) { const rejected = apiFixture(); assert.equal((await rejected.write(body)).status, 400); assert.equal(rejected.calls.rpc.length, 0) }
})

test('errores de conflicto, autorización y migración pendiente se comunican sin mostrar internals', async () => {
  for (const [code, status] of [['40001',409],['23505',409],['42501',403],['PGRST202',503],['P0002',404],['XX000',500]]) {
    const response = await apiFixture({ rpcError: { code, message: 'private database implementation' } }).read()
    assert.equal(response.status, status)
    assert.ok(!(await response.text()).includes('private database implementation'))
  }
})

test('Proxy permite la consola en dominio raíz y la cierra en dominios operativos', async () => {
  const calls = []
  const { proxy } = loadTs('src/proxy.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getClaims: async () => ({ data: null }) }, rpc: () => { calls.push('tenant-query'); throw Error('Unexpected query') } }) },
  })
  for (const path of ['/platform','/platform/companies','/platform/users','/platform/activity']) {
    const response = await proxy(new NextRequest('https://forwarders.app' + path, { headers: { host: 'forwarders.app' } }))
    assert.equal(response.status,307); assert.equal(new URL(response.headers.get('location')).pathname,'/login')
    const tenant = await proxy(new NextRequest('https://sari.forwarders.app' + path, { headers: { host: 'sari.forwarders.app' } }))
    assert.equal(tenant.status,404)
  }
  assert.equal((await proxy(new NextRequest('https://forwarders.app/platform/unknown',{headers:{host:'forwarders.app'}}))).status,404)
  assert.deepEqual(calls,[])
})

function consoleFixture({ section = 'companies', identity = { user: { id: actor.id }, profile: actor, loading: false } } = {}) {
  const previous = globalThis.fetch
  const requests = []
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }))
  const app = mountPage('src/components/platform/PlatformConsole.tsx', {
    '@/src/hooks/useUser': { useUser: () => identity },
    './PlatformDialogs': { PlatformCompanyDialog: 'CompanyDialog', PlatformUserDialog: 'UserDialog' },
  }, { exported: 'PlatformConsole', props: { section } })
  return { app, requests, identity,
    resolve: (index, body, ok = true) => requests[index].resolve({ ok, json: async () => body }),
    cleanup() { app.cleanup(); globalThis.fetch = previous },
  }
}
const companies = { page: 1, page_size: 25, total: 1, companies: [{ id: companyId, name: 'Empresa visible', slug: 'visible', status: 'Activo', created_at: '2026-10-26T12:00:00Z', updated_at: '2026-10-26T12:00:00Z', admins_count: 1, users_count: 2, domains: [] }] }

test('la consola descarta respuestas antiguas y oculta datos tras perder la autorización', async () => {
  const f = consoleFixture()
  try {
    f.app.render(); assert.equal(f.requests.length,1)
    f.identity.profile = { ...actor, id: targetId }; f.identity.user = { id: targetId }; f.app.render()
    assert.equal(f.requests[0].options.signal.aborted,true)
    f.resolve(1,companies); await f.app.tick(); f.app.render(); assert.match(f.app.text(),/Empresa visible/)
    f.resolve(0,{...companies,companies:[{...companies.companies[0],name:'Respuesta obsoleta'}]}); await f.app.tick(); f.app.render()
    assert.doesNotMatch(f.app.text(),/Respuesta obsoleta/)
    f.identity.profile = { ...f.identity.profile, is_active: false }; f.app.render()
    assert.equal(f.app.text(),''); assert.equal(f.requests.length,2)
  } finally { f.cleanup() }
})

test('buscar no consulta por cada tecla; la carga fallida permite reintentar', async () => {
  const f = consoleFixture()
  try {
    f.app.render(); f.resolve(0,{error:'Fallo temporal'},false); await f.app.tick(); f.app.render()
    assert.match(f.app.text(),/Fallo temporal/)
    f.app.button('Reintentar').props.onClick(); f.app.render(); f.resolve(1,companies); await f.app.tick(); f.app.render()
    for(const value of ['N','Nu','Nueva']) { f.app.find(n=>n.type==='input').props.onChange({target:{value}}); f.app.render() }
    assert.equal(f.requests.length,2)
    f.app.find(n=>n.type==='form').props.onSubmit({preventDefault(){}}); f.app.render()
    assert.equal(f.requests.length,3); assert.match(f.requests[2].url,/search=Nueva/)
  } finally { f.cleanup() }
})

test('cuentas de plataforma y perfiles sin empresa no ofrecen una acción de edición', async () => {
  const f = consoleFixture({section:'users'})
  try {
    f.app.render(); f.resolve(0,{page:1,page_size:25,total:2,users:[{...actor,email:'platform@example.invalid'}, {...actor,id:targetId,is_platform_admin:false,email:'unassigned@example.invalid'}]})
    await f.app.tick(); f.app.render()
    assert.equal(f.app.button('Administrar acceso'),undefined)
    assert.match(f.app.text(),/Cuenta de plataforma protegida/)
  } finally { f.cleanup() }
})

test('una respuesta HTML del servidor muestra un error recuperable sin detalles técnicos', async () => {
  const f = consoleFixture()
  try {
    f.app.render()
    f.requests[0].resolve({ ok: false, json: async () => { throw new SyntaxError('Unexpected token <, internal server HTML') } })
    await f.app.tick(); f.app.render()
    assert.match(f.app.text(), /No se pudo cargar la administración/)
    assert.doesNotMatch(f.app.text(), /Unexpected|internal server/)
    assert.ok(f.app.button('Reintentar'))
  } finally { f.cleanup() }
})

test('el formulario evita doble envío, conserva el borrador tras un fallo y permite corregirlo', async () => {
  const previous = globalThis.fetch, requests = []
  let saved = 0
  globalThis.fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }))
  const app = mountPage('src/components/platform/PlatformDialogs.tsx', {
    '@/src/components/ui/dialog': {},
  }, { exported: 'PlatformCompanyDialog', props: { company: null, onCancel() {}, onSaved() { saved++ } } })
  try {
    app.render()
    app.find(n => n.type === 'input' && !n.props.placeholder).props.onChange({ target: { value: 'Empresa prueba' } })
    app.find(n => n.type === 'input' && n.props.placeholder === 'miempresa').props.onChange({ target: { value: 'empresa-prueba' } })
    app.find(n => typeof n.type === 'function' && n.type.name === 'Reason').props.onChange('Alta autorizada')
    const editor = app.render()
    editor.props.onSubmit({ preventDefault() {} }); editor.props.onSubmit({ preventDefault() {} })
    assert.equal(requests.length, 1)
    assert.equal(app.render().props.saving, true)
    requests[0].resolve({ ok: false, json: async () => { throw new SyntaxError('HTML response') } })
    await app.tick()
    const failed = app.render()
    assert.match(failed.props.error, /No se pudo guardar/)
    assert.equal(failed.props.saving, false)
    assert.equal(saved, 0)
    assert.equal(app.find(n => n.type === 'input' && !n.props.placeholder).props.value, 'Empresa prueba')
    failed.props.onSubmit({ preventDefault() {} })
    assert.equal(requests.length, 2)
    requests[1].resolve({ ok: true, json: async () => ({ id: companyId }) })
    await app.tick(); app.render()
    assert.equal(saved, 1)
  } finally { app.cleanup(); globalThis.fetch = previous }
})
