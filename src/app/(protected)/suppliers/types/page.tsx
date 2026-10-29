'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Pencil, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useSupplierTypes, SUPPLIER_TYPES_UPDATED, type SupplierType } from '@/src/hooks/useSupplierTypes'
import { useInvoiceMaster } from '@/src/hooks/useInvoiceMaster'
import { supabase } from '@/src/lib/supabase/client'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { NumberInput } from '@/src/components/ui/NumberInput'
import { Pagination } from '@/src/components/ui/Pagination'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

const empty = { code:'', label:'', order:'100', active:true }
export default function SupplierTypesPage() {
  const catalog=useSupplierTypes(), {isMaster}=useInvoiceMaster()
  const [editing,setEditing]=useState<SupplierType|null>(null)
  const [form,setForm]=useState(empty),[saving,setSaving]=useState(false)
  const [search,setSearch]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(25)
  const rows=catalog.types.filter(t=>`${t.code} ${t.label}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
  const currentPage=Math.min(page,Math.max(1,Math.ceil(rows.length/pageSize)))
  function reset(){setEditing(null);setForm(empty)}
  async function persist(type:SupplierType|null,values:typeof empty,clearForm=false){
    if(!isMaster||saving)return
    const order=Number(values.order)
    if(!values.code.trim()||!values.label.trim()||values.order===''||!Number.isInteger(order)||order<0||order>100000){toast.error('Completa nombre, código y orden válido.');return}
    setSaving(true)
    try {
      const {error}=await supabase.rpc('save_supplier_type',{p_id:type?.id||null,p_revision:type?.revision||0,
        p_code:values.code.trim(),p_label:values.label.trim(),p_active:values.active,p_sort_order:order})
      if(error)throw error
      window.dispatchEvent(new Event(SUPPLIER_TYPES_UPDATED))
      toast.success('Tipo de proveedor guardado.')
      if(clearForm)reset()
    }catch(error){toast.error(error instanceof Error?error.message:(error as {message?:string})?.message||'No se pudo guardar el tipo.')}finally{setSaving(false)}
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Tipos de proveedores</h1>
      <p className="mt-1 text-sm text-slate-500">Catálogo de esta empresa para clasificar proveedores.</p></div>
      <Link href="/suppliers" className={secondaryButtonClass}>Ver proveedores</Link></header>
    {isMaster&&<section className={cardClass}><FormSection title={editing?'Editar tipo':'Nuevo tipo'} description="El código identifica el tipo y permanece fijo. El nombre puede actualizarse.">
      <form onSubmit={e=>{e.preventDefault();void persist(editing,form,true)}} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Código" required><input required maxLength={80} disabled={Boolean(editing)||saving} value={form.code} onChange={e=>setForm(p=>({...p,code:e.target.value}))} className={fieldClass} placeholder="Ej. servicios_generales"/></FormField>
          <FormField label="Nombre" required><input required maxLength={100} disabled={saving} value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} className={fieldClass} placeholder="Ej. Servicios generales"/></FormField>
          <FormField label="Orden"><NumberInput min={0} max={100000} step={1} value={form.order} onChange={e=>setForm(p=>({...p,order:e.target.value}))} className={fieldClass}/></FormField>
        </div>
        <div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/>Activo</label>
          <button type="submit" disabled={saving||catalog.loading||Boolean(catalog.error)} className={primaryButtonClass}><Plus size={16}/>{saving?'Guardando…':'Guardar tipo'}</button>
          {editing&&<button type="button" onClick={reset} className={secondaryButtonClass}>Cancelar edición</button>}</div>
      </form></FormSection></section>}
    <section className={`${cardClass} !p-0`}><div className="flex flex-wrap items-end gap-3 p-5"><FormField label="Buscar tipos" className="max-w-md flex-1"><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} className={fieldClass} placeholder="Nombre o código"/></FormField>
      <button type="button" onClick={catalog.reload} className={secondaryButtonClass}><RotateCcw size={16}/>Actualizar</button></div>
      {catalog.error&&<p role="alert" className="px-5 pb-4 text-sm text-rose-600">{catalog.error}</p>}
      {catalog.loading?<p role="status" className="p-5 text-sm text-slate-500">Cargando tipos…</p>:<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-y border-slate-100 text-left text-xs text-slate-500">{['Nombre','Código','Orden','Activo',''].map(c=><th key={c} className="px-5 py-3">{c}</th>)}</tr></thead>
        <tbody>{rows.slice((currentPage-1)*pageSize,currentPage*pageSize).map(t=><tr key={t.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-5 py-4 font-medium">{t.label}</td><td className="px-5 py-4 text-slate-500">{t.code}</td><td className="px-5 py-4">{t.sort_order}</td><td className="px-5 py-4"><button type="button" role="switch" aria-checked={t.active} aria-label={`${t.active?'Desactivar':'Activar'} ${t.label}`} disabled={!isMaster||saving} onClick={()=>void persist(t,{code:t.code,label:t.label,order:String(t.sort_order),active:!t.active})} className={`flex h-6 w-11 items-center rounded-full p-0.5 disabled:opacity-50 ${t.active?'bg-[#B3282D]':'bg-slate-300 dark:bg-slate-700'}`}><span className={`h-5 w-5 rounded-full bg-white transition-transform ${t.active?'translate-x-5':''}`}/></button></td>
          <td className="px-5 py-4">{isMaster&&<button type="button" disabled={saving} aria-label={`Editar ${t.label}`} onClick={()=>{setEditing(t);setForm({code:t.code,label:t.label,order:String(t.sort_order),active:t.active})}} className="rounded-lg border border-slate-200 p-2"><Pencil size={16}/></button>}</td></tr>)}</tbody></table>
        {!rows.length&&<p className="p-5 text-sm text-slate-500">No hay tipos para estos filtros.</p>}</div>}
      <Pagination page={currentPage} pageSize={pageSize} total={rows.length} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1)}}/>
    </section>
    <p className="text-xs text-slate-500">Admin y el máster de Contabilidad administran este catálogo. Desactivar un tipo impide nuevas asignaciones; sus proveedores actuales conservan su clasificación. Los cambios quedan registrados.</p>
  </div>
}
