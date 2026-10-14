import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import loadTs from './load-ts.mjs'

function fixture(controlled) {
  const previous = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element }
  class FakeElement extends EventTarget {
    constructor(editable = true) { super(); this.editable = editable }
    contains(target) { return target === input }
    closest() { return null }
    matches() { return this.editable }
  }
  const input = new FakeElement(), scope = new FakeElement(), document = new EventTarget(), window = new EventTarget()
  const routes = [], traversals = []
  const router = { push: href => routes.push(href) }
  window.location = new URL('https://example.invalid/form')
  window.navigation = new EventTarget()
  window.navigation.traverseTo = key => {
    traversals.push(key)
    const event = new Event('navigate', { cancelable: true })
    Object.assign(event, { navigationType: 'traverse', canIntercept: true, destination: { key } })
    window.navigation.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false)
  }
  Object.assign(globalThis, { window, document, Element: FakeElement })
  const props = controlled === undefined ? {} : { dirty: controlled }
  const jsx = (type, props) => { if (type === 'span' && props.ref) props.ref.current = { parentElement: scope }; return { type, props } }
  const app = mountPage('src/components/ui/UnsavedChangesGuard.tsx', {
    'next/navigation': { useRouter: () => router }, 'react/jsx-runtime': { jsx, jsxs: jsx },
  }, { exported: 'UnsavedChangesGuard', props })
  const helpers = loadTs('src/components/ui/UnsavedChangesGuard.tsx', {
    react: {}, 'next/navigation': {}, '@/src/components/ui/ConfirmDialog': {},
  })
  const dialog = () => app.find(node => node.type === 'ConfirmDialog')
  return { app, scope, input, window, routes, traversals, props, helpers, dialog,
    edit(target = input) { const event = new Event('input'); Object.defineProperty(event, 'target', { value: target }); scope.dispatchEvent(event); app.render() },
    cleanup() { app.cleanup(); Object.assign(globalThis, previous) },
  }
}

test('unsaved detection ignores unrelated controls and clears only after confirmed save', () => {
  const f = fixture()
  try {
    f.app.render()
    f.edit({})
    let event = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false)
    f.edit()
    event = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(event)
    assert.equal(event.defaultPrevented, true)
    f.helpers.markFormSaved(); f.app.render()
    event = new Event('beforeunload', { cancelable: true }); f.window.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false)
  } finally { f.cleanup() }
})

test('cancel buttons ask once, preserve edits when cancelled and navigate only after confirmation', () => {
  const f = fixture(true)
  try {
    f.app.render()
    f.helpers.requestFormNavigation(() => f.routes.push('/cancel')); f.app.render()
    assert.deepEqual(f.routes, [])
    assert.equal(f.dialog().props.open, true)
    f.dialog().props.onOpenChange(false); f.app.render()
    assert.deepEqual(f.routes, [])
    f.helpers.requestFormNavigation(() => f.routes.push('/cancel')); f.app.render()
    f.dialog().props.onConfirm()
    assert.deepEqual(f.routes, ['/cancel'])
  } finally { f.cleanup() }
})

test('browser traversal is cancelled before leaving and resumes the exact entry after confirmation', () => {
  const f = fixture(true)
  try {
    f.app.render()
    const event = new Event('navigate', { cancelable: true })
    Object.assign(event, { navigationType: 'traverse', canIntercept: true, destination: { key: 'previous' } })
    f.window.navigation.dispatchEvent(event); f.app.render()
    assert.equal(event.defaultPrevented, true)
    assert.deepEqual(f.traversals, [])
    f.dialog().props.onConfirm()
    assert.deepEqual(f.traversals, ['previous'])
    f.props.dirty = false; f.app.render()
    f.helpers.requestFormNavigation(() => f.routes.push('/saved'))
    assert.deepEqual(f.routes, ['/saved'])
  } finally { f.cleanup() }
})
