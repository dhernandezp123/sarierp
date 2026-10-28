import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const { assignMiamiPackage, receiveMiamiPackage } = loadTs('src/lib/miami-assignment.ts')
const assigned = { id: 'package', tracking_number: 'TRACK', status: 'Asignado', warehouse_number: 'SPS-12345',
  cliente_id: 'client', manifest_id: 'manifest', assigned_at: '2026-10-14T12:00:00Z', assigned_by: 'operator' }
const pending = { ...assigned, status: 'Sin asignar', warehouse_number: null, cliente_id: null, manifest_id: null, assigned_at: null, assigned_by: null }

test('assignment uses one RPC with the expected manifest and returns the persisted WH', async () => {
  const calls = []
  const client = { rpc: async (...args) => { calls.push(args); return { data: assigned, error: null } } }
  assert.deepEqual(await assignMiamiPackage(client, 'package', 'client', 'manifest'), assigned)
  assert.deepEqual(calls, [['assign_miami_package', { p_package_id: 'package', p_cliente_id: 'client', p_expected_manifest_id: 'manifest' }]])
  assert.deepEqual(await assignMiamiPackage({ rpc: async () => ({ data: [assigned] }) }, 'package', 'client', 'manifest'), assigned)
})

test('conflicts, WH/audit failures and incomplete/unrelated rows are never confirmed', async () => {
  for (const code of ['PT409', '42501', '23514']) {
    await assert.rejects(assignMiamiPackage({ rpc: async () => ({ data: null, error: { code, message: 'assignment rejected' } }) }, 'package', 'client', 'manifest'), /assignment rejected/)
  }
  for (const data of [null, [], [assigned, assigned], pending, { ...assigned, cliente_id: 'other' },
    { ...assigned, id: 'other' }, { ...assigned, warehouse_number: null }, { ...assigned, warehouse_number: 123 },
    { ...assigned, assigned_by: null }, { ...assigned, assigned_at: null }, { ...assigned, manifest_id: 'other' }]) {
    await assert.rejects(assignMiamiPackage({ rpc: async () => ({ data, error: null }) }, 'package', 'client', 'manifest'), /Actualiza/)
  }
})

test('receipt normalizes tracking and accepts confirmed manual/automatic/unassigned results', async () => {
  let input
  const client = { rpc: async (name, args) => { input = [name, args]; return { data: pending } } }
  assert.equal((await receiveMiamiPackage(client, { tracking_number: ' track ', weight_lbs: 10 })).status, 'Sin asignar')
  assert.deepEqual(input, ['receive_miami_package', { p_package_data: { tracking_number: 'TRACK', weight_lbs: 10 }, p_cliente_id: null }])
  const result = { ...assigned, manifest_id: null }
  assert.equal((await receiveMiamiPackage({ rpc: async () => ({ data: result }) }, { tracking_number: 'track' }, 'client')).warehouse_number, 'SPS-12345')
  assert.equal((await receiveMiamiPackage({ rpc: async () => ({ data: result }) }, { tracking_number: 'track' })).cliente_id, 'client')
})

test('receipt cannot turn a malformed or different-client response into a success', async () => {
  await assert.rejects(receiveMiamiPackage({ rpc: async () => { throw Error('must not run') } }, { tracking_number: ' ' }), /tracking/)
  for (const data of [pending, assigned, { ...assigned, manifest_id: null, cliente_id: 'other' },
    { ...assigned, manifest_id: null, tracking_number: 'OTHER' }]) {
    await assert.rejects(receiveMiamiPackage({ rpc: async () => ({ data }) }, { tracking_number: 'track' }, 'client'), /Actualiza/)
  }
})

function fixture({ rpc, email = async () => ({ ok: true }), user = () => ({ id: 'operator' }) } = {}) {
  const calls = [], messages = [], mails = []
  const manifest = { id: 'manifest', manifest_number: 'M-TEST', status: 'Abierto', carrier: 'TEST', total_packages: 1, created_at: '2026-10-14T00:00:00Z' }
  const row = { ...pending, manifest_id: 'manifest', received_at: '2026-10-14T00:00:00Z', weight_lbs: 10, ft3: 1, cliente: null }
  const client = {
    from() {
      const q = {
        select() { return q }, eq() { return q }, is() { return q }, ilike() { return q }, order() { return q }, limit() { return q },
        single: async () => ({ data: manifest, error: null }),
        range: async (from, to) => ({ data: [row].slice(from, to + 1), error: null }),
        then(resolve, reject) { return Promise.resolve({ data: [{ id: 'client', nombre: 'Cliente confirmado', codigo_cliente: 'C1' }], error: null }).then(resolve, reject) },
      }
      return q
    },
    async rpc(name, args) { calls.push([name, args]); return rpc?.(name, args) ?? { data: assigned, error: null } },
  }
  const mocks = {
    'next/navigation': { useParams: () => ({ id: 'manifest' }), useRouter: () => ({ push() {} }) },
    '@/src/lib/supabase/client': { supabase: client },
    '@/src/hooks/useUser': { useUser: () => ({ user: user(), profile: { rol: 'Operaciones', tenant_id: 'tenant' } }) },
    '@/src/hooks/useMiamiCarriers': { useMiamiCarriers: () => ({ carriers: ['TEST'], reload: async () => {} }) },
    '@/src/components/miami/NewCarrierModal': { NewCarrierModal: 'NewCarrierModal' },
    '@/src/lib/miami-assignment-email': { sendMiamiPackageAssignmentEmail: async id => { mails.push(id); return email(id) } },
    sonner: { toast: Object.fromEntries(['error', 'success', 'warning', 'info'].map(kind => [kind, (...args) => messages.push([kind, ...args])])) },
  }
  return { mocks, calls, messages, mails, row }
}
async function selectManifestClient(app) {
  await app.ready()
  app.button('Asignar').props.onClick(); app.render()
  app.find(node => node.type === 'input' && node.props.placeholder === 'Buscar cliente por nombre...').props.onChange({ target: { value: 'Cliente' } }); app.render()
  await new Promise(resolve => setTimeout(resolve, 280)); app.render()
  app.button('Cliente confirmadoC1').props.onClick(); app.render()
}

