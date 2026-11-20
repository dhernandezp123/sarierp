import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const tick = () => new Promise(resolve => setTimeout(resolve, 15))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Run the real HR hook, preserving hook slots/effect cleanup across renders.
// Requests are deferred so the tests control the order of network responses.
function mount(rpc = () => { throw new Error('Unexpected RPC') }) {
  const slots = [], effects = []
  let cursor = 0, result
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useRef(initial) {
      const index = cursor++
      return slots[index] ??= { current: initial }
    },
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[index].value, value => {
        slots[index].value = typeof value === 'function' ? value(slots[index].value) : value
      }]
    },
    useCallback(fn, dependencies) {
      const index = cursor++
      if (!same(slots[index]?.dependencies, dependencies)) slots[index] = { fn, dependencies }
      return slots[index].fn
    },
    useEffect(fn, dependencies) {
      const index = cursor++
      if (!same(slots[index]?.dependencies, dependencies)) {
        effects.push(() => {
          slots[index]?.cleanup?.()
          slots[index] = { dependencies, cleanup: fn() }
        })
      }
    },
  }
  const { useScopedLoad: runScopedLoad, LeaveRequestDialog } = loadTs('src/components/hr/HrShared.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': {},
    'next/navigation': {},
    sonner: {},
    '@/src/lib/supabase/client': { supabase: { rpc } },
    '@/src/components/ui/CompactSelect': {},
    '@/src/components/ui/dialog': {},
    '@/src/components/ui/form-field': {},
  })
  return {
    render(context, enabled, loader) {
      cursor = 0
      result = runScopedLoad(context, enabled, loader)
      while (effects.length) effects.shift()()
      return result
    },
    renderDialog(props) {
      cursor = 0
      const tree = LeaveRequestDialog(props)
      while (effects.length) effects.shift()()
      return tree
    },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
  }
}

test('HR: logout discards a pending employee response', async () => {
  const app = mount(), pending = deferred(), loader = () => pending.promise
  app.render('employee-A', true, loader)
  await tick()
  const signedOut = app.render('signed-out', false, loader)
  assert.equal(signedOut.data, null)
  pending.resolve({ employee: 'A', national_id: 'synthetic-A' })
  await tick()
  const current = app.render('signed-out', false, loader)
  assert.equal(current.data, null)
  assert.equal(current.loading, false)
  app.unmount()
})

test('HR: switching tenants discards an old success or error after the new response', async () => {
  for (const failOld of [false, true]) {
    const app = mount(), a = deferred(), b = deferred()
    const loadA = () => a.promise, loadB = () => b.promise
    app.render('tenant-A:employee-A', true, loadA)
    await tick()
    assert.equal(app.render('tenant-B:employee-B', true, loadB).data, null)
    await tick()
    b.resolve({ employee: 'B' })
    await tick()
    if (failOld) a.reject(new Error('stale A error'))
    else a.resolve({ employee: 'A' })
    await tick()
    const current = app.render('tenant-B:employee-B', true, loadB)
    assert.deepEqual(current.data, { employee: 'B' })
    assert.equal(current.error, '')
    app.unmount()
  }
})

test('HR: a failed load releases loading and a retry recovers the current employee', async () => {
  const app = mount(), first = deferred(), retry = deferred()
  let calls = 0
  const loader = () => (++calls === 1 ? first : retry).promise
  app.render('A', true, loader)
  await tick()
  first.reject(new Error('offline'))
  await tick()
  const failed = app.render('A', true, loader)
  assert.equal(failed.loading, false)
  assert.equal(failed.error, 'offline')
  const reloading = failed.reload()
  retry.resolve({ employee: 'A', balance: 18 })
  await reloading
  const recovered = app.render('A', true, loader)
  assert.deepEqual(recovered.data, { employee: 'A', balance: 18 })
  assert.equal(recovered.error, '')
  assert.equal(calls, 2)
  app.unmount()
})

test('HR: a repeated load wins over an earlier response for the same identity', async () => {
  const app = mount(), old = deferred(), fresh = deferred()
  let calls = 0
  const loader = () => (++calls === 1 ? old : fresh).promise
  const initial = app.render('A', true, loader)
  await tick()
  const reload = initial.reload()
  fresh.resolve({ balance: 15 })
  await reload
  old.resolve({ balance: 20 })
  await tick()
  assert.deepEqual(app.render('A', true, loader).data, { balance: 15 })
  app.unmount()
})

test('HR: preview failure offers a retry with unchanged dates and no leave submission', async () => {
  const calls = []
  const app = mount(async (name, args) => {
    calls.push({ name, args })
    return calls.length === 1
      ? { data: null, error: { message: 'offline' } }
      : { data: { days: 1, allocations: [] }, error: null }
  })
  const nodes = tree => {
    if (!tree || typeof tree !== 'object') return []
    if (Array.isArray(tree)) return tree.flatMap(nodes)
    return [tree, ...nodes(tree.props?.children)]
  }
  const props = { employeeId: 'synthetic-A', employeeName: 'Synthetic A', onClose() {}, onSaved() {} }
  app.renderDialog(props)
  await new Promise(resolve => setTimeout(resolve, 350))
  const failed = nodes(app.renderDialog(props))
  const retry = failed.find(node => node.type === 'button' && node.props.children === 'Reintentar cálculo')
  assert.ok(retry, 'A network failure must offer retry without editing the form')
  assert.equal(failed.find(node => node.type === 'button' && node.props.children === 'Enviar solicitud').props.disabled, true)
  retry.props.onClick()
  app.renderDialog(props)
  await new Promise(resolve => setTimeout(resolve, 350))
  const recovered = nodes(app.renderDialog(props))
  assert.equal(recovered.some(node => node.props?.role === 'alert'), false)
  assert.equal(recovered.find(node => node.type === 'button' && node.props.children === 'Enviar solicitud').props.disabled, false)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].name, 'hr_preview_leave')
  assert.deepEqual(calls[0], calls[1])
  app.unmount()
})
