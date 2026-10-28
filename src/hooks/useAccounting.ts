'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import type { AccountingAccount, AccountingPeriod } from '@/src/lib/accounting'
type Data={accounts:AccountingAccount[];periods:AccountingPeriod[];automatic:boolean;start:string;mappings:Record<string,string>}
export function useAccounting() {
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`
  const owner=useRef(context),version=useRef(0)
  const [state,setState]=useState<{context:string;data:Data|null;error:string}>({context:'',data:null,error:''})
  const [loading,setLoading]=useState(true)
  useEffect(()=>{owner.current=context;return()=>{owner.current=''}},[context])
  const reload=useCallback(async()=>{
    const run=++version.current,isCurrent=()=>owner.current===context&&run===version.current
    setLoading(true)
    try {
      const [accounts,periods,settings,mappings]=await Promise.all([
        readAllReportRows<AccountingAccount>((a,b)=>supabase.from('accounting_accounts').select('*').order('code').order('id').range(a,b),{label:'cuentas contables',isCurrent}),
        readAllReportRows<AccountingPeriod>((a,b)=>supabase.from('accounting_periods').select('*').order('starts_on',{ascending:false}).order('id').range(a,b),{label:'períodos',isCurrent}),
        supabase.from('accounting_settings').select('automatic_posting,starts_on').maybeSingle(),supabase.from('accounting_mappings').select('purpose,account_id'),
      ])
      if(settings.error||mappings.error)throw new Error('No se pudo cargar la configuración contable.')
      if(isCurrent())setState({context,error:'',data:{accounts,periods,automatic:settings.data?.automatic_posting||false,start:settings.data?.starts_on||'',mappings:Object.fromEntries((mappings.data||[]).map(m=>[m.purpose,m.account_id]))}})
    }catch(e){if(isCurrent())setState({context,data:null,error:e instanceof Error?e.message:'No se pudo cargar Contabilidad.'})}
    finally{if(isCurrent())setLoading(false)}
  },[context])
  useEffect(()=>{const timer=setTimeout(()=>void reload(),0);return()=>clearTimeout(timer)},[reload])
  const current=state.context===context?state:null
  const isCurrent=useCallback(()=>owner.current===context,[context])
  return {context,data:current?.data||null,error:current?.error||'',loading:loading||!current,reload,isCurrent}
}
