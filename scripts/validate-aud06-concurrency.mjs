// Fictional committed fixtures, exclusively the named isolated Docker stack.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const args = ['exec', '-i', 'supabase_db_sarierp_aud01', 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
const tenant = '00000000-0000-4000-8000-000000000001'
const users = Array.from({ length: 4 }, () => randomUUID())
const clients = [randomUUID(), randomUUID()]
const manifests = [randomUUID(), randomUUID()]
const packages = Array.from({ length: 3 }, () => randomUUID())
const alert = randomUUID(), tracking = ('AUD06-' + randomUUID()).toUpperCase()
const claims = user => `set local role authenticated; select set_config('request.jwt.claims','{"sub":"${user}","role":"authenticated"}',true);`

function session() {
  const child = spawn('docker', args, { windowsHide: true })
  let stdout = ''; let stderr = ''
  child.stdout.on('data', data => { stdout += data })
  child.stderr.on('data', data => { stderr += data })
  const done = new Promise((resolve, reject) => {
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }))
  })
  return { child, done, output: () => stdout }
}
async function sql(command) {
  const connection = session(); connection.child.stdin.end(command, 'utf8')
  const result = await connection.done; assert.equal(result.code, 0, result.stderr)
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
const assign = (index, client) => `select (public.assign_miami_package('${packages[index]}','${clients[client]}','${manifests[index === 2 ? 1 : 0]}')).warehouse_number;`
assert.equal(await sql("select count(*) from supabase_migrations.schema_migrations where version='20261014130000';"), '1')
await sql(`begin;
  insert into auth.users(id,aud,role,email,raw_user_meta_data)
  values ${users.map(id => `('${id}','authenticated','authenticated','aud06-${id}@test.local','{}')`).join(',')};
  update public.profiles set rol='Operaciones',status='Aprobado',is_active=true,tenant_id='${tenant}' where id in ('${users[0]}','${users[1]}');
  update public.profiles set rol='Admin' where id='${users[0]}';
  insert into public.clientes(id,nombre,tenant_id) values ${clients.map(id => `('${id}','AUD06 concurrent','${tenant}')`).join(',')};
  update public.profiles set rol='Cliente',status='Aprobado',is_active=true,tenant_id='${tenant}',cliente_id='${clients[0]}' where id='${users[2]}';
  update public.profiles set rol='Cliente',status='Aprobado',is_active=true,tenant_id='${tenant}',cliente_id='${clients[1]}' where id='${users[3]}';
  insert into public.miami_manifests(id,manifest_number,carrier,received_by,tenant_id)
  values ${manifests.map(id => `('${id}','AUD06-${id}','AUD06 carrier','${users[0]}','${tenant}')`).join(',')};
  insert into public.miami_packages(id,tracking_number,manifest_id,tenant_id)
  values ${packages.map((id, n) => `('${id}','AUD06-${id}','${manifests[n === 2 ? 1 : 0]}','${tenant}')`).join(',')};
  insert into public.miami_pre_alerts(id,tracking_number,cliente_id,tenant_id) values('${alert}','${tracking}','${clients[0]}','${tenant}');
commit;`)

async function race(firstCommand, secondCommand, expected = 'PT409', secondUser = users[1]) {
  const first = session(), second = session(), application = `aud06-${randomUUID()}`
  try {
    first.child.stdin.write(`begin; ${claims(users[0])} ${firstCommand}\nselect 'AUD06_LOCK_HELD';\n`)
    await until(() => first.output().includes('AUD06_LOCK_HELD'), 'First session did not complete while holding locks')
    second.child.stdin.end(`set application_name='${application}'; begin; ${claims(secondUser)} ${secondCommand} commit;`)
    await until(async () => (await sql(`select count(*) from pg_stat_activity where application_name='${application}' and wait_event_type='Lock';`)) === '1', 'Second action did not wait for the actual lock')
    first.child.stdin.end('commit;\n')
    const [a, b] = await Promise.all([first.done, second.done])
    assert.equal(a.code, 0, a.stderr); assert.notEqual(b.code, 0, b.stderr)
    assert.match(b.stderr, new RegExp(expected + ':'))
  } finally { first.child.kill(); second.child.kill() }
}
await race(assign(0, 0), assign(0, 1))
assert.equal(await sql(`select cliente_id from public.miami_packages where id='${packages[0]}';`), clients[0])
assert.equal(await sql(`select count(*) from public.miami_package_events where package_id='${packages[0]}' and event_type='assignment';`), '1')
assert.equal(await sql(`select count(*) from public.client_notifications where entity_id='${packages[0]}' and profile_id='${users[3]}';`), '0')
console.log('PASS: different clients race; one owner/WH/event, no losing-client notification')

await race(assign(1, 0), assign(1, 0))
assert.equal(await sql(`select count(*) from public.client_notifications where entity_id='${packages[1]}';`), '1')
console.log('PASS: same-client retry races; no duplicate event or portal notification')

await race(assign(2, 0), `select public.delete_miami_manifest('${manifests[1]}','AUD06 concurrent deletion');`, '23514', users[0])
assert.equal(await sql(`select count(*) from public.miami_packages where id='${packages[2]}';`), '1')
console.log('PASS: manifest deletion waits and rejects a committed assignment')

const first = session(), second = session()
try {
  first.child.stdin.write(`begin; ${claims(users[0])} select (public.receive_miami_package('{"tracking_number":"${tracking}"}')).status;\nselect 'AUD06_ALERT_HELD';\n`)
  await until(() => first.output().includes('AUD06_ALERT_HELD'), 'First receipt did not lock the pre-alert')
  second.child.stdin.end(`begin; ${claims(users[1])} select (public.receive_miami_package('{"tracking_number":"${tracking}"}')).status; commit;`)
  let finished = false
  second.done.then(() => { finished = true })
  await until(() => finished, 'Second receipt did not skip the claimed pre-alert')
  const b = await second.done; assert.equal(b.code, 0, b.stderr); assert.match(b.stdout, /Sin asignar/)
  first.child.stdin.end('commit;\n'); const a = await first.done; assert.equal(a.code, 0, a.stderr)
  assert.equal(await sql(`select count(*) from public.miami_packages where tracking_number='${tracking}' and status='Asignado';`), '1')
  assert.equal(await sql(`select count(*) from public.miami_packages where tracking_number='${tracking}';`), '2')
  assert.equal(await sql(`select count(*) from public.client_notifications where entity_id=(select matched_package_id from public.miami_pre_alerts where id='${alert}');`), '1')
  console.log('PASS: concurrent receipts consume one pre-alert once; second package remains unassigned')
} finally { first.child.kill(); second.child.kill() }
