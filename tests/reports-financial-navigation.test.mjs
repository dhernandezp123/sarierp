import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'
import { pagedClient } from './paged-client.mjs'

function reportsFixture(query, role = 'Admin') {
  const previous = globalThis.window
  globalThis.window = { setTimeout, clearTimeout, location: { search: '?' + query }, history: {
    replaceState(_state, _unused, url) { window.location.search = url.slice(url.indexOf('?')) },
  } }
  const client = pagedClient({})
  const app = mountPage('src/app/(protected)/reports/page.tsx', {
    '@/src/hooks/useUser': { useUser: () => ({ user: { id: 'reviewer' }, profile: { tenant_id: 'tenant', rol: role }, loading: false }) },
    'next/navigation': { usePathname: () => '/reports', useSearchParams: () => new URLSearchParams(window.location.search) },
    '@/src/lib/supabase/client': { supabase: client },
    '@/src/lib/company-settings': { loadCurrentCompanySettings: async () => ({ data: null, error: null }) },
    '@/src/components/accounting/FinanceReportWorkspace': { FinanceReportWorkspace: 'FinanceReportWorkspace' },
    '@/src/components/pdf/report-pdf': { ReportPdf: 'ReportPdf' },
  }, { unwrap: element => element.type, expand: type => type.name === 'FinancialReportPanel' })
  const flush = async () => { app.render(); await app.tick(); app.render(); app.render() }
  return { app, client, flush, cleanup() { app.cleanup(); if (previous === undefined) delete globalThis.window; else globalThis.window = previous } }
}

test('CxC y CxP mantienen cabecera y navegacion de Reportes y reutilizan el reporte canonico', async () => {
  for (const role of ['Admin', 'Contabilidad', 'Finanzas']) {
    for (const report of ['receivable', 'payable']) {
      const f = reportsFixture(`report=${report}`, role)
      try {
        await f.flush()
        assert.equal(f.app.text(f.app.find(n => n.type === 'h1')), 'Reportes')
        assert.ok(f.app.find(n => n.type === 'nav' && n.props['aria-label'] === 'Tipo de reporte'))
        assert.equal(f.app.button(report === 'receivable' ? 'Cuentas por cobrar' : 'Cuentas por pagar').props['aria-pressed'], true)
        const workspace = f.app.find(n => n.type === 'FinanceReportWorkspace')
        assert.equal(workspace.props.side, report)
        assert.equal(workspace.props.embedded, true)
        assert.equal(f.app.find(n => n.props?.['aria-label'] === 'Filtros del reporte'), undefined)
        assert.equal(f.client.calls.length, 0, 'No consulta saldos legacy ni datos del reporte anterior')
      } finally { f.cleanup() }
    }
  }
})

test('cambiar Comercial -> CxC -> CxP -> Comercial conserva filtros y mantiene montados los paneles financieros visitados', async () => {
  const f = reportsFixture('report=commercial&search=REFERENCIA&page=3&pageSize=50&from=2026-01-01&to=2026-11-03')
  try {
    await f.flush()
    f.app.button('Cuentas por cobrar').props.onClick(); await f.flush()
    f.app.button('Cuentas por pagar').props.onClick(); await f.flush()
    const panels = f.app.findAll(n => n.type === 'section' && String(n.props['aria-label']).startsWith('Reporte de cuentas por'))
    assert.deepEqual(panels.map(n => n.props.hidden), [true, false])
    assert.equal(f.app.findAll(n => n.type === 'FinanceReportWorkspace').length, 2)
    assert.deepEqual(f.app.findAll(n => n.type === 'FinanceReportWorkspace').map(n => n.props.active), [false, true])
    f.app.button('Comercial').props.onClick(); await f.flush()
    const restored = new URLSearchParams(window.location.search)
    assert.equal(restored.get('report'), 'commercial')
    assert.equal(restored.get('search'), 'REFERENCIA')
    assert.equal(restored.get('page'), '3')
    assert.equal(restored.get('pageSize'), '50')
    assert.equal(restored.get('from'), '2026-01-01')
    assert.deepEqual(f.app.findAll(n => n.type === 'section' && String(n.props['aria-label']).startsWith('Reporte de cuentas por')).map(n => n.props.hidden), [true, true])
  } finally { f.cleanup() }
})

test('los roles comerciales no reciben reportes financieros mediante URL directa', async () => {
  for (const role of ['Ventas', 'Pricing', 'Operaciones']) {
    const f = reportsFixture('report=payable', role)
    try {
      await f.flush()
      assert.equal(f.app.find(n => n.type === 'FinanceReportWorkspace'), undefined)
      assert.equal(f.app.button('Cuentas por pagar'), undefined)
    } finally { f.cleanup() }
  }
})

test('workspace financiero embebido conserva Actualizar y exportaciones y oculta navegacion contable; la pantalla independiente conserva su cabecera', async () => {
  for (const embedded of [true, false]) {
    const app = mountPage('src/components/accounting/FinanceReportWorkspace.tsx', {
      '@/src/hooks/useFinanceReport': { useFinanceReport: () => ({ loading: false, error: '', documents: [], movements: [], parties: [], coverage: '', legacy: false }) },
      './AccountingNav': { AccountingNav: 'AccountingNav' },
      '@/src/components/invoicing/FinancialReportExport': { FinancialReportExport: 'FinancialReportExport' },
    }, { exported: 'FinanceReportWorkspace', props: { side: 'receivable', embedded } })
    try {
      await app.ready()
      assert.equal(Boolean(app.find(n => n.type === 'AccountingNav')), !embedded)
      assert.ok(app.find(n => n.type === 'FinancialReportExport'))
      assert.ok(app.find(n => n.props?.id === (embedded ? 'finance-party-receivable' : 'finance-party')))
      if (embedded) {
        assert.equal(app.text(app.find(n => n.type === 'h2')), 'Cuentas por cobrar')
        assert.ok(app.button('Actualizar'))
        assert.equal(app.find(n => n.props?.href === '/reports'), undefined)
      } else assert.ok(app.find(n => n.props?.title === 'Cuentas por cobrar'))
    } finally { app.cleanup() }
  }
})
