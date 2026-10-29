'use client'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import type { SupplierType } from '@/src/hooks/useSupplierTypes'

export function SupplierTypeSelect({types,value,onChange,loading,error,filter=false}:{
  types:SupplierType[];value:string;onChange:(value:string)=>void;loading:boolean;error:string|null;filter?:boolean
}) {
  const options=types.filter(t=>filter||t.active||t.code===value).map(t=>({value:t.code,label:t.label+(t.active?'':' (inactivo)'),disabled:!filter&&!t.active}))
  if(value&&!options.some(t=>t.value===value))options.push({value,label:value,disabled:true})
  return <div className="min-w-0"><CompactSelect aria-label="Tipo de proveedor" searchable value={value} disabled={loading||Boolean(error)}
    onValueChange={onChange} options={[{value:'',label:filter?'Todos los tipos':'Selecciona un tipo'},...options]}/>
    {error&&<p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}
  </div>
}
