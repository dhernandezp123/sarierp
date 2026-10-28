// Fictional fixtures and a mocked provider; only the named isolated local stack.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID, createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import loadTs from '../tests/load-ts.mjs'

const container = 'supabase_db_sarierp_aud01'
const tenant = '00000000-0000-4000-8000-000000000001'
const user = randomUUID(), pkg = randomUUID(), ticket = randomUUID()
function sql(command) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
    { input: command, encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20261014140000';"), '1')
// Standard isolated CLI development JWT; no remote credential or env file is read.
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const jwt = encoded({ alg: 'HS256', typ: 'JWT' }) + '.' + encoded({ role: 'service_role', iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600 })
const token = jwt + '.' + createHmac('sha256', 'super-secret-jwt-token-with-at-least-32-characters-long').update(jwt).digest('base64url')
const originalFetch = globalThis.fetch
let barrier, reads = 0, providerCalls = [], accepted = new Map()
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  if (url.origin === 'https://api.resend.com') {
    assert.equal(url.pathname, '/emails')
    providerCalls.push(options)
    const key = options.headers['Idempotency-Key']
    if (!accepted.has(key)) accepted.set(key, { id: randomUUID(), body: options.body })
    assert.equal(accepted.get(key).body, options.body, 'Replay bytes must match')
    return Response.json({ id: accepted.get(key).id })
  }
  assert.equal(url.origin, 'http://127.0.0.1:57521', 'No external network permitted')
  const response = await originalFetch(input, options)
  if (barrier && (options.method ?? 'GET') === 'GET' && /email_deliveries|notification_outbox/.test(url.pathname)) {
    reads++
    if (reads === 2) barrier.release()
    await barrier.promise
  }
  return response
}
const admin = createClient('http://127.0.0.1:57521', token, { auth: { persistSession: false, autoRefreshToken: false } })
const { deliverEmail } = loadTs('src/lib/server/email-delivery.ts', { 'server-only': {} })
async function race(options) {
  reads = 0
  let release
  const promise = new Promise(resolve => { release = resolve })
  barrier = { promise, release }
  try {
    const results = await Promise.all([deliverEmail(admin, options), deliverEmail(admin, options)])
    assert.equal(reads, 2, 'Both requests read the same state')
    assert.equal(results.filter(result => result.body.sent === true).length, 1)
    assert.equal(results.filter(result => result.body.inProgress === true).length, 1)
    return results
  } finally { barrier = null }
}
try {
  sql(`begin;
    insert into auth.users(id,aud,role,email,raw_user_meta_data) values('${user}','authenticated','authenticated','aud08-${user}@example.invalid','{}');
    update public.profiles set rol='Admin',status='Aprobado',is_active=true,tenant_id='${tenant}' where id='${user}';
    insert into public.miami_packages(id,tracking_number,tenant_id) values('${pkg}','AUD08-${pkg}','${tenant}');
    insert into public.support_tickets(id,ticket_number,subject,category,created_by,tenant_id) values('${ticket}','AUD08-${ticket}','AUD08 concurrency','Consulta','${user}','${tenant}');
    commit;`)
  for (const kind of ['miami', 'support']) {
    providerCalls = []; accepted = new Map()
    const table = kind === 'miami' ? 'client_email_deliveries' : 'support_notification_outbox'
    const identity = kind === 'miami' ? { package_id: pkg, event_type: 'miami_package_assigned' } : { idempotency_key: `aud08/${ticket}` }
    const values = kind === 'miami' ? { recipient_email: 'original@example.invalid' }
      : { ticket_id: ticket, message_id: null, event_type: 'ticket_created', recipient_email: 'original@example.invalid' }
    const options = { table, tenantId: tenant, identity, values, key: `aud08/${kind}`, apiKey: 'mock-only',
      request: { from: 'sender@example.invalid', to: ['original@example.invalid'], subject: 'AUD08 fake', text: 'Test only' } }
    await race(options)
    assert.equal(providerCalls.length, 1)
    const { data: delivery, error } = await admin.from(table).select('*').eq('tenant_id', tenant).match(identity).single()
    assert.equal(error, null)
    assert.equal(delivery.attempts, 1)
    const oldToken = randomUUID()
    sql(`update public.${table} set status='processing',updated_at=clock_timestamp()-interval '3 minutes',lease_token='${oldToken}' where id='${delivery.id}';`)
    options.request.to = ['changed@example.invalid']
    options.values.recipient_email = 'changed@example.invalid'
    await race(options)
    assert.equal(providerCalls.length, 2)
    assert.equal(accepted.size, 1, 'Provider mock accepted only one unique email')
    assert.equal(providerCalls[0].body, providerCalls[1].body)
    assert.equal(sql(`select attempts from public.${table} where id='${delivery.id}';`), '2')
    assert.equal(sql(`with late as (update public.${table} set status='failed' where id='${delivery.id}' and status='processing' and lease_token='${oldToken}' returning id) select count(*) from late;`), '0')
    // Simulate acceptance followed by audit failure, then recover the same provider result.
    sql(`update public.${table} set status='processing',updated_at=clock_timestamp()-interval '3 minutes' where id='${delivery.id}';
      create function public.aud08_block_finalization() returns trigger language plpgsql as $$ begin
        if new.id='${delivery.id}'::uuid and new.status='sent' then raise exception 'AUD08 injected audit failure'; end if; return new; end $$;
      create trigger aud08_block_finalization before update on public.${table} for each row execute function public.aud08_block_finalization();`)
    try {
      const failed = await deliverEmail(admin, options)
      assert.equal(failed.body.sent, undefined)
      assert.equal(failed.body.uncertain, true)
      assert.equal(failed.status, 503)
    } finally {
      sql(`drop trigger aud08_block_finalization on public.${table}; drop function public.aud08_block_finalization();`)
    }
    sql(`update public.${table} set updated_at=clock_timestamp()-interval '3 minutes' where id='${delivery.id}';`)
    const recovered = await deliverEmail(admin, options)
    assert.equal(recovered.body.sent, true)
    assert.equal(accepted.size, 1)
    assert.equal(sql(`select attempts from public.${table} where id='${delivery.id}';`), '4')
    console.log(`PASS ${kind}: unique insert race, stale CAS race, frozen replay, fenced writer, audit failure/recovery; one mocked accepted email`)
  }
} finally {
  globalThis.fetch = originalFetch
  sql(`begin;
    delete from public.miami_packages where id='${pkg}';
    delete from public.support_tickets where id='${ticket}';
    delete from auth.users where id='${user}';
    commit;`)
}
