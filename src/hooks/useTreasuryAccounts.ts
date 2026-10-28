'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
export type TreasuryAccount={id:string;name:string;kind:'Banco'|'Caja';bank:string;account_number:string;currency:string;opening_date:string;opening_amount:number;opening_rate:number;gl_account_id:string|null;opening_counter_id:string|null}
export function useTreasuryAccounts(revision=0){
 const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}:${revision}`
 const [state,setState]=useState<{context:string;accounts:TreasuryAccount[];error:string}|null>(null)
 useEffect(()=>{let active=true;const timer=setTimeout(()=>{void readAllReportRows<TreasuryAccount>((a,b)=>supabase.from('treasury_accounts').select('*').order('name').order('id').range(a,b),{label:'cuentas bancarias/cajas',isCurrent:()=>active}).then(accounts=>{if(active)setState({context,accounts,error:''})}).catch(()=>{if(active)setState({context,accounts:[],error:'No se pudieron cargar las cuentas bancarias/cajas.'})})},0);return()=>{active=false;clearTimeout(timer)}},[context])
 return state?.context===context?{...state,loading:false}:{accounts:[],error:'',loading:true}
}
