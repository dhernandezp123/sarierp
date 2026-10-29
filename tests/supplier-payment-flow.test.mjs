import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const tick = () => new Promise(resolve => setTimeout(resolve, 20))
const sameDeps = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
function mount({ balanceOverrides = {}, legacyParentId = null, balanceError = false } = {}) {
  const hooks = []; const effects = []; const calls = []; const messages = []
  const ledger = []; const notes = []
  const readFailures = new Set()
  let cursor = 0; let tree; let accountId = 'account-A'; let failRead = false; let loseResponse = true
  let pendingResponse = null
  const canonical = { monto: 100, total_adjusted: 100, paid_total: 0, pending_balance: 100, credit_notes: 0, debit_notes: 0,
    moneda: 'USD', status: 'Pendiente', tipo: 'AP', proveedores: { id: 'supplier', nombre: 'Prueba' }, ...balanceOverrides }
  const redirects = []
  const router = { push() {}, replace(path) { redirects.push(path) } }
  const react = {
    useState(initial) {
      const index = cursor++
      if (!hooks[index]) hooks[index] = { value: initial }
      return [hooks[index].value, value => { hooks[index].value = typeof value === 'function' ? value(hooks[index].value) : value }]
    },
    useRef(current) { const index = cursor++; return hooks[index] ||= { current } },
    useCallback(fn, deps) {
      const index = cursor++
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { value: fn, deps }
      return hooks[index].value
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
        hooks[index]?.cleanup?.()
        hooks[index] = { deps }
        effects.push(() => { hooks[index].cleanup = fn() })
      }
    },
  }
  const supabase = {
    from(table) {
      const query = {
        select() { return query }, eq() { return query }, order() { return query },
        async single() { return readFailures.has('account') ? { data: null, error: { message: 'offline' } } : { data: { id: accountId, parent_ap_id: legacyParentId, tipo: legacyParentId ? 'NC' : 'AP' }, error: null } },
        async maybeSingle() { const failed = balanceError || readFailures.has('supplier_payable_balances'); return { data: legacyParentId || failed ? null : { id: accountId, ...canonical }, error: failed ? { message: 'offline' } : null } },
        async range(from, to) {
          if (failRead && table === 'pagos_proveedor') return { data: null, error: { message: 'offline' } }
          if (readFailures.has(table)) return { data: null, error: { message: 'offline' } }
          return { data: (table === 'pagos_proveedor' ? ledger : notes).slice(from, to + 1), error: null }
        },
      }
      return query
    },
    async rpc(name, payload) {
      calls.push({ name, payload })
      if (pendingResponse) return pendingResponse
      assert.equal(name, 'register_supplier_payment')
      const existing = ledger.find(row => row.request_key === payload.p_request_key)
      if (!existing) ledger.push({ id: 'payment', status: 'Aplicado', monto: payload.p_amount, moneda: 'USD', fecha_pago: payload.p_payment_date, request_key: payload.p_request_key })
      if (loseResponse) { loseResponse = false; throw new Error('Respuesta perdida') }
      return { data: { payment_id: 'payment', already_applied: !!existing }, error: null }
    },
  }
  const tags = names => Object.fromEntries(names.map(name => [name, name]))
  const { default: Page } = loadTs('src/app/(protected)/accounts-payable/[id]/page.tsx', {
    react,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/navigation': { useParams: () => ({ id: accountId }), useRouter: () => router },
    'next/link': 'a',
    '@/src/hooks/useUser': { useUser: () => ({ user: { id: 'finance' }, profile: { id: 'finance', rol: 'Finanzas', tenant_id: 'tenant', status: 'Aprobado', is_active: true } }) },
    '@/src/lib/supabase/client': { supabase },
    '@/src/components/ui/dialog': tags(['Dialog', 'DialogContent', 'DialogHeader', 'DialogDescription', 'DialogTitle', 'DialogFooter']),
    '@/src/components/ui/page-skeleton': { PageSkeleton: 'skeleton' },
    '@/src/components/ui/NumberInput': { NumberInput: 'input' },
    'sonner': { toast: Object.fromEntries(['error', 'success', 'info'].map(name => [name, text => messages.push({ name, text })])) },
  })
  const render = () => { cursor = 0; tree = Page(); effects.splice(0).forEach(fn => fn()); return tree }
  const nodes = node => node == null || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join('')
    : typeof node === 'object' ? text(node.props?.children) : String(node)
  const find = predicate => nodes(tree).find(predicate)
  const button = label => find(node => node.type === 'button' && text(node) === label)
  const ready = async () => { render(); await tick(); render() }
  const paymentForm = amount => {
    button('Registrar pago').props.onClick(); render()
    find(node => node.type === 'input' && node.props.type === 'number').props.onChange({ target: { value: String(amount) } }); render()
  }
  return {
    ready, render, button, paymentForm, calls, ledger, messages, redirects,
    failRead(value) { failRead = value },
    failTable(table, value) { if (value) readFailures.add(table); else readFailures.delete(table) },
    holdResponse(promise) { pendingResponse = promise },
    navigate(id) { accountId = id },
    text: () => text(tree),
    cleanup() { hooks.forEach(hook => hook?.cleanup?.()) },
  }
}

