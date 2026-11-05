'use client'
import {useEffect,useState} from 'react'
import {supabase} from '@/src/lib/supabase/client'
import type {InvoiceCourtesy} from '@/src/lib/invoice-courtesies'
export function useInvoiceCourtesies(draftId:string|null|undefined,revision:number,context:string){
 const key=`${context}:${draftId}:${revision}`
 const [snapshot,setSnapshot]=useState<{key:string;rows:InvoiceCourtesy[];error:string}|null>(null),[refresh,setRefresh]=useState(0)
 useEffect(()=>{
  if(!draftId)return
  let active=true,sequence=0
  async function load(){
   const run=++sequence
   try{
    const rows:InvoiceCourtesy[]=[],seen=new Set<string>();let total=Infinity
    while(rows.length<total){
     const {data,error}=await supabase.rpc('get_invoice_courtesies',{p_draft_id:draftId,p_offset:rows.length,p_limit:100})
     if(!active||run!==sequence)return
     if(error||!Array.isArray(data?.requests)||!Number.isSafeInteger(data.total)||data.total<0)throw new Error('No se pudieron consultar las cortesías.')
     total=data.total
     if(!data.requests.length&&rows.length<total)throw new Error('La lista de cortesías cambió. Actualiza para continuar.')
     for(const row of data.requests as InvoiceCourtesy[]){if(!row.id||seen.has(row.id))throw new Error('La lista de cortesías cambió.');seen.add(row.id);rows.push(row)}
    }
    if(active&&run===sequence)setSnapshot({key,rows,error:''})
   }catch(e){if(active&&run===sequence)setSnapshot({key,rows:[],error:(e as Error).message})}
  }
  void load();const timer=setInterval(()=>{if(typeof document!=='undefined'&&document.visibilityState==='visible')void load()},30000)
  return()=>{active=false;clearInterval(timer)}
 },[draftId,key,refresh])
 const current=snapshot?.key===key?snapshot:null
 return {rows:current?.rows||[],error:current?.error||'',loading:Boolean(draftId&&!current),reload:()=>setRefresh(n=>n+1)}
}
