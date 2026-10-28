import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'
import { activeIdentity, miamiFixture, topbarFixture } from './read-error-fixture.mjs'

const { loadMiamiDashboard } = loadTs('src/lib/miami-dashboard.ts')
const dashboard = 'src/app/(protected)/miami/page.tsx'
const success = (n = 0) => index => ({ error: null, count: index < 4 ? n + index : null, data: index < 4 ? null : [] })
const metric = (app, label) => app.find(node => node.type?.name === 'MetricCard' && node.props.label === label)
const bell = app => app.find(node => node.type === 'button' && node.props['aria-label'] === 'Abrir alertas')
const alert = (title = 'Aviso anterior') => ({ id: 'alert-1', title, severity: 'Alta', description: 'Pendiente de revisión' })
const flush = async app => { app.render(); await app.tick(); app.render() }

test('Miami valida cada una de las seis respuestas; un error o respuesta incompleta nunca equivale a cero', async () => {
  for (let index = 0; index < 6; index++) {
    const f = miamiFixture()
    f.respond(i => i === index ? { data: null, count: null, error: { message: 'offline' } } : success(7)(i))
    await assert.rejects(loadMiamiDashboard(f.client, 'tenant-A'), /No se pudo cargar/)
    assert.equal(f.calls.length, 6)
    assert.ok(f.calls.every(call => call.filters.some(([field, value]) => field === 'tenant_id' && value === 'tenant-A')))
    f.respond(i => i === index ? { data: null, count: null, error: null } : success(7)(i))
    await assert.rejects(loadMiamiDashboard(f.client, 'tenant-A'), /No se pudo cargar/)
  }
  for (const count of [-1, 1.2, '0', NaN]) {
    const f = miamiFixture(); f.respond(i => i === 0 ? { count, data: null, error: null } : success()(i))
    await assert.rejects(loadMiamiDashboard(f.client, 'tenant-A'))
  }
  const f = miamiFixture()
  await assert.rejects(loadMiamiDashboard(f.client, ''), /empresa activa/)
  assert.equal(f.calls.length, 0)
})

test('Miami distingue cero verificado de error inicial y permite reintentar', async () => {
  const f = miamiFixture(); let broken = true
  f.respond(i => broken && i === 2 ? { data: null, count: null, error: { message: 'offline' } } : { count: 0, data: [], error: null })
  const app = mountPage(dashboard, f.mocks)
  try {
    await app.ready()
    assert.match(app.text(), /No se pudo cargar manifiestos abiertos/)
    assert.ok(app.find(node => node.props?.role === 'alert'))
    assert.equal(metric(app, 'Sin asignar'), undefined)
    assert.doesNotMatch(app.text(), /Todos los paquetes están asignados|No hay manifiestos abiertos/)
    broken = false
    app.button('Reintentar').props.onClick(); await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 0)
    assert.match(app.text(), /Todos los paquetes están asignados/)
    assert.match(app.text(), /No hay manifiestos abiertos/)
    assert.equal(app.find(node => node.props?.role === 'alert'), undefined)
  } finally { app.cleanup() }
})

test('Miami mantiene la última lectura completa al fallar una actualización, sin mezclar KPIs nuevos', async () => {
  const f = miamiFixture(); f.respond(success(8))
  const app = mountPage(dashboard, f.mocks)
  try {
    await app.ready(); assert.equal(metric(app, 'Sin asignar').props.value, 8)
    f.respond(i => i === 5 ? { data: null, count: null, error: { message: 'offline' } } : success(100)(i))
    app.button('Actualizar dashboard').props.onClick(); app.render()
    assert.match(app.text(), /Actualizando.*última consulta completa/)
    await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 8)
    assert.equal(metric(app, 'Recibidos hoy').props.value, 11)
    assert.match(app.text(), /desactualizados/)
    assert.match(app.text(), /La última consulta no tenía paquetes sin asignar/)
    assert.doesNotMatch(app.text(), /Todos los paquetes están asignados/)
    f.respond(success(20)); app.button('Reintentar').props.onClick(); await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 20)
    assert.doesNotMatch(app.text(), /desactualizados/)
  } finally { app.cleanup() }
})

