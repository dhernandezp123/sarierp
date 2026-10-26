import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

// Explicit local container only: no connection string, remote host or credentials.
const container = process.argv.includes('--isolated') ? 'supabase_db_sarierp_aud01' : 'supabase_db_sarierp'
if (!process.env.CI && !process.argv.includes('--isolated')) {
  throw new Error('Outside CI use --isolated; the normal development database is never a test target.')
}
const files = [
  'accounting_access.sql',
  'billing_points_of_sale.sql',
  'agent_quote_internal_notes.sql',
  'customs_only_service.sql',
  'demo_request_server.sql',
  'sales_activity_execution_status.sql',
  'aud01_pricing_write_permissions.sql', 'aud02_supplier_payments.sql',
  'aud03_supplier_payable_balances.sql', 'aud05_quotation_transitions.sql', 'won_quotation_pricing_adjustments.sql',
  'aud06_miami_assignment.sql', 'aud07_verified_environment.sql', 'aud08_email_delivery.sql', 'aud11_portal_incidents.sql',
]
for (const file of files) {
  const sql = fs.readFileSync(new URL('../supabase/tests/' + file, import.meta.url), 'utf8')
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
