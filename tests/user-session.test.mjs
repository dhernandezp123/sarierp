import { test } from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Controla el orden de respuestas de red y observa los estados del provider real.
function mount(props = {}) {
  const state = [], effects = [], requests = []
  const bootstrap = deferred()
  let callback, cleanup
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState: (initial) => {
      const index = state.push(initial) - 1
      return [initial, (value) => { state[index] = value }]
    },
    useRef: (current) => ({ current }),
    useEffect: (fn) => effects.push(fn),
    useMemo: (fn) => fn(),
  }
  const supabase = {
    auth: {
      getUser: () => bootstrap.promise,
      onAuthStateChange: (fn) => {
        callback = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
    from: () => ({ select: () => ({ eq: (_key, id) => ({ maybeSingle: () => {
      const request = { id, ...deferred() }
      requests.push(request)
      return request.promise
    } }) }) }),
  }
  const { UserProvider } = loadTs('src/hooks/useUser.tsx', {
    react,
    'react/jsx-runtime': { jsx: (_type, props) => props },
    '../lib/supabase/client': { supabase },
  })
  UserProvider({ children: null, ...props })
  cleanup = effects[0]()
  return { state, requests, bootstrap, cleanup, auth: (user, event = 'SIGNED_IN') => callback(event, user ? { user } : null) }
}

test('Cerrar sesión invalida un perfil todavía en vuelo', async () => {
  const app = mount()
  app.auth({ id: 'A' })
  await tick()
  app.auth(null, 'SIGNED_OUT')
  app.requests[0].resolve({ data: { id: 'A', rol: 'Admin' }, error: null })
  await tick()
  assert.deepEqual(app.state, [null, null, false])
  app.cleanup()
})

test('Una respuesta antigua no puede sobrescribir el perfil del nuevo usuario', async () => {
  const app = mount()
  app.auth({ id: 'A' })
  await tick()
  app.auth({ id: 'B' })
  assert.equal(app.state[1], null)
  assert.equal(app.state[2], true)
  await tick()
  app.requests[1].resolve({ data: { id: 'B', rol: 'Ventas' }, error: null })
  await tick()
  app.requests[0].resolve({ data: { id: 'A', rol: 'Admin' }, error: null })
  app.bootstrap.resolve({ data: { user: { id: 'A' } } })
  await tick()
  assert.deepEqual(app.state, [{ id: 'B' }, { id: 'B', rol: 'Ventas' }, false])
  assert.equal(app.requests.length, 2)
  app.cleanup()
})

test('Un fallo de red libera la carga y permite reintentar el mismo usuario', async () => {
  const app = mount()
  app.auth({ id: 'A' })
  await tick()
  app.requests[0].reject(new Error('offline'))
  await tick()
  assert.equal(app.state[2], false)
  app.auth({ id: 'A' }, 'TOKEN_REFRESHED')
  await tick()
  app.requests[1].resolve({ data: { id: 'A' }, error: null })
  await tick()
  assert.deepEqual(app.state, [{ id: 'A' }, { id: 'A' }, false])
  app.cleanup()
})

test('El desmontaje descarta respuestas y una sesión SSR evita consultas redundantes', async () => {
  const app = mount({ initialUser: { id: 'A' }, initialProfile: { id: 'A' } })
  app.auth({ id: 'A' }, 'TOKEN_REFRESHED')
  await tick()
  assert.equal(app.requests.length, 0)
  app.auth({ id: 'B' })
  await tick()
  app.cleanup()
  app.requests[0].resolve({ data: { id: 'B' }, error: null })
  await tick()
  assert.equal(app.state[1], null)
})
