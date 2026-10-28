import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

function fixture({ searchable = false, modal = false, disabled = false } = {}) {
  const previous = { document: globalThis.document, window: globalThis.window }, changes = [], portals = [], focus = [], listeners = new Map()
  globalThis.document = { body: {}, addEventListener() {}, removeEventListener() {} }
  globalThis.window = { setTimeout, clearTimeout, addEventListener(type, handler) { listeners.set(type, handler) }, removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type) } }
  const props = { value: 'invoice', 'aria-label': 'Documento', searchable, disabled, options: [
    { value: 'invoice', label: 'Factura', description: 'Ventas' },
    { value: 'locked', label: 'Serie reservada', disabled: true },
    { value: 'credit', label: 'Nota de Crédito', description: 'Contabilidad' },
    { value: 'debit', label: 'Nota de Débito', description: 'Contabilidad' },
  ], onValueChange(value) { changes.push(value); props.value = value } }
  const app = mountPage('src/components/ui/CompactSelect.tsx', {
    'react-dom': { createPortal(node) { portals.push(node); return node } },
    './useComboboxPortal': { useDropdownPosition: () => ({ top: 100, left: 10, width: 320, maxHeight: 280, above: false }) },
  }, { exported: 'CompactSelect', props })
  const trigger = () => app.find(node => node.type === 'button' && node.props.role === 'combobox')
  const key = (value, node = trigger()) => { let prevented = false, stopped = false; node.props.onKeyDown({ key: value, preventDefault() { prevented = true }, stopPropagation() { stopped = true } }); app.render(); return { prevented, stopped } }
  app.render(); trigger().props.ref({ focus: () => focus.push(true), closest: () => modal ? {} : null })
  return { app, props, changes, portals, focus, listeners, trigger, key, cleanup() { app.cleanup(); for (const [name, value] of Object.entries(previous)) if (value === undefined) delete globalThis[name]; else globalThis[name] = value } }
}

test('selector compacto navega por teclado, omite opciones deshabilitadas y conserva el valor controlado', () => {
  const f = fixture()
  try {
    assert.equal(f.trigger().props['aria-expanded'], false)
    assert.equal(f.key('ArrowDown').prevented, true)
    f.key('ArrowDown');f.key('Enter')
    assert.deepEqual(f.changes, ['credit']);assert.equal(f.trigger().props['aria-expanded'], false);assert.match(f.app.text(), /Nota de Crédito/)
    assert.equal(f.focus.length, 1)
  } finally { f.cleanup() }
})
test('búsqueda encuentra acentos y datos secundarios; Escape cierra solo la lista y devuelve foco', () => {
  const f = fixture({ searchable: true })
  try {
    f.key('ArrowDown')
    f.app.find(node => node.type === 'input').props.onChange({ target: { value: 'credito' } });f.app.render()
    assert.equal(f.app.findAll(node => node.props.role === 'option').length, 1)
    f.app.find(node => node.type === 'input').props.onChange({ target: { value: 'contabilidad' } });f.app.render()
    assert.equal(f.app.findAll(node => node.props.role === 'option').length, 2)
    assert.deepEqual(f.key('Escape', f.app.find(node => node.type === 'input')), { prevented: true, stopped: true })
    assert.deepEqual(f.changes, []);assert.equal(f.trigger().props['aria-expanded'], false);assert.equal(f.focus.length, 1)
  } finally { f.cleanup() }
})
test('dentro de diálogo la lista permanece en su árbol y seleccionar evita activación del label', () => {
  const f = fixture({ modal: true })
  try {
    f.key('ArrowDown');assert.equal(f.portals.length, 0)
    let prevented = false, stopped = false
    f.app.findAll(node => node.props.role === 'option')[3].props.onClick({ preventDefault() { prevented = true }, stopPropagation() { stopped = true } });f.app.render()
    assert.equal(prevented && stopped, true);assert.deepEqual(f.changes, ['debit']);assert.equal(f.trigger().props['aria-expanded'], false)
  } finally { f.cleanup() }
})
test('un selector deshabilitado no abre con teclado ni cambia datos', () => {
  const f = fixture({ disabled: true })
  try { f.key('Enter');assert.equal(f.trigger().props.disabled, true);assert.equal(f.trigger().props['aria-expanded'], false);assert.deepEqual(f.changes, []) } finally { f.cleanup() }
})
test('Escape se atiende antes del cierre del modal y libera el listener al cerrar la lista', () => {
  const f = fixture({ modal: true })
  try {
    f.key('ArrowDown');let prevented=false, stopped=false
    f.listeners.get('keydown')({key:'Escape',preventDefault(){prevented=true},stopPropagation(){stopped=true}});f.app.render()
    assert.equal(prevented&&stopped,true);assert.equal(f.trigger().props['aria-expanded'],false);assert.equal(f.listeners.has('keydown'),false);assert.equal(f.focus.length,1)
  } finally { f.cleanup() }
})
