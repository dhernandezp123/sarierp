'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {useUser} from '@/src/hooks/useUser'
import {supabase} from '@/src/lib/supabase/client'
import {Pagination} from '@/src/components/ui/Pagination'
import {cardClass,secondaryButtonClass} from '@/src/lib/ui-classes'
type Row={kind:'ready'|'due'|'courtesy'|'inactive';entity_id:string;stage:string;title:string;body:string;href:string}
export function AccountingAlertsPanel(){
 const {user,profile}=useUser()
 if(!user||!['Admin','Contabilidad','Finanzas','Operaciones','Ventas','Pricing'].includes(profile?.rol||''))return null
 return <Panel key={`${user.id}:${profile?.tenant_id}:${profile?.rol}`}/>
}
function Panel(){
 const [state,setState]=useState<{rows:Row[];total:number}|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(25),[refresh,setRefresh]=useState(0)
 useEffect(()=>{let active=true;void Promise.resolve(supabase.rpc('get_accounting_alerts',{p_offset:(page-1)*size,p_limit:size})).then(({data,error})=>{
  if(!active)return
  if(error||!Array.isArray(data?.rows)||!Number.isSafeInteger(data.total)){setError('No se pudieron consultar los avisos contables.');setState(null);return}
  setState(data);setError('')
 }).catch(()=>{if(active){setError('No se pudieron consultar los avisos contables.');setState(null)}});return()=>{active=false}},[page,size,refresh])
 return <section className={`${cardClass} space-y-4`} aria-label="Alertas contables y seguimiento"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Alertas contables y seguimiento</h2><p className="text-sm text-slate-500">Embarques listos, vencimientos, cortesías y clientes sin actividad. Se comprueba su estado al consultar.</p></div><button className={secondaryButtonClass} onClick={()=>{setState(null);setRefresh(v=>v+1)}}>Actualizar avisos</button></div>
 {error?<p role="alert" className="text-red-600">{error}</p>:!state?<p role="status">Consultando avisos…</p>:<>{state.rows.map(r=><article key={`${r.kind}:${r.entity_id}:${r.stage}`} className="rounded-xl border p-3"><Link className="font-semibold text-[#B3282D] underline dark:text-rose-300" href={r.href}>{r.title}</Link><p className="mt-1 text-sm">{r.body}</p></article>)}{!state.rows.length&&<p>Sin avisos pendientes.</p>}<Pagination page={page} pageSize={size} total={state.total} onPageChange={p=>{setPage(p);setState(null)}} onPageSizeChange={s=>{setSize(s);setPage(1);setState(null)}}/></>}
 </section>
}
