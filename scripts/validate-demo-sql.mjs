import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

if (!process.env.CI) throw new Error('This runner only targets the disposable CI stack.')
const files = ['invoice_drafts_and_master_review.sql', 'demo_production_parity.sql', 'finance_reporting_and_banks.sql', 'cai_office_numbering.sql', 'cai_office_backfill.sql', 'cai_master_lifecycle.sql', 'tgu_confirmed_fiscal_prefix.sql', 'tgu_restore_registered_cai_prefix.sql', 'accounting_catalog_structure.sql', 'service_accounting_assignments.sql', 'supplier_type_catalog.sql', 'supplier_default_expense_account.sql']
for (const file of files) {
  let sql = fs.readFileSync(new URL('../supabase/tests/' + file, import.meta.url), 'utf8')
  sql = sql.replaceAll('-- APPLY_CONFIRMED_OFFICE_BINDING_MIGRATION', () => fs.readFileSync(new URL('../supabase/migrations/20261028150000_cai_office_binding.sql', import.meta.url), 'utf8'))
  sql = sql.replaceAll('-- APPLY_LATEST_TGU_CONFIRMATION_MIGRATION', () => fs.readFileSync(new URL('../supabase/migrations/20261028180000_tgu_confirmed_fiscal_prefix.sql', import.meta.url), 'utf8'))
  sql = sql.replaceAll('-- APPLY_RESTORED_TGU_PREFIX_MIGRATION', () => fs.readFileSync(new URL('../supabase/migrations/20261029170000_restore_tgu_registered_cai_prefix.sql', import.meta.url), 'utf8'))
  sql = sql.replace('begin;', `begin;
${file==='demo_production_parity.sql'?'':"set local time zone 'America/Tegucigalpa';"}
update public.platform_environment set dataset_version='atlas-forwarding-demo-v1',dataset_seeded_at=now(),dataset_client_id='10000000-0000-4000-8000-000000000001' where singleton;`)
  if (file === 'invoice_drafts_and_master_review.sql' || file === 'finance_reporting_and_banks.sql' || file.startsWith('cai_') || file === 'tgu_restore_registered_cai_prefix.sql') {
    // The shared finance fixtures must have the same temporary access metadata
    // as real Demo accounts. No production authorization function is replaced.
    sql = sql.replace('set local role authenticated;', `
update public.profiles set is_demo_user=true,demo_expires_at=now()+interval '1 day',demo_access_grant_id='de280000-0000-4000-8000-000000000099'
where id::text like '${file==='tgu_restore_registered_cai_prefix.sql' ? 'ce290000' : file.startsWith('cai_') ? 'ca280000' : file === 'finance_reporting_and_banks.sql' ? 'be280000' : 'dd280000'}-%';
set local role authenticated;`)
    sql = sql.replaceAll('"role":"authenticated"','"role":"authenticated","app_metadata":{"demo_access_grant_id":"de280000-0000-4000-8000-000000000099"}')
  }
  const r = spawnSync('docker', ['exec', '-i', 'supabase_db_sarierp', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
  if (r.error || r.status !== 0) { console.error(`FAIL ${file}`, r.error?.message || r.stderr); process.exit(1) }
  console.log(`PASS ${file}`)
}
