import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'

const { isSidebarItemActive, sidebarGroupOrder } = loadTs('src/lib/sidebar-navigation.ts')
const { quotationListHref, quotationTransitionHint } = loadTs('src/lib/quotation-detail-ux.ts')
const { canAccessPath } = loadTs('src/lib/permissions.ts')

test('quotation details and editing select the list without also selecting activity or creation', () => {
  const links = ['/historico', '/historico/activity', '/quotations/new']
  for (const pathname of ['/historico', '/quotations/quote-1', '/quotations/quote-1/edit']) {
    assert.deepEqual(links.filter((href) => isSidebarItemActive(pathname, href)), ['/historico'])
  }
  assert.deepEqual(links.filter((href) => isSidebarItemActive('/historico/activity', href)), ['/historico/activity'])
  assert.deepEqual(links.filter((href) => isSidebarItemActive('/quotations/new', href)), ['/quotations/new'])
  assert.equal(isSidebarItemActive('/miami/inventario', '/miami', true), false)
  assert.equal(isSidebarItemActive('/reportstuff', '/reports'), false)
})

test('role ordering preserves all groups and does not expand route permissions', () => {
  for (const [role, first] of [['Admin', 'commercial'], ['Ventas', 'commercial'], ['Pricing', 'pricing'], ['Operaciones', 'operations'], ['Finanzas', 'finance'], ['Contabilidad', 'finance']]) {
    const groups = sidebarGroupOrder(role)
    assert.equal(groups[0], first)
    assert.equal(new Set(groups).size, 6)
  }
  assert.equal(canAccessPath('Finanzas', '/quotations/new'), false)
  assert.equal(canAccessPath('Ventas', '/pricing-comparison'), false)
  assert.equal(canAccessPath('Pricing', '/quotations/quote-1'), false)
})

test('return to list preserves filters and rejects external or unrelated paths', () => {
  const valid = '/historico?status=Ganada&search=ACME+%26+Co&page=3&pageSize=50&from=2026-09-01&to=2026-09-14'
  const result = new URL(quotationListHref(valid), 'https://forwarders.app')
  assert.equal(result.searchParams.get('search'), 'ACME & Co')
  assert.equal(result.searchParams.get('page'), '3')
  assert.equal(result.searchParams.get('from'), '2026-09-01')
  for (const value of ['https://evil.example/historico', '//evil.example', '/historico/../admin', '/historico/activity', '/historico#bad', 'javascript:alert(1)', null]) assert.equal(quotationListHref(value), '/historico')
  assert.equal(quotationListHref('/historico?next=https://evil.example'), '/historico')
})

test('option prerequisites explain existing blocked transitions while legacy quotes remain usable', () => {
  assert.equal(quotationTransitionHint('Ganada', []), null)
  assert.equal(quotationTransitionHint('Enviada al Cliente', []), null)
  assert.match(quotationTransitionHint('Enviada al Cliente', [{ status: 'Borrador' }]), /Pricing/)
  assert.match(quotationTransitionHint('Ganada', [{ status: 'Ofrecida' }]), /elección/)
  assert.equal(quotationTransitionHint('Ganada', [{ status: 'Aceptada' }, { status: 'No seleccionada' }]), null)
  assert.equal(quotationTransitionHint('Perdida', [{ status: 'Ofrecida' }]), null)
})