test('Miami no consulta sin perfil autorizado ni expone el snapshot al cambiar identidad, tenant o rol', async () => {
  for (const [identity, expectRead] of [
    [{ user: null, profile: null, loading: false }, false], [{ ...activeIdentity(), loading: true }, false],
    [{ ...activeIdentity(), profile: null }, false], [activeIdentity('other'), true], [activeIdentity('operator', 'tenant-B'), true],
    [activeIdentity('operator', 'tenant-A', 'Ventas'), false],
    [{ ...activeIdentity(), profile: { ...activeIdentity().profile, is_active: false } }, false],
    [{ ...activeIdentity(), profile: { ...activeIdentity().profile, status: 'Pendiente' } }, false],
    [{ ...activeIdentity(), profile: { ...activeIdentity().profile, id: 'mismatched-profile' } }, false],
    [{ ...activeIdentity(), profile: { ...activeIdentity().profile, tenant_id: null } }, false],
    [{ ...activeIdentity(), profile: { ...activeIdentity().profile, is_platform_admin: true } }, false],
  ]) {
    const f = miamiFixture(); f.respond(success(8)); const app = mountPage(dashboard, f.mocks)
    try {
      await app.ready()
      const previousCalls = f.calls.length
      f.identity(identity); app.render()
      assert.equal(metric(app, 'Sin asignar'), undefined)
      f.respond(() => ({ data: null, count: null, error: { message: 'new identity fails' } }))
      await flush(app)
      assert.equal(metric(app, 'Sin asignar'), undefined)
      assert.equal(f.calls.length - previousCalls, expectRead ? 6 : 0)
    } finally { app.cleanup() }
  }
})

test('Miami descarta respuestas tardías tras cambio de contexto, recarga posterior y desmontaje', async () => {
  const f = miamiFixture(); let resolve
  f.respond(i => i === 0 ? new Promise(done => { resolve = done }) : success(8)(i))
  const app = mountPage(dashboard, f.mocks)
  try {
    await app.ready()
    f.identity(activeIdentity('operator', 'tenant-B')); f.respond(success(20)); await app.ready()
    assert.equal(metric(app, 'Sin asignar').props.value, 20)
    resolve(success(8)(0)); await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 20)
    f.respond(i => i === 0 ? new Promise(done => { resolve = done }) : success(30)(i))
    app.button('Actualizar dashboard').props.onClick(); await app.tick()
    f.respond(success(40)); app.render()
    // Force a new request without waiting for the stale one.
    app.button('Actualizar dashboard').props.onClick(); await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 40)
    resolve(success(30)(0)); await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 40)
    f.respond(i => i === 0 ? new Promise(done => { resolve = done }) : success(50)(i))
    app.button('Actualizar dashboard').props.onClick(); await app.tick(); app.cleanup()
    resolve(success(50)(0)); await flush(app)
    assert.equal(metric(app, 'Sin asignar').props.value, 40)
  } finally { app.cleanup() }
})

test('campana: fallo inicial no presenta vacío exitoso y puede recuperar una lista realmente vacía', async () => {
  const f = topbarFixture(); f.read(async () => { throw Error('offline') }); const app = f.mount()
  try {
    await app.ready(); bell(app).props.onClick(); app.render()
    assert.match(app.text(), /No se pudieron cargar/)
    assert.doesNotMatch(app.text(), /Sin alertas activas/)
    assert.ok(app.find(node => node.props?.['aria-label'] === 'Alertas sin actualizar'))
    f.read(async () => []); app.button('Reintentar').props.onClick(); await flush(app)
    assert.match(app.text(), /Sin alertas activas/)
    assert.equal(app.find(node => node.props?.role === 'alert'), undefined)
  } finally { app.cleanup(); f.cleanup() }
})

