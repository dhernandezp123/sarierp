'use client'
import { createContext,useContext,useEffect,useState,type ReactNode } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { fieldClass } from '@/src/lib/ui-classes'
type Service={code:string;label:string;taxable:boolean}
type Account={id:string;code:string;name:string}
const CatalogContext=createContext<{services:Service[];accounts:Account[];error:string;retry:()=>void}>({services:[],accounts:[],error:'',retry:()=>{}})
export function InvoiceLineSettingsProvider({children}:{children:ReactNode}){
 const {user,profile}=useUser(),identity=`${user?.id}:${profile?.tenant_id}`
 const [state,setState]=useState<{identity:string;services:Service[];accounts:Account[];error:string}|null>(null),[revision,setRevision]=useState(0)
 useEffect(()=>{let current=true
  void Promise.all([
   readAllReportRows<Service>((a,b)=>supabase.from('client_rate_catalog').select('code,label,taxable').eq('active',true).order('code').range(a,b),{label:'catálogo de servicios',key:'code',isCurrent:()=>current}),
   readAllReportRows<Account>((a,b)=>supabase.from('accounting_accounts').select('id,code,name').eq('active',true).eq('postable',true).eq('kind','Ingreso').order('code').range(a,b),{label:'cuentas de ingresos',isCurrent:()=>current}),
  ]).then(([services,accounts])=>{if(current)setState({identity,services,accounts,error:''})}).catch(()=>{if(current)setState({identity,services:[],accounts:[],error:'No se pudo cargar el catálogo de servicios/cuentas.'})})
  return()=>{current=false}
 },[identity,revision])
 const value=state?.identity===identity?state:{services:[],accounts:[],error:''}
 return <CatalogContext.Provider value={{...value,retry:()=>setRevision(n=>n+1)}}>{value.error&&<p role="alert" className="text-sm text-red-600">{value.error} <button type="button" onClick={()=>setRevision(n=>n+1)}>Reintentar</button></p>}{children}</CatalogContext.Provider>
}
export function InvoiceLineSettings({accountId,onAccount,onService,readonlyService=false}:{accountId:string;onAccount:(id:string)=>void;onService:(s:Service)=>void;readonlyService?:boolean}){
 const {accounts,services}=useContext(CatalogContext)
 return <div className="col-span-full grid gap-2 pb-3 sm:grid-cols-2">{!readonlyService&&<label className="text-xs">Servicio de catálogo (opcional)<select className={fieldClass} value="" onChange={e=>{const s=services.find(s=>s.code===e.target.value);if(s)onService(s)}}><option value="">Ingreso manual / seleccionar servicio</option>{services.map(s=><option key={s.code} value={s.code}>{s.label}{s.taxable?' · Gravable':''}</option>)}</select></label>}
 <label className="text-xs">Cuenta de ingreso<select className={fieldClass} value={accountId} onChange={e=>onAccount(e.target.value)}><option value="">Cuenta predeterminada de Contabilidad</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label></div>
}
