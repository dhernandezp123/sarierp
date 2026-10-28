// Fictional committed fixtures; exclusively the named isolated Docker stack.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const args = ['exec', '-i', 'supabase_db_sarierp_aud01', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
const tenant = '00000000-0000-4000-8000-000000000001'
const user = randomUUID()
const customer = randomUUID()
const ids = Array.from({ length: 4 }, () => randomUUID())
const states = ['Borrador', 'Ganada', 'Pendiente de Fijar Precios', 'Pricing Aprobado']
const claims = `set local role authenticated;
  select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);`

function session() {
  const child = spawn('docker', args, { windowsHide: true })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
  return { child, done, output: () => stdout }
}
async function sql(command) {
  const connection = session()
  connection.child.stdin.end(command, 'utf8')
  const result = await connection.done
  assert.equal(result.code, 0, result.stderr)
  return result.stdout.trim()
}
async function until(check, message) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(message)
}
const transition = (id, old, revision, next) =>
  `select (public.transition_quotation('${id}','${old}',${revision},'${next}','AUD05 concurrency')).status;`
assert.equal(await sql("select count(*) from supabase_migrations.schema_migrations where version='20261014121000';"), '1')
await sql(`begin;
  insert into auth.users(id,aud,role,email,raw_user_meta_data) values('${user}','authenticated','authenticated','aud05-${user}@test.local','{}');
  update public.profiles set rol='Admin',status='Aprobado',is_active=true,tenant_id='${tenant}' where id='${user}';
  insert into public.clientes(id,nombre,tenant_id) values('${customer}','AUD05 concurrent','${tenant}');
  insert into public.quotations(id,cliente_id,created_by,status,service_product,tenant_id)
  values ${ids.map((id, i) => `('${id}','${customer}','${user}','${states[i]}','miami_air','${tenant}')`).join(',')};
  insert into public.pricing_items(quotation_id,item_type,description,cost_amount,sale_amount,quantity,tenant_id)
  values ${ids.map(id => `('${id}','Flete','AUD05 concurrent',100,150,1,'${tenant}')`).join(',')};
commit;`)

async function race(firstCommand, secondCommand) {
  const first = session(); const second = session()
  const application = `aud05-${randomUUID()}`
  try {
    first.child.stdin.write(`begin; ${claims} ${firstCommand}\nselect 'AUD05_LOCK_HELD';\n`)
    await until(() => first.output().includes('AUD05_LOCK_HELD'), 'First session did not acquire the quotation lock')
    second.child.stdin.end(`set application_name='${application}'; begin; ${claims} ${secondCommand} commit;`)
    await until(async () => (await sql(`select count(*) from pg_stat_activity where application_name='${application}' and wait_event_type='Lock';`)) === '1', 'Second session did not wait for the actual row lock')
    first.child.stdin.end('commit;\n')
    const [a, b] = await Promise.all([first.done, second.done])
    assert.equal(a.code, 0, a.stderr)
    assert.notEqual(b.code, 0, b.stderr)
    assert.match(b.stderr, /PT409:/)
  } finally { first.child.kill(); second.child.kill() }
}

await race(transition(ids[0], 'Borrador', 0, 'Pendiente de Fijar Precios'), transition(ids[0], 'Borrador', 0, 'Pendiente de Fijar Precios'))
assert.equal(await sql(`select count(*) from public.quotation_status_history where quotation_id='${ids[0]}' and status_revision=1;`), '1')
console.log('PASS: two concurrent requests, one transition and one history row')

await race(transition(ids[1], 'Ganada', 0, 'Pendiente de Fijar Precios') + transition(ids[1], 'Pendiente de Fijar Precios', 1, 'Ganada'), transition(ids[1], 'Ganada', 0, 'Pendiente de Fijar Precios'))
assert.equal(await sql(`select status||':'||status_revision from public.quotations where id='${ids[1]}';`), 'Ganada:2')
assert.equal(await sql(`select count(*) from public.quotation_change_logs where quotation_id='${ids[1]}' and change_type='quotation_reopened_for_repricing';`), '1')
console.log('PASS: status returned to Ganada; stale original revision is rejected')

await race(transition(ids[2], 'Pendiente de Fijar Precios', 0, 'Pricing Aprobado'), `select public.transition_quotation('${ids[2]}','Pendiente de Fijar Precios',0,'Perdida',null,'Tarifa alta');`)
assert.equal(await sql(`select status from public.quotations where id='${ids[2]}';`), 'Pricing Aprobado')
console.log('PASS: approval versus loss, second action rejected without overwriting')

await race(transition(ids[3], 'Pricing Aprobado', 0, 'Pricing Aprobado'), transition(ids[3], 'Pricing Aprobado', 0, 'Pricing Aprobado'))
assert.equal(await sql(`select count(*) from public.quotation_status_history where quotation_id='${ids[3]}' and status_revision is not null;`), '1')
console.log('PASS: concurrent reapprovals also require the expected revision')