test('real manifest component sends no email/success on a conflict and refreshes the package list', async () => {
  const f = fixture({ rpc: async () => ({ data: null, error: { code: 'PT409', message: 'El paquete ya fue asignado' } }) })
  const app = mountPage('src/app/(protected)/miami/manifiestos/[id]/page.tsx', f.mocks)
  try {
    await selectManifestClient(app)
    await app.button('Confirmar asignación').props.onClick(); await app.tick(); app.render()
    assert.equal(f.calls.length, 1)
    assert.equal(f.mails.length, 0)
    assert.equal(f.messages.some(([kind]) => kind === 'success'), false)
    assert.match(f.messages[0][1], /ya fue asignado/)
    assert.equal(app.button('Confirmar asignación'), undefined)
  } finally { app.cleanup() }
})

test('real manifest component ignores a duplicate click and confirms the persisted WH even if mail fails', async () => {
  let finish
  const f = fixture({ rpc: () => new Promise(resolve => { finish = resolve }), email: async () => ({ ok: false, error: 'Correo bloqueado' }) })
  const app = mountPage('src/app/(protected)/miami/manifiestos/[id]/page.tsx', f.mocks)
  try {
    await selectManifestClient(app)
    const action = app.button('Confirmar asignación').props.onClick
    const first = action(); await action()
    assert.equal(f.calls.length, 1)
    finish({ data: assigned, error: null }); await first
    assert.deepEqual(f.mails, ['package'])
    assert.equal(f.messages.some(([kind]) => kind === 'warning'), true)
    assert.equal(f.messages.some(([kind, message]) => kind === 'success' && message.includes('SPS-12345')), true)
  } finally { app.cleanup() }
})

test('real manifest component discards a completed request after unmount without triggering mail', async () => {
  let finish
  const f = fixture({ rpc: () => new Promise(resolve => { finish = resolve }) })
  const app = mountPage('src/app/(protected)/miami/manifiestos/[id]/page.tsx', f.mocks)
  await selectManifestClient(app)
  const first = app.button('Confirmar asignación').props.onClick
  const pendingCall = first(); app.cleanup(); finish({ data: assigned, error: null }); await pendingCall
  assert.equal(f.mails.length, 0)
  assert.equal(f.messages.length, 0)
})

test('real receipt component sends mail only after persisted auto-assignment and guards duplicate submission', async () => {
  let finish
  const f = fixture({ rpc: () => new Promise(resolve => { finish = resolve }) })
  const app = mountPage('src/app/(protected)/miami/ingreso/page.tsx', f.mocks)
  try {
    await app.ready()
    app.find(node => node.type === 'input' && node.props.placeholder === 'Escanea o escribe el tracking...').props.onChange({ target: { value: 'track' } }); app.render()
    const submit = app.find(node => node.type === 'form').props.onSubmit
    const first = submit({ preventDefault() {} }); await submit({ preventDefault() {} })
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0][0], 'receive_miami_package')
    assert.equal(f.mails.length, 0)
    finish({ data: { ...assigned, manifest_id: null }, error: null }); await first
    assert.deepEqual(f.mails, ['package'])
    assert.equal(f.messages.some(([kind, message]) => kind === 'success' && message.includes('prealerta')), true)
    app.render()
    assert.equal(app.find(node => node.type === 'input' && node.props.placeholder === 'Escanea o escribe el tracking...').props.value, '')
  } finally { app.cleanup() }
})

test('real receipt preserves tracking on assignment failure and requires the selected client', async () => {
  const f = fixture({ rpc: async () => ({ error: { message: 'WH falló' }, data: null }) })
  const app = mountPage('src/app/(protected)/miami/ingreso/page.tsx', f.mocks)
  try {
    await app.ready()
    const tracking = () => app.find(node => node.type === 'input' && node.props.placeholder === 'Escanea o escribe el tracking...')
    tracking().props.onChange({ target: { value: 'track' } }); app.render()
    await app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); app.render()
    assert.equal(tracking().props.value, 'track')
    assert.equal(f.mails.length, 0)
    assert.equal(f.messages.some(([kind]) => kind === 'success'), false)
    app.find(node => node.props?.role === 'checkbox').props.onClick(); app.render()
    await app.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    assert.equal(f.calls.length, 1)
    assert.match(f.messages.at(-1)[1], /Selecciona el cliente/)
  } finally { app.cleanup() }
})
