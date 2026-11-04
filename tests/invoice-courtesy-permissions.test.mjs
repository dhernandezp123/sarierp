import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

const reviewer = { profile_id: 'reviewer', display_name: 'Revisor ficticio', role_name: 'Admin', active: true, approved: true, explicit_permission: true, designated_master: false }
function fixture({ admin = true, fail = false, deferredSave } = {}) {
  const writes = [], messages = []
  const db = { rpc: async (name, values) => {
    if (name === 'list_invoice_courtesy_approvers') return { data: [reviewer], error: null }
    writes.push({ name, values })
    if (deferredSave) return deferredSave()
    return { error: fail ? { message: 'Permiso rechazado' } : null }
  } }
  const page = mountPage('src/components/invoicing/InvoiceCourtesyPermissions.tsx', {
    '@/src/hooks/useUser': { useUser: () => ({ user: { id: 'admin' }, profile: { tenant_id: 'tenant', rol: admin ? 'Admin' : 'Contabilidad', status: 'Aprobado', is_active: true } }) },
    '@/src/lib/supabase/client': { supabase: db },
    '@/src/lib/report-query': { readAllReportRows: async () => [{ id: 'new-reviewer', nombre: 'Nuevo', apellido: 'Revisor', rol: 'Finanzas' }] },
    sonner: { toast: { success: text => messages.push(text), error: text => messages.push(text) } },
  }, { exported: 'InvoiceCourtesyPermissions', unwrap: node => node.type, props: { tenantId: 'tenant', admin } })
  const reason = value => { page.find(node => node.type === 'input' && node.props['aria-label'] === 'Motivo del cambio de autorizadores').props.onChange({ target: { value } }); page.render() }
  const confirm = () => page.find(node => node.type === 'ConfirmDialog')
  return { page, writes, messages, reason, confirm }
}

test('courtesy permission changes require a reason and confirmation before writing', async () => {
  const f = fixture()
  try {
    await f.page.ready()
    assert.equal(f.page.button('Quitar designación').props.disabled, true)
    f.reason('Autorizacion de Gerencia')
    f.page.find(node => node.type === 'CompactSelect').props.onValueChange('new-reviewer'); f.page.render()
    f.page.button('Incorporar autorizador').props.onClick(); f.page.render()
    assert.equal(f.writes.length, 0)
    f.confirm().props.onConfirm(); await f.page.tick(); f.page.render()
    assert.deepEqual(f.writes, [{ name: 'set_invoice_courtesy_approver', values: { p_profile_id: 'new-reviewer', p_enabled: true, p_reason: 'Autorizacion de Gerencia' } }])
  } finally { f.page.cleanup() }
})

test('failed revocation keeps the reviewer visible and reports the server error', async () => {
  const f = fixture({ fail: true })
  try {
    await f.page.ready(); f.reason('Retirar permiso por Gerencia')
    f.page.button('Quitar designación').props.onClick(); f.page.render()
    f.confirm().props.onConfirm(); await f.page.tick(); f.page.render()
    assert.match(f.page.text(), /Revisor ficticio/)
    assert.equal(f.writes[0].values.p_enabled, false)
    assert.deepEqual(f.messages, ['Permiso rechazado'])
  } finally { f.page.cleanup() }
})

test('accounting can view reviewers but cannot manage their designations', async () => {
  const f = fixture({ admin: false })
  try {
    await f.page.ready(); assert.match(f.page.text(), /Revisor ficticio/)
    assert.equal(f.page.button('Incorporar autorizador'), undefined)
    assert.equal(f.page.button('Quitar designación'), undefined)
    assert.equal(f.writes.length, 0)
  } finally { f.page.cleanup() }
})

test('duplicate confirmation cannot submit the same permission mutation twice', async () => {
  let complete
  const f = fixture({ deferredSave: () => new Promise(resolve => { complete = resolve }) })
  try {
    await f.page.ready(); f.reason('Retirar permiso por Gerencia')
    f.page.button('Quitar designación').props.onClick(); f.page.render()
    const confirm = f.confirm().props.onConfirm
    confirm(); confirm(); assert.equal(f.writes.length, 1)
    f.page.cleanup(); complete({ error: null }); await f.page.tick()
    assert.deepEqual(f.messages, [])
  } finally { f.page.cleanup() }
})
