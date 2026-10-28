import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import { pagedClient } from './paged-client.mjs'

function fixture({ master = true, role = 'Contabilidad', active = false, failure = false } = {}) {
  const previousWindow = globalThis.window
  globalThis.window = { setTimeout, clearTimeout }
  const writes = [], errors = [], successes = []
  const range = { id: 'expired', cai: 'CAI-FICTICIO', point_of_sale: 'SPS', document_type: 'Factura', rango_desde: '001-001-01-00000001', rango_hasta: '001-001-01-00000100', fecha_limite_emision: '2017-08-20', next_number: 17, range_start: 1, range_end: 100, revision: 7, ever_used: true, archived_at: null, is_active: active }
  const supabase = {
    from(table) { const q = { select: () => q, order: () => q, eq: () => q, limit: () => q, then: resolve => Promise.resolve({ data: table === 'billing_offices' ? [{ name: 'SPS', establishment_code: '001', emission_point_code: '001' }] : table === 'cai_ranges' ? [range] : [], error: null }).then(resolve) }; return q },
    async rpc(name, args) { if (name === 'get_billing_points_of_sale') return { data: ['SPS'], error: null }; writes.push({ name, args }); return { data: 'expired', error: failure ? { message: 'El CAI cambió; recarga antes de guardar' } : null } },
  }
  const app = mountPage('src/app/(protected)/settings/cai/page.tsx', {
    '../../../../hooks/useUser': { useUser: () => ({ profile: { id: 'person', tenant_id: 'tenant', rol: role } }) },
    '../../../../lib/supabase/client': { supabase },
    '@/src/hooks/useInvoiceMaster': { useInvoiceMaster: () => ({ isMaster: master }) },
    '@/src/components/ui/toggle-switch': { ToggleSwitch: 'ToggleSwitch' },
    sonner: { toast: { error: value => errors.push(value), success: value => successes.push(value) } },
  })
  const button = label => app.find(node => node.type === 'button' && node.props['aria-label'] === label)
  const input = (label, value) => { app.find(node => ['input', 'textarea'].includes(node.type) && node.props['aria-label'] === label).props.onChange({ target: { value } }); app.render() }
  return { app, range, writes, errors, successes, button, input, cleanup() { app.cleanup(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow } }
}

test('Admin y Contabilidad sin designación master consultan CAI vencido sin controles de escritura', async () => {
  for (const role of ['Admin', 'Contabilidad']) {
    const f = fixture({ master: false, role })
    try { await f.app.ready(); assert.match(f.app.text(), /20\/08\/2017/); assert.equal(f.button('Registrar rango CAI'), undefined); assert.equal(f.button('Editar CAI-FICTICIO'), undefined); assert.equal(f.app.find(node => node.type === 'ToggleSwitch'), undefined); assert.ok(f.button('Ver historial de CAI-FICTICIO')); assert.deepEqual(f.writes, []) } finally { f.cleanup() }
  }
})
test('master corrige fecha de CAI vencido y usado con motivo, sin cambiar identidad ni correlativo', async () => {
  const f = fixture()
  try {
    await f.app.ready(); f.button('Editar CAI-FICTICIO').props.onClick(); f.app.render()
    assert.equal(f.app.find(node => node.type === 'input' && node.props['aria-label'] === 'CAI').props.disabled, true)
    assert.equal(f.app.find(node => node.type === 'input' && node.props['aria-label'] === 'Rango desde').props.disabled, true)
    assert.equal(f.app.find(node => node.type === 'input' && node.props['aria-label'] === 'Siguiente correlativo'), undefined)
    assert.equal(f.button('Guardar rango').props.disabled, true)
    f.input('Fecha límite de emisión', '2099-08-20'); f.input('Motivo del cambio CAI', 'Corregir error de digitación contra autorización')
    await f.button('Guardar rango').props.onClick()
    assert.deepEqual(f.errors, []); assert.equal(f.writes.length, 1)
    assert.equal(f.writes[0].name, 'save_cai_range'); assert.equal(f.writes[0].args.p_revision, 7); assert.equal(f.writes[0].args.p_id, 'expired')
    assert.equal(f.writes[0].args.p_values.fecha_limite_emision, '2099-08-20'); assert.equal(f.writes[0].args.p_values.next_number, '17')
  } finally { f.cleanup() }
})
test('corrección rechazada por versión conserva el formulario y muestra el error', async () => {
  const f = fixture({ failure: true })
  try {
    await f.app.ready(); f.button('Editar CAI-FICTICIO').props.onClick(); f.app.render(); f.input('Fecha límite de emisión', '2099-08-20'); f.input('Motivo del cambio CAI', 'Corrección ficticia')
    await f.button('Guardar rango').props.onClick(); f.app.render()
    assert.match(f.errors[0], /recarga/); assert.deepEqual(f.successes, []); assert.ok(f.button('Guardar rango'))
  } finally { f.cleanup() }
})
test('toggle permite desactivar un CAI activo vencido y exige motivo; vencido inactivo no puede activarse', async () => {
  for (const active of [true, false]) {
    const f = fixture({ active })
    try {
      await f.app.ready(); const toggle = f.app.find(node => node.type === 'ToggleSwitch')
      assert.equal(toggle.props.checked, active); assert.equal(toggle.props.disabled, !active)
      if (!active) continue
      toggle.props.onChange(); f.app.render(); assert.equal(f.button('Confirmar cambio CAI').props.disabled, true)
      f.input('Motivo de acción CAI', 'Suspender autorización vencida'); f.button('Confirmar cambio CAI').props.onClick(); f.app.render()
      f.app.find(node => node.type === 'ConfirmDialog').props.onConfirm(); await f.app.tick(); f.app.render()
      assert.equal(f.writes[0].name, 'set_cai_range_active'); assert.equal(f.writes[0].args.p_active, false); assert.equal(f.writes[0].args.p_reason, 'Suspender autorización vencida')
    } finally { f.cleanup() }
  }
})
test('eliminar CAI inactivo usa archivo lógico y mantiene disponible el historial', async () => {
  const f = fixture()
  try {
    await f.app.ready(); f.button('Eliminar CAI-FICTICIO').props.onClick(); f.app.render(); f.input('Motivo de acción CAI', 'Autorización sustituida')
    f.button('Confirmar cambio CAI').props.onClick(); f.app.render(); f.app.find(node => node.type === 'ConfirmDialog').props.onConfirm(); await f.app.tick(); f.app.render()
    assert.equal(f.writes[0].name, 'archive_cai_range'); assert.ok(f.button('Ver historial de CAI-FICTICIO'))
    assert.match(f.app.text(), /CAI-FICTICIO/)
  } finally { f.cleanup() }
})
test('master asigna oficinas por usuario con selección independiente y versión', async () => {
  const client = pagedClient({ profiles: [{ id: 'helper', nombre: 'Apoyo', apellido: 'Ficticio', email: 'apoyo@test.local', rol: 'Contabilidad', status: 'Aprobado', is_active: true }], billing_offices: [{ id: 'sps', name: 'SPS', is_active: true }, { id: 'tgu', name: 'TGU', is_active: true }], billing_user_office_access: [{ profile_id: 'helper', office_ids: ['tgu'], revision: 3 }] })
  const writes = []; client.rpc = async (name, args) => { writes.push({ name, args }); return { data: 4, error: null } }
  const app = mountPage('src/components/invoicing/BillingOfficeAccessSettings.tsx', { '@/src/lib/supabase/client': { supabase: client }, '@/src/hooks/useInvoiceMaster': { useInvoiceMaster: () => ({ isMaster: true }) }, '@/src/components/ui/toggle-switch': { ToggleSwitch: 'ToggleSwitch' } }, { exported: 'BillingOfficeAccessSettings', unwrap: element => element.type })
  try {
    await app.ready(); app.find(node => node.type === 'CompactSelect').props.onValueChange('helper'); app.render()
    assert.deepEqual(app.findAll(node => node.type === 'ToggleSwitch').map(node => node.props.checked), [false, true])
    app.findAll(node => node.type === 'ToggleSwitch')[0].props.onChange(); app.render()
    app.find(node => node.type === 'textarea').props.onChange({ target: { value: 'Apoyo temporal autorizado entre sedes' } }); app.render()
    app.find(node => node.type === 'button' && node.props['aria-label'] === 'Guardar autorización de oficinas').props.onClick(); app.render(); app.find(node => node.type === 'ConfirmDialog').props.onConfirm(); await app.tick(); app.render()
    assert.equal(writes[0].name, 'save_billing_user_office_access'); assert.deepEqual(writes[0].args.p_office_ids, ['tgu', 'sps']); assert.equal(writes[0].args.p_revision, 3)
  } finally { app.cleanup() }
})