test('campana conserva lista, badge y vistos ante fallo; abrir el snapshot fallido no marca leído', async () => {
  const f = topbarFixture(); f.read(async () => [alert()]); const app = f.mount()
  try {
    await app.ready()
    assert.ok(app.find(node => node.props?.['aria-label'] === '1 alertas nuevas en la última consulta'))
    const before = [...f.storage.entries()]
    f.read(async () => { throw Error('offline') }); f.path('/other'); await app.ready()
    bell(app).props.onClick(); app.render()
    assert.match(app.text(), /Aviso anterior/)
    assert.match(app.text(), /última consulta completa.*desactualizadas/)
    assert.ok(app.find(node => node.props?.['aria-label'] === '1 alertas nuevas en la última consulta'))
    assert.deepEqual([...f.storage.entries()], before)
    f.read(async () => [alert('Aviso actualizado')]); app.button('Reintentar').props.onClick(); await flush(app)
    assert.match(app.text(), /Aviso actualizado/)
    assert.doesNotMatch(app.text(), /desactualizadas|Aviso anterior/)
    bell(app).props.onClick(); app.render(); bell(app).props.onClick(); app.render()
    assert.equal(app.find(node => node.props?.['aria-label'] === '1 alertas nuevas en la última consulta'), undefined)
    assert.ok([...f.storage.values()].some(value => value.includes('alert-1')))
  } finally { app.cleanup(); f.cleanup() }
})

test('campana: un snapshot vacío se etiqueta como anterior mientras falla o sigue en curso la actualización', async () => {
  const f = topbarFixture(); const app = f.mount(); let resolve
  try {
    await app.ready(); bell(app).props.onClick(); app.render()
    assert.match(app.text(), /Sin alertas activas/)
    f.read(() => new Promise(done => { resolve = done }))
    app.button('Actualizar alertas').props.onClick(); await flush(app)
    assert.match(app.text(), /La última consulta no tenía alertas/)
    assert.doesNotMatch(app.text(), /Sin alertas activas/)
    resolve([]); await flush(app)
    f.read(async () => { throw Error('offline') }); app.button('Actualizar alertas').props.onClick(); await flush(app)
    assert.match(app.text(), /La última consulta no tenía alertas/)
    assert.doesNotMatch(app.text(), /Sin alertas activas/)
  } finally { app.cleanup(); f.cleanup() }
})

test('campana oculta inmediatamente datos de otra identidad/tenant/rol y descarta respuestas viejas', async () => {
  const f = topbarFixture(); f.read(async () => [alert()]); const app = f.mount(); let resolve
  try {
    await app.ready(); bell(app).props.onClick(); app.render()
    f.read(() => new Promise(done => { resolve = done })); f.path('/other'); await app.ready()
    f.identity(activeIdentity('new-user', 'tenant-B')); app.render()
    assert.doesNotMatch(app.text(), /Aviso anterior/)
    f.read(async () => [alert('Aviso de B')]); await flush(app)
    resolve([alert('Respuesta vieja')]); await flush(app)
    assert.match(app.text(), /Aviso de B/)
    assert.doesNotMatch(app.text(), /Respuesta vieja|Aviso anterior/)
    f.identity(activeIdentity('new-user', 'tenant-B', 'Ventas')); f.read(async () => { throw Error('offline') }); app.render()
    assert.doesNotMatch(app.text(), /Aviso de B/)
    await flush(app)
    assert.doesNotMatch(app.text(), /Aviso de B/)
    const calls = f.calls.length
    f.identity({ user: null, profile: null, loading: false }); await app.ready()
    assert.equal(f.calls.length, calls)
    assert.equal(bell(app).props.disabled, true)
    for (const identity of [
      { ...activeIdentity(), loading: true }, { ...activeIdentity(), profile: null },
      { ...activeIdentity(), profile: { ...activeIdentity().profile, id: 'mismatch' } },
      { ...activeIdentity(), profile: { ...activeIdentity().profile, status: 'Pendiente' } },
      { ...activeIdentity(), profile: { ...activeIdentity().profile, is_active: false } },
      activeIdentity('operator', 'tenant-A', null), activeIdentity('operator', 'tenant-A', 'Cliente'),
    ]) {
      f.identity(identity); await app.ready()
      assert.equal(f.calls.length, calls)
      assert.equal(bell(app).props.disabled, true)
      assert.doesNotMatch(app.text(), /Aviso de B|Respuesta vieja/)
    }
    f.identity(activeIdentity()); f.read(() => new Promise(done => { resolve = done })); await app.ready()
    const storage = [...f.storage.entries()]
    app.cleanup(); resolve([alert('Late unmounted response')]); await flush(app)
    assert.doesNotMatch(app.text(), /Late unmounted response/)
    assert.deepEqual([...f.storage.entries()], storage)
  } finally { app.cleanup(); f.cleanup() }
})
