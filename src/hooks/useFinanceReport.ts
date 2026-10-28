'use client'
import { useEffect, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import { validateFinanceDates, type FinanceDocument, type FinanceMovement, type FinanceSide } from '@/src/lib/finance-report'
import type { ClientOption } from '@/src/lib/client-search'

export function useFinanceReport(side: FinanceSide, cutoff: string, revision: number) {
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}:${side}:${cutoff}:${revision}`
  const [result,setResult]=useState<{context:string;documents:FinanceDocument[];movements:FinanceMovement[];parties:ClientOption[];coverage:string;legacy:boolean;error:string}|null>(null)
  useEffect(()=>{
    let active=true
    const timer=setTimeout(()=>{void (async()=>{
      try{
        validateFinanceDates(cutoff)
        const coverage=await supabase.from('finance_history_coverage').select('starts_on,has_legacy').maybeSingle()
        if(coverage.error)throw new Error('No se pudo consultar la cobertura histórica. Verifica que la migración de reportes esté aplicada.')
        if(coverage.data?.has_legacy&&cutoff<coverage.data.starts_on)throw new Error(`El historial verificable comienza el ${coverage.data.starts_on.split('-').reverse().join('/')}. No se puede certificar un corte anterior.`)
        const read=async<T,>(rpc:string,a:number,b:number)=>{
          const response=await supabase.rpc(rpc,{p_side:side,p_cutoff:cutoff}).range(a,b)
          if(response.error)throw new Error(response.error.message)
          return {data:response.data as T[],error:null}
        }
        const [documents,movements,parties]=await Promise.all([
          readAllReportRows<FinanceDocument>((a,b)=>read('finance_documents_at',a,b),{label:'documentos al corte',isCurrent:()=>active}),
          readAllReportRows<FinanceMovement>((a,b)=>read('finance_movements_at',a,b),{label:'movimientos al corte',isCurrent:()=>active}),
          readAllReportRows<ClientOption>((a,b)=>supabase.from(side==='receivable'?'clientes':'proveedores').select(side==='receivable'?'id,nombre,codigo_cliente,rtn':'id,nombre,rtn').returns<ClientOption[]>().order('nombre').order('id').range(a,b),{label:side==='receivable'?'clientes':'proveedores',isCurrent:()=>active}),
        ])
        if(active)setResult({context,documents,movements,parties,coverage:coverage.data?.starts_on||'',legacy:!!coverage.data?.has_legacy,error:''})
      }catch(e){if(active)setResult({context,documents:[],movements:[],parties:[],coverage:'',legacy:false,error:e instanceof Error?e.message:'No se pudo preparar el reporte.'})}
    })()},0)
    return()=>{active=false;clearTimeout(timer)}
  },[context,side,cutoff])
  return result?.context===context?{...result,loading:false}:{documents:[],movements:[],parties:[],coverage:'',legacy:false,error:'',loading:true}
}
