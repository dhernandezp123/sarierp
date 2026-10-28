import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server.js'
import loadTs from './load-ts.mjs'
import { mountPage } from './page-harness.mjs'

const { passwordValidationError, recoveryTokens, recoveryDestination } = loadTs('src/lib/password-recovery.ts')
const tenant = { id: 'tenant-A', hostname: 'sari.forwarders.app' }
const targetId = 'aa170000-0000-4000-8000-000000000001'

async function recoveryRequest({ adminRoute = false, user = { id: 'actor' }, actor = { rol: 'Admin', status: 'Aprobado', is_active: true, tenant_id: tenant.id, is_platform_admin: false }, target = { id: targetId, email: 'person@example.test' }, authEmail = 'person@example.test', environment = true, tenantContext = tenant, providerError = null, auditFailure = false, body, } = {}) {
  const calls = { clients: 0, sent: [], filters: [], audits: [] }
  const service = {
    auth: { admin: { getUserById: async id => { assert.equal(id, target.id); return { data: { user: { id, email: authEmail } }, error: null } } } },
    from(table) {
      const q = { select() { return q }, eq(key, value) { calls.filters.push([key,value]); return q },
        maybeSingle: async () => ({ data: target, error: null }),
        async insert(value) { if (auditFailure) throw Error('Audit offline'); calls.audits.push(value); return { error: null } },
      }
      assert.ok(['profiles','activity_logs'].includes(table))
      return q
    },
  }
  const authQuery = { select() { return authQuery }, eq() { return authQuery }, single: async () => ({ data: actor, error: null }) }
  const { POST } = loadTs(adminRoute ? 'src/app/api/admin/users/password-recovery/route.ts' : 'src/app/api/auth/password-recovery/route.ts', {
    'next/headers': { headers: async () => new Headers() },
    '@/src/lib/tenant-context': { readTenantHeaders: () => tenantContext, profileMatchesTenant: (id,t) => !!t && id === t.id },
    '@/src/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => authQuery }) },
    '@/src/lib/server/password-recovery': {
      recoveryAdminClient() { calls.clients++; return service }, recoveryEnvironmentAllowed: async () => environment,
      async sendRecoveryEmail(email, hostname) { calls.sent.push({ email, hostname }); return { error: providerError } },
    },
  })
  const response = await POST(new Request('https://sari.forwarders.app/api/recovery', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body ?? (adminRoute ? { userId: targetId, email: 'attacker@example.test' } : { email: ' Person@Example.Test ' })) }))
  return { response, body: await response.json(), calls }
}

test('recuperación pública no revela cuentas y limita la consulta a la empresa validada', async () => {
  const known = await recoveryRequest(), unknown = await recoveryRequest({ target: null }), throttled = await recoveryRequest({ providerError: { status:429 } })
  assert.equal(known.response.status,202)
  assert.deepEqual(known.body,unknown.body)
  assert.deepEqual(known.body,throttled.body)
  assert.deepEqual(known.calls.sent,[{ email:'person@example.test',hostname:'sari.forwarders.app' }])
  assert.ok(known.calls.filters.some(([key,value]) => key==='tenant_id' && value===tenant.id))
  assert.equal(unknown.calls.sent.length,0)
  assert.equal(known.response.headers.get('cache-control'),'no-store')
})

test('recuperación pública bloquea Demo, empresas inexistentes, correo inválido y correos Auth desalineados', async () => {
  for (const options of [{environment:false},{tenantContext:null},{body:{email:'invalid'}},{authEmail:'other@example.test'}]) {
    const result = await recoveryRequest(options)
    assert.equal(result.calls.sent.length,0)
  }
})

test('recuperación administrativa exige sesión y Admin activo/aprobado del tenant antes de usar privilegios', async () => {
  for (const options of [
    {user:null},{actor:{rol:'Ventas'}},{actor:{rol:'Admin',status:'Pendiente',is_active:true}},
    {actor:{rol:'Admin',status:'Aprobado',is_active:false}},
    {actor:{rol:'Admin',status:'Aprobado',is_active:true,tenant_id:'tenant-B'}},
    {actor:{rol:'Admin',status:'Aprobado',is_active:true,tenant_id:tenant.id,is_platform_admin:true}},
  ]) {
    const result=await recoveryRequest({adminRoute:true,...options})
    assert.ok([401,403].includes(result.response.status))
    assert.equal(result.calls.clients,0)
    assert.equal(result.calls.sent.length,0)
  }
})

test('Admin envía al correo de Auth y del perfil; no acepta un destinatario ni modifica accesos', async () => {
  const result=await recoveryRequest({adminRoute:true})
  assert.equal(result.response.status,200)
  assert.deepEqual(result.calls.sent,[{email:'person@example.test',hostname:'sari.forwarders.app'}])
  assert.ok(result.calls.filters.some(([key,value])=>key==='tenant_id' && value===tenant.id))
  assert.equal(result.calls.audits[0].entity_id,targetId)
  assert.equal(result.calls.audits[0].action,'request_password_recovery')
  assert.equal(JSON.stringify(result.body).includes('token'),false)
  assert.equal((await recoveryRequest({adminRoute:true,target:null})).response.status,404)
  assert.equal((await recoveryRequest({adminRoute:true,authEmail:'other@example.test'})).response.status,409)
  assert.equal((await recoveryRequest({adminRoute:true,environment:false})).calls.sent.length,0)
})

test('un fallo de auditoría tras envío no anuncia fallo ni induce un reenvío', async () => {
  const result=await recoveryRequest({adminRoute:true,auditFailure:true})
  assert.equal(result.response.status,200)
  assert.equal(result.body.auditWarning,true)
  assert.equal(result.calls.sent.length,1)
})