test('respuesta perdida y doble clic: el flujo real reintenta la misma clave y conserva un solo pago', async () => {
  const app = mount()
  try {
    await app.ready(); app.paymentForm(40)
    const confirm = app.button('Confirmar pago').props.onClick
    await Promise.all([confirm(), confirm()])
    app.render()
    assert.equal(app.calls.length, 1)
    assert.equal(app.ledger.length, 1)
    await app.button('Confirmar pago').props.onClick(); app.render()
    assert.equal(app.calls.length, 2)
    assert.equal(app.calls[0].payload.p_request_key, app.calls[1].payload.p_request_key)
    assert.equal(app.ledger.length, 1)
    assert.equal(app.button('Confirmar pago'), undefined)
    assert.ok(app.messages.some(message => message.text === 'El pago ya estaba registrado'))
  } finally { app.cleanup() }
})

test('actualizar historial recupera la respuesta perdida antes de habilitar una solicitud nueva', async () => {
  const app = mount()
  try {
    await app.ready(); app.paymentForm(40)
    await app.button('Confirmar pago').props.onClick(); app.render()
    app.button('Actualizar historial').props.onClick(); await tick(); app.render()
    assert.equal(app.button('Confirmar pago'), undefined)
    assert.ok(app.messages.some(message => message.name === 'info'))
    app.paymentForm(20)
    await app.button('Confirmar pago').props.onClick(); app.render()
    assert.notEqual(app.calls[0].payload.p_request_key, app.calls[1].payload.p_request_key)
    assert.equal(app.ledger.length, 2)
  } finally { app.cleanup() }
})

test('fallo al leer pagos bloquea el formulario y permite recuperar el historial completo', async () => {
  const app = mount()
  try {
    app.failRead(true); await app.ready()
    assert.equal(app.button('Registrar pago'), undefined)
    assert.ok(app.button('Reintentar'))
    app.failRead(false)
    app.button('Reintentar').props.onClick(); await tick(); app.render()
    assert.ok(app.button('Registrar pago'))
  } finally { app.cleanup() }
})

test('un pago en vuelo de otra cuenta no aplica una recarga ni abre un formulario obsoleto', async () => {
  const app = mount()
  let resolve
  try {
    await app.ready(); app.paymentForm(40)
    app.holdResponse(new Promise(yes => { resolve = yes }))
    const pending = app.button('Confirmar pago').props.onClick()
    app.navigate('account-B'); await app.ready()
    resolve({ data: { payment_id: 'old-payment' }, error: null }); await pending; app.render()
    assert.equal(app.button('Confirmar pago'), undefined)
    assert.ok(app.button('Registrar pago'))
    assert.equal(app.messages.filter(message => message.name === 'success').length, 0)
  } finally { app.cleanup() }
})

test('detalle usa saldo SQL con NC aunque el historial del navegador este en otra instantanea', async () => {
  const app = mount({ balanceOverrides: { monto: 1000, credit_notes: 200, total_adjusted: 800, pending_balance: 800 } })
  try {
    await app.ready()
    assert.match(app.text(), /USD 800.00/)
    assert.match(app.text(), /NC -USD 200.00/)
    assert.equal(app.ledger.length, 0)
  } finally { app.cleanup() }
})

