import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

// Explicit local container only: no connection string, remote host or credentials.
const container = process.argv.includes('--isolated') ? 'supabase_db_sarierp_aud01' : 'supabase_db_sarierp'
if (!process.env.CI && !process.argv.includes('--isolated')) {
  throw new Error('Outside CI use --isolated; the normal development database is never a test target.')
}
const files = [
  'platform_admin_console.sql',
  'accounting_access.sql',
  'billing_points_of_sale.sql',
  'cai_office_numbering.sql',
  'cai_office_backfill.sql',
  'tgu_confirmed_fiscal_prefix.sql',
  'tgu_restore_registered_cai_prefix.sql',
  'cai_master_lifecycle.sql',
  'fiscal_offices.sql', 'fiscal_invoice_workflow.sql', 'customer_collections.sql',
  'accounting_engine.sql',
  'accounting_catalog_structure.sql',
  'service_accounting_assignments.sql', 'supplier_type_catalog.sql', 'supplier_default_expense_account.sql', 'purchase_optional_supplier_identity.sql',
  'accounting_financial_sources.sql',
  'fixed_assets.sql',
  'accounting_currency.sql',
  'fiscal_discounts.sql',
  'fiscal_void_approval.sql',
  'invoice_drafts_and_master_review.sql',
  'finance_reporting_and_banks.sql',
  'agent_quote_internal_notes.sql',
  'customs_only_service.sql',
  'demo_request_server.sql',
  'sales_activity_execution_status.sql',
  'aud01_pricing_write_permissions.sql', 'aud02_supplier_payments.sql',
  'aud03_supplier_payable_balances.sql', 'aud05_quotation_transitions.sql', 'won_quotation_pricing_adjustments.sql',
  'aud06_miami_assignment.sql', 'aud07_verified_environment.sql', 'aud08_email_delivery.sql', 'aud11_portal_incidents.sql',
]
for (const file of files) {
  let sql = fs.readFileSync(new URL('../supabase/tests/' + file, import.meta.url), 'utf8').replaceAll('-- APPLY_CONFIRMED_OFFICE_BINDING_MIGRATION', () => fs.readFileSync(new URL('../supabase/migrations/20261028150000_cai_office_binding.sql', import.meta.url), 'utf8'))
  sql = sql.replaceAll('-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION', () => fs.readFileSync(new URL('../supabase/migrations/20261028180000_tgu_confirmed_fiscal_prefix.sql', import.meta.url), 'utf8'))
  sql = sql.replaceAll('-- APPLY_RESTORED_TGU_PREFIX_MIGRATION', () => fs.readFileSync(new URL('../supabase/migrations/20261029170000_restore_tgu_registered_cai_prefix.sql', import.meta.url), 'utf8'))
  if (/^(billing_points_of_sale|cai_|tgu_|fiscal_|customer_collections|accounting_|service_accounting_|fixed_assets|invoice_drafts_|finance_reporting_)/.test(file)) {
    sql = sql.replace(/^begin;/im, "begin;\nset local time zone 'America/Tegucigalpa';")
  }
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    console.error(`FAIL ${file}`)
    console.error(result.error?.message || result.stderr || result.stdout)
    process.exit(1)
  }
  console.log(`PASS ${file}`)
}