test('SMTP de recuperación usa flujo independiente y callback existente sin persistir la sesión del Admin', async () => {
  const clients=[],sent=[]
  const { sendRecoveryEmail }=loadTs('src/lib/server/password-recovery.ts',{
    'server-only':{}, './email-environment':{readEmailEnvironment:async()=> 'production'},
    '@supabase/supabase-js':{createClient(_url,_key,options){clients.push(options);return{auth:{resetPasswordForEmail:async(email,options)=>{sent.push({email,options});return{error:null}}}}},},
  })
  await sendRecoveryEmail('person@example.test','sari.forwarders.app')
  assert.equal(clients[0].auth.flowType,'implicit')
  assert.equal(clients[0].auth.persistSession,false)
  assert.equal(sent[0].options.redirectTo,'https://sari.forwarders.app/auth/callback?next=/portal/reset-password')
})

test('callback solo acepta destinos de recuperación y conserva PKCE con validación de empresa', async () => {
  for(const value of ['//evil.test','/portal/../admin/users','/portal/evil','https://evil.test'])assert.equal(recoveryDestination(value),'/reset-password')
  const { GET }=loadTs('src/app/auth/callback/route.ts',{
    'next/headers':{headers:async()=>new Headers()},
    '@/src/lib/tenant-context':{readTenantHeaders:()=>tenant,profileMatchesTenant:(id,t)=>id===t.id},
    '@/src/lib/supabase/server':{createClient:async()=>({auth:{exchangeCodeForSession:async()=>({error:null}),getUser:async()=>({data:{user:{id:targetId}}})},from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{tenant_id:tenant.id,rol:'Ventas'}})};return q}})},
  })
  const pkce=await GET(new NextRequest('https://sari.forwarders.app/auth/callback?code=valid&next=//evil.test'))
  assert.equal(new URL(pkce.headers.get('location')).pathname,'/reset-password')
  assert.equal(new URL(pkce.headers.get('location')).searchParams.get('account'),targetId)
  const implicit=await GET(new NextRequest('https://sari.forwarders.app/auth/callback?next=/portal/reset-password'))
  assert.equal(implicit.headers.get('location'),'https://sari.forwarders.app/reset-password')
})

test('validación de contraseña y tokens rechaza enlaces de otro tipo y errores',()=>{
  assert.equal(passwordValidationError('short','short'),'La contraseña debe tener al menos 8 caracteres.')
  assert.equal(passwordValidationError('password1','password2'),'Las contraseñas no coinciden.')
  assert.equal(passwordValidationError('password1','password1'),null)
  for(const hash of ['','#type=signup&access_token=x&refresh_token=y','#type=recovery&access_token=x','#type=recovery&access_token=x&refresh_token=y&error_code=expired'])assert.equal(recoveryTokens(hash),null)
})

test('formulario real usa sesión aislada del destinatario aunque haya otra cuenta abierta',async()=>{
  const previous=globalThis.window,updates=[],sharedSignouts=[]
  let location=new URL('https://sari.forwarders.app/reset-password#type=recovery&access_token=recovered&refresh_token=refresh')
  globalThis.window={addEventListener(){},removeEventListener(){},get location(){return location},history:{state:null,replaceState(_s,_t,url){location=new URL(url,location)}}}
  const isolated={auth:{setSession:async tokens=>{assert.equal(tokens.access_token,'recovered');return{error:null}},getUser:async()=>({data:{user:{id:targetId}},error:null}),updateUser:async value=>{updates.push(value);return{error:null}},signOut:async()=>({error:null})},from(){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{tenant_id:tenant.id,rol:'Ventas'},error:null})};return q}}
  const page=mountPage('src/components/auth/ResetPasswordPage.tsx',{
    '@/src/components/tenant/TenantProvider':{useTenant:()=>tenant},
    '@supabase/supabase-js':{createClient:()=>isolated},
    '@/src/lib/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'other-admin'}}}}),signOut:async()=>{sharedSignouts.push(true)}}}},
    '@/src/components/portal/PortalFeedback':{PortalError:'error'},
  })
  try{
    await page.ready()
    assert.equal(location.hash,'')
    assert.ok(page.find(n=>n.type==='form'))
    const first=page.find(n=>n.type==='input'&&n.props['aria-label']==='Contraseña (mínimo 8 caracteres)')
    first.props.onChange({target:{value:'new-password'}})
    page.find(n=>n.type==='input'&&n.props['aria-label']==='Confirmar contraseña').props.onChange({target:{value:'new-password'}})
    page.render()
    await page.find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
    assert.deepEqual(updates,[{password:'new-password'}])
    assert.equal(sharedSignouts.length,0)
  }finally{page.cleanup();if(previous===undefined)delete globalThis.window;else globalThis.window=previous}
})

test('un enlace ausente o vencido no permite cambiar la contraseña de una sesión ya abierta',async()=>{
  const previous=globalThis.window
  try{
    for(const suffix of ['', '#error=access_denied&error_code=otp_expired', '?recovery=1']){
      globalThis.window={addEventListener(){},removeEventListener(){},location:new URL('https://sari.forwarders.app/reset-password'+suffix)}
      let clients=0
      const page=mountPage('src/components/auth/ResetPasswordPage.tsx',{
        '@/src/components/tenant/TenantProvider':{useTenant:()=>tenant},
        '@supabase/supabase-js':{createClient:()=>{clients++;throw Error('Must not create recovery session')}},
        '@/src/lib/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'admin'}}}})}}},
        '@/src/components/portal/PortalFeedback':{PortalError:'error'},
      })
      try{await page.ready();assert.equal(page.find(n=>n.type==='form'),undefined);assert.equal(clients,0)}finally{page.cleanup()}
    }
  }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous}
})
