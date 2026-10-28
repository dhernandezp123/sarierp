import test from 'node:test'
import assert from 'node:assert/strict'
import { mountPage } from './page-harness.mjs'

test('una invitación con nombre y aprobación exige crear contraseña y precarga los datos del Admin', async () => {
  let callback
  const routes=[]
  const profile={nombre:'María José',apellido:'Pérez López',status:'Aprobado',rol:'Ventas',tenant_id:'tenant'}
  const query={select(){return query},eq(){return query},single:async()=>({data:profile,error:null})}
  const page=mountPage('src/app/onboarding/page.tsx',{
    'next/navigation':{useRouter:()=>({push:path=>routes.push(path)})},
    '@/src/components/tenant/TenantBrand':{TenantBrand:'TenantBrand'},
    '@/src/lib/supabase/client':{supabase:{from:()=>query,auth:{onAuthStateChange:cb=>{callback=cb;return{data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null})}}},
  })
  try {
    await page.ready()
    const result=callback('SIGNED_IN',{user:{id:'invited',user_metadata:{invited_by_admin:true}}})
    await result;await page.tick();page.render()
    assert.deepEqual(routes,[],'a prefilled name must not skip password creation')
    assert.equal(page.find(n=>n.type==='input'&&n.props.placeholder==='Nombre').props.value,'María José')
    assert.equal(page.find(n=>n.type==='input'&&n.props.placeholder==='Apellido').props.value,'Pérez López')
    assert.ok(page.find(n=>n.type==='input'&&n.props.type==='password'))
    assert.equal(result,undefined,'Auth event callback must not await SDK requests while holding its auth lock')
    page.find(n=>n.type==='input'&&n.props.placeholder==='Nombre').props.onChange({target:{value:'María corregida'}})
    page.render()
    callback('USER_UPDATED',{user:{id:'invited',user_metadata:{invited_by_admin:true}}})
    await page.tick();page.render()
    assert.equal(page.find(n=>n.type==='input'&&n.props.placeholder==='Nombre').props.value,'María corregida')
  } finally {page.cleanup()}
})
