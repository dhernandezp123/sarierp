import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const { searchClients } = loadTs('src/lib/client-search.ts')
const clients = [{ id: 'a', nombre: 'Café Horizonte', codigo_cliente: 'RT0039', rtn: '0801-1999-000123' }, { id: 'b', nombre: 'Servicios del Norte', codigo_cliente: 'RT0040', rtn: '05011999000124' }, { id: 'c', nombre: 'Café del Norte', codigo_cliente: null, rtn: null }]

test('busca nombre y código con acentos, mayúsculas y palabras separadas, además de RTN con o sin guiones', () => {
  assert.deepEqual(searchClients(clients, '  CAFE  ').map(c => c.id), ['a', 'c'])
  assert.deepEqual(searchClients(clients, 'horizonte RT0039').map(c => c.id), ['a'])
  assert.deepEqual(searchClients(clients, '08011999000123').map(c => c.id), ['a'])
  assert.deepEqual(searchClients(clients, '0801-1999-000123').map(c => c.id), ['a'])
  assert.deepEqual(searchClients(clients, 'norte cafe').map(c => c.id), ['c'])
  assert.equal(searchClients(clients, '  '), clients)
  assert.deepEqual(searchClients(clients, 'no existe'), [])
})

function mountCombo(inline = false) {
  const previous = globalThis.document, chosen = [], focus = []
  globalThis.document = { body: {}, addEventListener() {}, removeEventListener() {} }
  const props = { clientes: clients, value: '', onChange: id => { chosen.push(id); props.value = id }, renderInline: inline }
  const app = mountPage('src/components/ui/ClienteCombobox.tsx', {
    'react-dom': { createPortal: node => node },
    './useComboboxPortal': { useDropdownPosition: () => ({ top: 10, left: 10, width: 400, maxHeight: 360, above: false }) },
  }, { exported: 'ClienteCombobox', props })
  app.render()
  app.find(n => n.props?.role === 'combobox').props.ref.current = { focus: () => focus.push(true) }
  const key = (name, node = app.find(n => n.type === 'input')) => { let prevented = false; node.props.onKeyDown({ key: name, preventDefault: () => { prevented = true } }); app.render(); return prevented }
  return { app, props, chosen, focus, key, cleanup() { app.cleanup(); if (previous === undefined) delete globalThis.document; else globalThis.document = previous } }
}

test('combobox real filtra sin seleccionar, navega con flechas y confirma solo con Enter en portal e inline', () => {
  for (const inline of [false, true]) {
    const f = mountCombo(inline)
    try {
      const trigger = f.app.find(n => n.props?.role === 'combobox')
      f.key('ArrowDown', trigger)
      assert.equal(f.app.findAll(n => n.props?.role === 'option').length, 3)
      f.app.find(n => n.type === 'input').props.onChange({ target: { value: 'cafe' } }); f.app.render()
      assert.equal(f.app.findAll(n => n.props?.role === 'option').length, 2)
      assert.deepEqual(f.chosen, [])
      f.key('ArrowDown'); const input = f.app.find(n => n.type === 'input')
      assert.equal(input.props['aria-activedescendant'], f.app.findAll(n => n.props?.role === 'option')[1].props.id)
      f.key('Enter'); assert.deepEqual(f.chosen, ['c']); assert.equal(f.app.find(n => n.props?.role === 'listbox'), undefined)
      assert.ok(f.focus.length); assert.match(f.app.text(), /Café del Norte/)
    } finally { f.cleanup() }
  }
})

test('sin resultados no selecciona por Enter; Escape y Tab cierran y restauran el foco', () => {
  const f = mountCombo()
  try {
    f.app.find(n => n.props?.role === 'combobox').props.onClick(); f.app.render()
    f.app.find(n => n.type === 'input').props.onChange({ target: { value: 'inexistente' } }); f.app.render()
    f.key('ArrowDown'); f.key('Enter'); assert.deepEqual(f.chosen, [])
    assert.equal(f.app.find(n => n.type === 'input').props['aria-activedescendant'], undefined)
    assert.match(f.app.text(), /No encontramos clientes/)
    assert.equal(f.key('Escape'), true)
    assert.equal(f.app.find(n => n.props?.role === 'combobox').props['aria-expanded'], false)
    f.app.find(n => n.props?.role === 'combobox').props.onClick(); f.app.render()
    assert.equal(f.key('Tab'), false); assert.ok(f.focus.length >= 2)
  } finally { f.cleanup() }
})

test('un selector bloqueado o cargando no mantiene abierto el menú ni permite cambiar el cliente', () => {
  const f = mountCombo()
  try {
    f.app.find(n => n.props?.role === 'combobox').props.onClick(); f.app.render()
    const option = f.app.find(n => n.props?.role === 'option')
    f.props.disabled = true; f.app.render()
    assert.equal(f.app.find(n => n.props?.role === 'listbox'), undefined)
    assert.equal(f.app.find(n => n.props?.role === 'combobox').props.disabled, true)
    // El control nativo bloquea interacción y el handler de teclado mantiene el mismo contrato.
    f.key('ArrowDown', f.app.find(n => n.props?.role === 'combobox')); assert.deepEqual(f.chosen, [])
    assert.ok(option)
    f.props.disabled = false; f.props.loading = true; f.app.render()
    assert.match(f.app.text(), /Cargando clientes/)
  } finally { f.cleanup() }
})
