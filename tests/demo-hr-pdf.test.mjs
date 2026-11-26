import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { pdf } from '@react-pdf/renderer'
import loadTs from './load-ts.mjs'

const walk = node => [node, ...(node.children || []).flatMap(walk)]
const notice = 'DOCUMENTO SIN VALIDEZ COMERCIAL, OPERATIVA O FISCAL'
const date = '2026-11-25'
const cases = [
  ['hr-certificate-pdf.tsx', 'HrCertificatePdf', { certificate: { kind: 'Vacaciones', certificate_number: 'DEMO-1', created_at: date, snapshot: { company: { legal_name: 'Atlas Demo' }, employee: { name: 'Persona sintetica', employee_code: 'TEST', hire_date: date }, act: { leave_type: 'Vacaciones', start_date: date, end_date: date, days: 1 } } } }],
  ['hr-payslip-pdf.tsx', 'HrPayslipPdf', { slip: { company: { name: 'Atlas Demo' }, employee: { code: 'TEST', name: 'Persona sintetica' }, kind: 'Ordinaria', id: 'DEMO-1', status: 'Aprobada', starts_on: date, ends_on: date, pay_date: date, currency: 'HNL', gross: 60, deductions: 0, net: 60, employer: 0, items: Array.from({ length: 60 }, () => ({ name: 'Concepto sintetico', kind: 'Ingreso', amount: 1 })) } }],
  ['hr-benefit-pdf.tsx', 'HrBenefitPdf', { id: 'DEMO-1', createdAt: date, snapshot: { kind: 'Vacaciones', employee_code: 'TEST', employee_name: 'Persona sintetica', hire_date: date, as_of: date, currency: 'HNL', version: 1, ordinary_daily: 1, indemnity_daily: 1, lines: [], total: 0, fingerprint: 'synthetic' } }],
]

for (const [file, name, props] of cases) {
  test(`${name} keeps the sandbox notice on every rendered page`, async () => {
    const component = loadTs(`src/components/pdf/${file}`, {
      '@/src/lib/demo-environment': { IS_DEMO_ENVIRONMENT: true, DEMO_DOCUMENT_NOTICE: notice },
    })[name]
    let layout
    await pdf(React.cloneElement(component(props), { onRender: result => { layout = result._INTERNAL__LAYOUT__DATA_ } })).toBlob()
    assert.ok(layout.children.length > 0)
    if (name === 'HrPayslipPdf') assert.ok(layout.children.length > 1)
    for (const page of layout.children) {
      const text = walk(page).filter(node => node.type === 'TEXT').flatMap(node => (node.lines || []).map(line => line.string)).join(' ')
      assert.match(text, /AMBIENTE DEMO/)
      assert.ok(text.includes(notice))
    }
  })
}
