// Fictional fixtures, exclusively the named isolated Docker/PostgREST stack.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID, createHmac } from 'node:crypto'

const tenant='00000000-0000-4000-8000-000000000001', users=Array.from({length:4},()=>randomUUID())
const clients=[randomUUID(),randomUUID()], packages=Array.from({length:6},()=>randomUUID()), keys=Array.from({length:5},()=>randomUUID())
const args=['exec','-i','supabase_db_sarierp_aud01','psql','-U','postgres','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
function session(){
  const child=spawn('docker',args,{windowsHide:true});let out='',err=''
  child.stdout.on('data',data=>{out+=data});child.stderr.on('data',data=>{err+=data})
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}))})
  return {child,done,output:()=>out}
}
async function sql(command){const c=session();c.child.stdin.end(command,'utf8');const r=await c.done;assert.equal(r.code,0,r.err);return r.out.trim()}
async function until(check,message){const end=Date.now()+15000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,50))}throw Error(message)}
const claims=index=>`set local role authenticated;select set_config('request.jwt.claims','{"sub":"${users[index]}","role":"authenticated"}',true);`
const report=(n,key,user=0)=>`select public.report_miami_incident('${packages[n]}','Otro','AUD11 concurrent report','${keys[key]}','${users[user]}');`
const deliver=n=>`select public.advance_miami_package_status('${packages[n]}','Entregado','AUD11 delivery race');`
async function race(firstSql,secondSql,{firstUser=0,secondUser=0,error}={}){
  const first=session(),second=session(),application=`aud11-${randomUUID()}`
  try{
    first.child.stdin.write(`begin;set local statement_timeout='15s';${claims(firstUser)}${firstSql} select 'AUD11_LOCK_HELD';\n`)
    await until(()=>first.output().includes('AUD11_LOCK_HELD'),'First transaction did not hold its locks')
    second.child.stdin.end(`set application_name='${application}';begin;set local statement_timeout='15s';${claims(secondUser)}${secondSql}commit;`)
    await until(async()=>await sql(`select count(*) from pg_stat_activity where application_name='${application}' and wait_event_type='Lock';`)==='1','Second session did not actually wait for a lock')
    first.child.stdin.end('commit;\n')
    const [a,b]=await Promise.all([first.done,second.done]);assert.equal(a.code,0,a.err)
    if(error){assert.notEqual(b.code,0);assert.match(b.err,new RegExp(error+':'))}else assert.equal(b.code,0,b.err)
    return [a,b]
  }finally{first.child.kill();second.child.kill()}
}
assert.equal(await sql("select count(*) from supabase_migrations.schema_migrations where version='20261014152000';"),'1')
try{
  await sql(`begin;
    insert into auth.users(id,aud,role,email,raw_user_meta_data) values ${users.map(id=>`('${id}','authenticated','authenticated','aud11-${id}@example.invalid','{}')`).join(',')};
    insert into public.clientes(id,nombre,tenant_id) values ${clients.map(id=>`('${id}','AUD11 concurrent','${tenant}')`).join(',')};
    update public.profiles set rol='Cliente',status='Aprobado',is_active=true,tenant_id='${tenant}',cliente_id='${clients[0]}' where id in ('${users[0]}','${users[1]}');
    update public.profiles set rol='Operaciones',status='Aprobado',is_active=true,tenant_id='${tenant}' where id='${users[2]}';
    update public.profiles set rol='Cliente',status='Aprobado',is_active=true,tenant_id='${tenant}',cliente_id='${clients[1]}' where id='${users[3]}';
    insert into public.miami_packages(id,tracking_number,tenant_id,cliente_id,status,cargo_status)
    values ${packages.map((id,n)=>`('${id}','AUD11-${id}','${tenant}','${clients[0]}','Asignado','${[2,3].includes(n)?'Llegado Honduras':'Recibido en Miami'}')`).join(',')};
    commit;`)
  const [,replay]=await race(report(0,0),report(0,0))
  assert.match(replay.out, /"already_applied": true/)
  assert.equal(await sql(`select count(*) from public.miami_incidencias where package_id='${packages[0]}';`),'1')
  console.log('PASS same request race: real lock wait, one case and replay')
  await race(report(1,1),report(1,2,1),{secondUser:1,error:'PT409'})
  assert.equal(await sql(`select count(*) from public.miami_incidencias where package_id='${packages[1]}';`),'1')
  console.log('PASS two portal accounts, different keys: one active case, explicit conflict')
  await race(deliver(2),report(2,3),{firstUser:2,error:'PT409'})
  assert.equal(await sql(`select count(*) from public.miami_incidencias where package_id='${packages[2]}';`),'0')
  assert.equal(await sql(`select status from public.miami_packages where id='${packages[2]}';`),'Entregado')
  console.log('PASS delivery first: reporting waits and never overwrites delivered package')
  await race(report(3,4),deliver(3),{secondUser:2})
  assert.equal(await sql(`select status from public.miami_packages where id='${packages[3]}';`),'Entregado')
  assert.equal(await sql(`select count(*) from public.miami_incidencias where package_id='${packages[3]}';`),'1')
  console.log('PASS report first: later valid delivery remains delivered; case preserved')
  await race(report(0,0),report(4,0),{error:'22023'})
  assert.equal(await sql(`select count(*) from public.miami_incidencias where package_id='${packages[4]}';`),'0')
  console.log('PASS same key with different package: serialized, rejected without second case')

  const segment=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const jwt=(role,sub)=>{
    const body=segment({alg:'HS256',typ:'JWT'})+'.'+segment({role,sub,iss:'supabase',exp:Math.floor(Date.now()/1000)+3600})
    return body+'.'+createHmac('sha256','super-secret-jwt-token-with-at-least-32-characters-long').update(body).digest('base64url')
  }
  const anon=jwt('anon')
  async function request(path,method='GET',body,user=0){
    const response=await fetch('http://127.0.0.1:57521/rest/v1/'+path,{
      method,signal:AbortSignal.timeout(15000),headers:{apikey:anon,Authorization:'Bearer '+jwt('authenticated',users[user]),'Content-Type':'application/json',Prefer:'return=representation'},
      ...(body?{body:JSON.stringify(body)}:{}),
    });return {status:response.status,data:await response.json()}
  }
  const payload={p_package_id:packages[5],p_tipo:'Otro',p_descripcion:'AUD11 API report',p_request_key:randomUUID(),p_expected_user_id:users[0]}
  let response=await request('rpc/report_miami_incident','POST',{...payload,p_expected_user_id:users[1]})
  assert.equal(response.status,403);assert.equal(response.data.code,'42501')
  response=await request('rpc/report_miami_incident','POST',payload)
  assert.equal(response.status,200);assert.equal(Array.isArray(response.data),false)
  assert.equal(response.data.package_status,'Con incidencia');const id=response.data.incident_id
  response=await request('rpc/report_miami_incident','POST',payload)
  assert.equal(response.data.incident_id,id);assert.equal(response.data.already_applied,true)
  response=await request('miami_incidencias','POST',{package_id:packages[5],cliente_id:clients[0],tipo:'Otro',descripcion:'Direct'})
  assert.equal(response.status,403);assert.equal(response.data.code,'42501')
  response=await request('miami_incidencias?select=id&id=eq.'+id)
  assert.equal(response.status,200);assert.equal(response.data.length,1)
  response=await request('miami_incidencias?select=id&id=eq.'+id,'GET',null,3)
  assert.equal(response.status,200);assert.equal(response.data.length,0)
  assert.equal(await sql(`select count(*) from public.miami_package_events where event_type='incident_reported' and package_id in ('${packages.join("','")}');`),'4')
  console.log('PASS authenticated PostgREST: bound session, confirmed receipt/replay, direct write denied, real client RLS')
}finally{
  await sql(`begin;
    delete from public.miami_incidencias where package_id in ('${packages.join("','")}');
    delete from public.miami_packages where id in ('${packages.join("','")}');
    delete from public.activity_logs where user_id in ('${users.join("','")}');
    delete from public.clientes where id in ('${clients.join("','")}');
    delete from auth.users where id in ('${users.join("','")}');
    commit;`)
}
