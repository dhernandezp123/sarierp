'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'

export type SupplierType = { id:string; code:string; label:string; active:boolean; sort_order:number; revision:number }
export const SUPPLIER_TYPES_UPDATED = 'supplier-types-updated'
export function useSupplierTypes() {
  const { user, profile } = useUser()
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const enabled = Boolean(user && profile?.tenant_id)
  const [version,setVersion] = useState(0)
  const [result,setResult] = useState<{context:string;types:SupplierType[];error:string|null}|null>(null)
  useEffect(() => {
    const reload = () => setVersion(v=>v+1)
    window.addEventListener(SUPPLIER_TYPES_UPDATED,reload)
    window.addEventListener('focus',reload)
    return () => {window.removeEventListener(SUPPLIER_TYPES_UPDATED,reload);window.removeEventListener('focus',reload)}
  },[])
  useEffect(() => {
    if(!enabled)return
    let current=true
    void readAllReportRows<SupplierType>((from,to)=>supabase.from('supplier_types')
      .select('id,code,label,active,sort_order,revision').order('sort_order').order('label').order('id').range(from,to),
      {label:'tipos de proveedores',isCurrent:()=>current})
      .then(types=>{if(current)setResult({context,types,error:null})},()=>{if(current)setResult({context,types:[],error:'No se pudo cargar el catálogo de tipos de proveedores.'})})
    return ()=>{current=false}
  },[context,enabled,version])
  const current=result?.context===context?result:null
  const types=current?.types||[]
  return {types,loading:enabled&&!current,error:current?.error||null,reload:()=>setVersion(v=>v+1),label:(code:string)=>types.find(t=>t.code===code)?.label||code}
}
