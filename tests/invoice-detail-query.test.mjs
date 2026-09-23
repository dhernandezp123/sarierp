import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const invoiceDetailPage = fs.readFileSync(
  'src/app/(protected)/invoicing/[id]/page.tsx',
  'utf8'
)

test('el detalle de factura resuelve la factura original sin embed recursivo', () => {
  assert.match(
    invoiceDetailPage,
    /supabase\.from\('invoices'\)\.select\('\*'\)\.eq\('id', id\)\.single\(\)/
  )
  assert.match(
    invoiceDetailPage,
    /\.select\('invoice_number'\)[\s\S]*?\.eq\('id', invRes\.data\.parent_invoice_id\)[\s\S]*?\.maybeSingle\(\)/
  )
  assert.doesNotMatch(
    invoiceDetailPage,
    /parent_invoice:parent_invoice_id\(invoice_number\)/
  )
})
