import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

function setup() {
  const rows = Array.from({ length: 126 }, (_, i) => ({
    id: `supplier-${i + 1}`, nombre: `Proveedor ${String(i + 1).padStart(3, '0')}`,
    tipo: i % 2 ? 'Agente' : 'Otro', contacto: null, email: null, pais: null,
    moneda: 'HNL', terminos_pago: 0, agents: null, is_active: i < 124,
  }))
  const offsets = []
  const api = { from() {
    const q = { select: () => q, order: () => q, range: async (from, to) => {
      offsets.push(from)
      return { data: rows.slice(from, Math.min(to + 1, from + 40)), error: null }
    } }
    return q
  } }
  const app = mountPage('src/app/(protected)/suppliers/page.tsx', { '@/src/lib/supabase/client': { supabase: api }, '@/src/hooks/useSupplierTypes': { useSupplierTypes:()=>({types:[{code:'Agente',label:'Agente',active:true,sort_order:10},{code:'Otro',label:'Otro',active:true,sort_order:20}],loading:false,error:null,label:code=>code}) }, '@/src/components/suppliers/SupplierTypeSelect':{SupplierTypeSelect:'SupplierTypeSelect'} })
  const pager = () => app.find(n => n.type === 'Pagination').props
  const visible = () => Math.max(0, app.findAll(n => n.type === 'tr').length - 1)
  return { app, pager, visible, offsets }
}

test('proveedores muestra 25/50/75/100 y conserva todos los registros aunque la API limite cada respuesta', async () => {
  const { app, pager, visible, offsets } = setup()
  try {
    await app.ready()
    assert.deepEqual(offsets, [0, 40, 80, 120, 126])
    assert.equal(pager().total, 124)
    assert.equal(visible(), 25)
    assert.deepEqual(pager().pageSizeOptions, [25, 50, 75, 100])
    pager().onPageChange(5); app.render()
    assert.equal(visible(), 24)
    for (const size of [50, 75, 100]) {
      pager().onPageSizeChange(size); app.render()
      assert.equal(pager().page, 1)
      assert.equal(visible(), size)
    }
    pager().onPageChange(2); app.render()
    assert.equal(visible(), 24)
    assert.match(app.text(), /Proveedor 124/)
    assert.doesNotMatch(app.text(), /Proveedor 001/)
  } finally { app.cleanup() }
})

test('buscar, filtrar tipo o cambiar inactivos vuelve a la primera página y pagina sobre el resultado filtrado', async () => {
  const { app, pager, visible } = setup()
  try {
    await app.ready()
    pager().onPageChange(5); app.render()
    app.find(n => n.type === 'input' && n.props.placeholder?.startsWith('Buscar')).props.onChange({ target: { value: 'Proveedor 001' } }); app.render()
    assert.equal(pager().page, 1); assert.equal(pager().total, 1); assert.equal(visible(), 1)
    app.find(n => n.type === 'input' && n.props.placeholder?.startsWith('Buscar')).props.onChange({ target: { value: '' } }); app.render()
    pager().onPageChange(5); app.render()
    app.find(n => n.type === 'input' && n.props.type === 'checkbox').props.onChange({ target: { checked: true } }); app.render()
    assert.equal(pager().page, 1); assert.equal(pager().total, 126)
    pager().onPageChange(6); app.render(); assert.equal(visible(), 1)
    app.find(n => n.type === 'SupplierTypeSelect').props.onChange('Agente'); app.render()
    assert.equal(pager().page, 1); assert.equal(pager().total, 63); assert.equal(visible(), 25)
  } finally { app.cleanup() }
})
