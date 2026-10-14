// Fixtures ficticios con commit: ejecutar solo contra el stack aislado indicado.
// Las filas quedan en ese volumen; no se borran movimientos financieros.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const container = 'supabase_db_sarierp_aud01'
const args = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
const tenant = '00000000-0000-4000-8000-000000000001'
const user = randomUUID()
const supplier = randomUUID()
const accounts = Array.from({ length: 5 }, () => randomUUID())
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
  connection.child.stdin.end(command)
  const result = await connection.done
  assert.equal(result.code, 0, result.stderr)
  return result.stdout.trim()
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, message) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await check()) return
    await pause(50)
  }
  throw new Error(message)
}
const payment = (account, key, amount = 60) => `select public.register_supplier_payment('${account}','${key}',${amount},'USD',(now() at time zone 'America/Tegucigalpa')::date,'Transferencia');`
const adjustment = (account, key) => `select public.register_supplier_adjustment('${account}','${key}','NC','AUD-02 concurrent',60);`
const resultJson = output => output.split(/\r?\n/).filter(line => line.startsWith('{"status"')).map(line => JSON.parse(line))[0]

// No URL ni credenciales remotas; la migracion debe existir en este contenedor.
assert.equal(await sql("select count(*) from supabase_migrations.schema_migrations where version='20261013130000';"), '1')
await sql(`begin;
  insert into auth.users(id,aud,role,email,raw_user_meta_data) values('${user}','authenticated','authenticated','aud02-${user}@test.local','{}');
  update public.profiles set rol='Finanzas',status='Aprobado',is_active=true,tenant_id='${tenant}' where id='${user}';
  insert into public.proveedores(id,nombre,tipo,tenant_id) values('${supplier}','AUD-02 concurrencia','Otro','${tenant}');
  insert into public.cuentas_pagar(id,proveedor_id,descripcion,monto,tipo,tenant_id)
  values ${accounts.map(id => `('${id}','${supplier}','AUD-02 concurrencia',100,'AP','${tenant}')`).join(',')};
commit;`)

async function race(firstCommand, secondCommand, succeeds) {
  const first = session()
  const second = session()
  const application = `aud02-${randomUUID()}`
  try {
    first.child.stdin.write(`begin; ${claims} ${firstCommand}\nselect 'AUD02_LOCK_HELD';\n`)
    await until(() => first.output().includes('AUD02_LOCK_HELD'), 'La primera conexion no adquirio el lock')
    second.child.stdin.end(`set application_name='${application}'; begin; ${claims} ${secondCommand} commit;`)
    // Comprueba espera real por lock; no depende de una demora estimada.
    await until(async () => (await sql(`select count(*) from pg_stat_activity where application_name='${application}' and wait_event_type='Lock';`)) === '1', 'La segunda conexion no espero el lock de cuenta')
    first.child.stdin.end('commit;\n')
    const [a, b] = await Promise.all([first.done, second.done])
    assert.equal(a.code, 0, a.stderr)
    if (succeeds) assert.equal(b.code, 0, b.stderr)
    else {
      assert.notEqual(b.code, 0)
      assert.match(b.stderr, /23514:/)
    }
    return [resultJson(a.stdout), resultJson(b.stdout)]
  } finally {
    first.child.kill()
    second.child.kill()
  }
}

await race(payment(accounts[0], randomUUID()), payment(accounts[0], randomUUID()), false)
assert.equal(await sql(`select count(*)||':'||sum(monto) from public.pagos_proveedor where cuenta_pagar_id='${accounts[0]}' and status='Aplicado';`), '1:60.00')
assert.equal(await sql(`select status from public.cuentas_pagar where id='${accounts[0]}';`), 'Parcialmente Pagada')
console.log('PASS: pagos 60 + 60 sobre AP100, segundo bloqueado y rechazado; aplicado60')

const key = randomUUID()
const [original, replay] = await race(payment(accounts[1], key), payment(accounts[1], key), true)
assert.equal(original.payment_id, replay.payment_id)
assert.equal(replay.already_applied, true)
assert.equal(await sql(`select count(*) from public.pagos_proveedor where cuenta_pagar_id='${accounts[1]}';`), '1')
console.log('PASS: dos conexiones con misma clave confirman un solo pago')

await race(payment(accounts[2], randomUUID()), adjustment(accounts[2], randomUUID()), false)
assert.equal(await sql(`select count(*) from public.cuentas_pagar where parent_ap_id='${accounts[2]}';`), '0')
console.log('PASS: pago60 versus NC60, NC rechazada con saldo actualizado40')

await race(adjustment(accounts[3], randomUUID()), payment(accounts[3], randomUUID()), false)
assert.equal(await sql(`select count(*) from public.pagos_proveedor where cuenta_pagar_id='${accounts[3]}';`), '0')
console.log('PASS: NC60 versus pago60, pago rechazado con obligacion actualizada40')

await race(`select public.cancel_supplier_payable('${accounts[4]}','AUD-02 cancel concurrent');`, payment(accounts[4], randomUUID()), false)
assert.equal(await sql(`select count(*) from public.pagos_proveedor where cuenta_pagar_id='${accounts[4]}';`), '0')
console.log('PASS: anulacion versus pago, pago espera y rechaza cuenta anulada')
console.log('AUD-02: 5 carreras comprobadas; fixtures retenidos solo en el stack aislado')
