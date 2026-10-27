'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { accountKinds,parseAccountCsv,type AccountingAccount,type ImportedAccount } from '@/src/lib/accounting'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass } from '@/src/lib/ui-classes'

const empty={code:'',name:'',kind:'Activo' as AccountingAccount['kind'],parent_id:null as string|null,postable:true,active:true}
export default function AccountingAccountsPage(){
 const {context,data,error,loading,reload,isCurrent}=useAccounting()
 const [editor,setEditor]=useState<{context:string;form:typeof empty & {id?:string}}|null>(null),[csv,setCsv]=useState<{context:string;rows:ImportedAccount[]}|null>(null)
 const [busy,setBusy]=useState(false),lock=useRef(false),[filter,setFilter]=useState('')
 const form=editor?.context===context?editor.form:null,preview=csv?.context===context?csv.rows:null
 async function save(importing=false){
  if(lock.current||(!form&&!importing))return
  lock.current=true;setBusy(true)
  try{
   const {error}=importing?await supabase.rpc('import_accounting_accounts',{p_accounts:preview}):await supabase.rpc('save_accounting_account',{p_account:form})
   if(error)throw error
   if(isCurrent()){toast.success(importing?'Catálogo importado.':'Cuenta guardada.');setEditor(null);setCsv(null);await reload()}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo guardar el catálogo.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function read(file:File|undefined){
  if(!file)return
  if(file.size>2*1024*1024){toast.error('Usa un archivo CSV de hasta 2 MB.');return}
  try{const rows=parseAccountCsv(await file.text());if(isCurrent())setCsv({context,rows})}catch(e){toast.error((e as Error).message)}
 }
 return <div className="space-y-5 p-4 sm:p-6"><h1 className="text-2xl font-bold">Catálogo de cuentas</h1><AccountingNav/>
  {error&&<p role="alert" className="text-red-600">{error} <button onClick={()=>void reload()}>Reintentar</button></p>}{loading&&<p>Cargando catálogo…</p>}
  {data&&<><div className="flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={busy} onClick={()=>setEditor({context,form:{...empty}})}>Nueva cuenta</button><label className={secondaryButtonClass}>Importar CSV<input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value=''}}/></label></div>
  <p className="text-sm text-slate-500">Importación: columnas codigo,nombre,tipo,padre,movimiento. Tipos: Activo, Pasivo, Patrimonio, Ingreso, Gasto. Movimiento: Sí/No. Incluye las cuentas padre antes de las hijas; los códigos existentes se rechazan. No importa saldos.</p>
  {preview&&<section className={`${cardClass} space-y-2`}><h2 className="font-semibold">Revisar {preview.length} cuentas antes de importar</h2><div className="max-h-64 overflow-auto">{preview.map(a=><p key={a.code} className="text-sm">{a.code} · {a.name} · {a.kind} · {a.postable?'Movimiento':'Agrupadora'}{a.parent_code?` · Padre ${a.parent_code}`:''}</p>)}</div><div className="flex gap-2"><button disabled={busy} className={primaryButtonClass} onClick={()=>void save(true)}>Confirmar importación</button><button disabled={busy} className={secondaryButtonClass} onClick={()=>setCsv(null)}>Cancelar</button></div></section>}
  {form&&<form className={cardClass} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-semibold">{form.id?'Editar cuenta':'Nueva cuenta'}</legend>
    <label>Código<input required className={fieldClass} maxLength={40} value={form.code} onChange={e=>setEditor({context,form:{...form,code:e.target.value}})}/></label><label>Nombre<input required className={fieldClass} maxLength={160} value={form.name} onChange={e=>setEditor({context,form:{...form,name:e.target.value}})}/></label>
    <label>Tipo<select className={fieldClass} value={form.kind} onChange={e=>setEditor({context,form:{...form,kind:e.target.value as AccountingAccount['kind'],parent_id:null}})}>{accountKinds.map(k=><option key={k}>{k}</option>)}</select></label>
    <label>Cuenta padre<select className={fieldClass} value={form.parent_id||''} onChange={e=>setEditor({context,form:{...form,parent_id:e.target.value||null}})}><option value="">Sin padre</option>{data.accounts.filter(a=>!a.postable&&a.kind===form.kind&&a.id!==form.id).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
    <label className="flex gap-2"><input type="checkbox" checked={form.postable} onChange={e=>setEditor({context,form:{...form,postable:e.target.checked}})}/>Recibe movimientos</label><label className="flex gap-2"><input type="checkbox" checked={form.active} onChange={e=>setEditor({context,form:{...form,active:e.target.checked}})}/>Activa</label>
    <div className="flex gap-2"><button className={primaryButtonClass}>Guardar</button><button type="button" className={secondaryButtonClass} onClick={()=>setEditor(null)}>Cancelar</button></div></fieldset></form>}
  <section className={`${cardClass} space-y-3`}><label>Buscar por código o nombre<input className={fieldClass} value={filter} onChange={e=>setFilter(e.target.value)}/></label><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Uso</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{data.accounts.filter(a=>(a.code+' '+a.name).toLowerCase().includes(filter.toLowerCase())).map(a=><tr key={a.id} className="border-t"><td className="p-2">{a.code}</td><td className="p-2">{a.name}</td><td>{a.kind}</td><td>{a.postable?'Movimiento':'Agrupadora'}</td><td>{a.active?'Activa':'Inactiva'}</td><td><button className="text-blue-700 underline" disabled={busy} onClick={()=>setEditor({context,form:a})}>Editar</button></td></tr>)}</tbody></table></div>{!data.accounts.length&&<p>El catálogo está vacío. Ingresa cuentas o importa el catálogo aprobado por Contabilidad.</p>}</section></>}
 </div>
}