test('detalle muestra saldo negativo y aviso de sobrepago en lugar de ocultarlo', async () => {
  const app = mount({ balanceOverrides: { paid_total: 120, pending_balance: -20, status: 'Pagada', has_overpayment: true, needs_reconciliation: true } })
  try {
    await app.ready()
    assert.match(app.text(), /USD -20.00/)
    assert.match(app.text(), /Sobrepago: USD 20.00/)
  } finally { app.cleanup() }
})

test('un enlace historico de nota dirige a su AP principal sin presentarla como otra deuda', async () => {
  const app = mount({ legacyParentId: 'root-account' })
  try {
    await app.ready()
    assert.deepEqual(app.redirects, ['/accounts-payable/root-account'])
    assert.equal(app.button('Registrar pago'), undefined)
  } finally { app.cleanup() }
})

test('un fallo del saldo canonico bloquea acciones aunque el historial se haya cargado', async () => {
  const app = mount({ balanceError: true })
  try {
    await app.ready()
    assert.match(app.text(), /No se pudo cargar el saldo conciliado/)
    assert.equal(app.button('Registrar pago'), undefined)
    assert.ok(app.button('Reintentar'))
  } finally { app.cleanup() }
})

test('AUD-09: cada subconsulta financiera fallida impide mostrar saldo/historial parcial y permite reintento', async () => {
  for (const table of ['account', 'supplier_payable_balances', 'pagos_proveedor', 'cuentas_pagar']) {
    const app = mount({ balanceOverrides: { pending_balance: 65, paid_total: 35 } })
    try {
      app.failTable(table, true); await app.ready()
      assert.ok(app.button('Reintentar'))
      assert.equal(app.button('Registrar pago'), undefined)
      assert.doesNotMatch(app.text(), /USD 65.00|Saldo pendiente|No hay pagos/)
      assert.equal(app.calls.length, 0)
      app.failTable(table, false); app.button('Reintentar').props.onClick(); await tick(); app.render()
      assert.match(app.text(), /USD 65.00/)
      assert.ok(app.button('Registrar pago'))
    } finally { app.cleanup() }
  }
})

test('AUD-09: fallo de actualización financiera no mantiene acciones ni un saldo anterior presentado como actual', async () => {
  const app = mount({ balanceOverrides: { pending_balance: 65, paid_total: 35 } })
  try {
    await app.ready(); assert.match(app.text(), /USD 65.00/)
    app.failTable('cuentas_pagar', true)
    app.button('Actualizar historial').props.onClick(); await tick(); app.render()
    assert.ok(app.button('Reintentar'))
    assert.equal(app.button('Registrar pago'), undefined)
    assert.doesNotMatch(app.text(), /USD 65.00|Saldo pendiente|No hay pagos/)
    assert.equal(app.calls.length, 0)
    app.failTable('cuentas_pagar', false)
    app.button('Reintentar').props.onClick(); await tick(); app.render()
    assert.match(app.text(), /USD 65.00/)
    assert.ok(app.button('Registrar pago'))
  } finally { app.cleanup() }
})

test('AUD-10: detalle respeta el estado y fecha canónicos, sin vencer hoy por la zona del navegador', async t => {
  const previous = process.env.TZ
  try {
    for (const zone of ['America/Tegucigalpa', 'America/New_York', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = zone
      for (const [instant, status, days, asOf] of [
        ['2026-10-15T04:30:00Z', 'Pendiente', 0, '2026-10-14'],
        ['2026-10-15T06:30:00Z', 'Vencida', 1, '2026-10-15'],
      ]) {
        t.mock.timers.enable({ apis: ['Date'], now: Date.parse(instant) })
        const app = mount({ balanceOverrides: { fecha_vencimiento: '2026-10-14', as_of_date: asOf, days_overdue: days, status } })
        try {
          await app.ready()
          assert.match(app.text(), /14\/10\/2026/)
          assert.match(app.text(), new RegExp(status))
          if (!days) assert.doesNotMatch(app.text(), /Vencida/)
          assert.match(app.text(), /USD 100.00/)
          assert.equal(app.calls.length, 0)
        } finally { app.cleanup(); t.mock.timers.reset() }
      }
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous }
})
