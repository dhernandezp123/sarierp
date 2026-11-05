'use client'
import {useEffect,useState} from 'react'
import {useParams} from 'next/navigation'
import {useUser} from '@/src/hooks/useUser'
import {supabase} from '@/src/lib/supabase/client'
import {PortalCard,PortalPageHeader} from '@/src/components/portal/PortalUI'
import {formatDate,formatMoney} from '@/src/lib/format'
type Balance={invoice_number:string;issue_date:string;due_date:string;currency:string;total:number;balance:number;status:string}
export default function PortalInvoicePage(){
 const {id}=useParams<{id:string}>(),{user,profile}=useUser(),key=`${user?.id}:${profile?.tenant_id}:${id}`
 const [state,setState]=useState<{key:string;data:Balance|null;error:string}|null>(null),[refresh,setRefresh]=useState(0)
 useEffect(()=>{let active=true;void Promise.resolve(supabase.rpc('get_portal_invoice_balance',{p_invoice:id})).then(({data,error})=>{if(active)setState({key,data:error?null:data,error:error?'Este documento no está disponible.': ''})}).catch(()=>{if(active)setState({key,data:null,error:'No se pudo consultar el saldo. Reintenta.'})});return()=>{active=false}},[id,key,refresh])
 const current=state?.key===key?state:null,d=current?.data
 return <div className="space-y-5"><PortalPageHeader title="Detalle de factura" subtitle="Saldo actualizado de tu documento."/><PortalCard>{!current?<p role="status">Consultando documento…</p>:current.error?<p role="alert">{current.error}</p>:d&&<dl className="grid gap-4 sm:grid-cols-2">{[['Factura',d.invoice_number],['Emisión',formatDate(d.issue_date)],['Vencimiento',formatDate(d.due_date)],['Estado',d.status],['Total',formatMoney(Number(d.total),d.currency)],['Saldo pendiente',formatMoney(Number(d.balance),d.currency)]].map(([label,value])=><div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>}<button className="mt-4 text-blue-700 underline" onClick={()=>{setState(null);setRefresh(n=>n+1)}}>Actualizar saldo</button></PortalCard></div>
}
