'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { ListTree } from 'lucide-react'
import { accountKinds,accountLevels,canParentAccount,canPostAccount,parseAccountCsv,type AccountLevel,type AccountingAccount,type ImportedAccount } from '@/src/lib/accounting'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass } from '@/src/lib/ui-classes'

const empty={code:'',name:'',kind:'Activo' as AccountingAccount['kind'],parent_id:null as string|null,postable:true,active:true,account_level:null as AccountLevel|null}
export default function AccountingAccountsPage(){
 const {context,data,error,loading,reload,isCurrent}=useAccounting()
 const [editor,setEditor]=useState<{context:string;form:typeof empty & {id?:string}}|null>(null),[csv,setCsv]=useState<{context:string;rows:ImportedAccount[]}|null>(null)
 const [busy,setBusy]=useState(false),lock=useRef(false),[filter,setFilter]=useState(''),[page,setPage]=useState(0)
 const form=editor?.context===context?editor.form:null,preview=csv?.context===context?csv.rows:null
 const filtered=data?.accounts.filter(a=>(a.code+' '+a.name).toLowerCase().includes(filter.toLowerCase()))||[],pages=Math.max(1,Math.ceil(filtered.length/50)),currentPage=Math.min(page,pages-1)
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
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Catálogo de cuentas" description="Estructura del catálogo, cuentas auxiliares que reciben movimientos e importación controlada." icon={ListTree}/><AccountingNav/>
  {error&&<p role="alert" className="text-red-600">{error} <button onClick={()=>void reload()}>Reintentar</button></p>}{loading&&<p>Cargando catálogo…</p>}
  {data&&<><div className="flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={busy} onClick={()=>setEditor({context,form:{...empty}})}>Nueva cuenta</button><label className={secondaryButtonClass}>Importar CSV<input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value=''}}/></label></div>
  <p className="max-w-3xl text-sm text-slate-500">CSV: codigo,nombre,tipo,padre,movimiento y, opcionalmente, nivel. Naturalezas: {accountKinds.join(', ')}. Movimiento: Sí/No. Incluye las cuentas padre antes de las hijas; los códigos existentes se rechazan. La importación no carga saldos.</p>
  {preview&&<section className={`${cardClass} space-y-2`}><h2 className="font-semibold">Revisar {preview.length} cuentas antes de importar</h2><p className="text-sm text-slate-500">{preview.filter(a=>a.postable).length} de movimiento · {preview.filter(a=>!a.postable).length} sin movimiento</p><div className="max-h-64 overflow-auto">{preview.map(a=><p key={a.code} className="text-sm">{a.code} · {a.name} · {a.kind}{a.account_level?` · ${a.account_level}`:''} · {a.postable?'Movimiento':'Sin movimiento'}{a.parent_code?` · Padre ${a.parent_code}`:''}</p>)}</div><div className="flex gap-2"><button disabled={busy} className={primaryButtonClass} onClick={()=>void save(true)}>Confirmar importación</button><button disabled={busy} className={secondaryButtonClass} onClick={()=>setCsv(null)}>Cancelar</button></div></section>}
  {form&&<form className={cardClass} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-semibold">{form.id?'Editar cuenta':'Nueva cuenta'}</legend>
    <label>Código<input required className={fieldClass} maxLength={40} value={form.code} onChange={e=>setEditor({context,form:{...form,code:e.target.value}})}/></label><label>Nombre<input required className={fieldClass} maxLength={160} value={form.name} onChange={e=>setEditor({context,form:{...form,name:e.target.value}})}/></label>
    <label>Naturaleza<CompactSelect aria-label="Naturaleza de la cuenta" value={form.kind} className="max-w-md" options={accountKinds.map(k=>({value:k,label:k}))} onValueChange={value=>{const kind=value as AccountingAccount['kind'];setEditor({context,form:{...form,kind,parent_id:null,postable:form.postable&&canPostAccount(kind,form.account_level)}})}}/></label>
    <label>Cuenta padre<CompactSelect aria-label="Cuenta padre" value={form.parent_id||''} className="max-w-md" searchable options={[{value:'',label:'Sin padre'},...data.accounts.filter(a=>canParentAccount(a,form.kind)&&a.id!==form.id).map(a=>({value:a.id,label:`${a.code} · ${a.name}`,description:a.kind}))]} onValueChange={value=>setEditor({context,form:{...form,parent_id:value||null}})}/></label>
    <label>Nivel<CompactSelect aria-label="Nivel de la cuenta" value={form.account_level||''} className="max-w-md" options={[{value:'',label:'Sin nivel definido'},...accountLevels.map(level=>({value:level,label:level}))]} onValueChange={value=>{const account_level=(value||null) as AccountLevel|null;setEditor({context,form:{...form,account_level,postable:form.postable&&canPostAccount(form.kind,account_level)}})}}/></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={form.postable} disabled={!canPostAccount(form.kind,form.account_level)} onChange={e=>setEditor({context,form:{...form,postable:e.target.checked}})}/>Recibe movimientos</label><label className="flex gap-2"><input type="checkbox" checked={form.active} onChange={e=>setEditor({context,form:{...form,active:e.target.checked}})}/>Activa</label>
    <div className="flex gap-2"><button className={primaryButtonClass}>Guardar</button><button type="button" className={secondaryButtonClass} onClick={()=>setEditor(null)}>Cancelar</button></div></fieldset></form>}
  <section className={`${cardClass} space-y-3`}><label className="block max-w-lg">Buscar por código o nombre<input className={fieldClass} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0)}}/></label><div className="max-h-[65vh] overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Código</th><th>Nombre</th><th>Naturaleza</th><th>Nivel</th><th>Uso</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{filtered.slice(currentPage*50,currentPage*50+50).map(a=><tr key={a.id} className="border-t"><td className="p-2">{a.code}</td><td className="p-2">{a.name}</td><td>{a.kind}</td><td>{a.account_level||'—'}</td><td>{a.postable?'Movimiento':'Sin movimiento'}</td><td>{a.active?'Activa':'Inactiva'}</td><td><button className="text-[#B3282D] underline underline-offset-4 dark:text-rose-300" disabled={busy} onClick={()=>setEditor({context,form:{...a,account_level:a.account_level??null}})}>Editar</button></td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{filtered.length} cuentas · Página {currentPage+1} de {pages}</span><div className="flex gap-3"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</button><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Siguiente</button></div></div>{!!data.accounts.length&&!filtered.length&&<p>No hay cuentas que coincidan con la búsqueda.</p>}{!data.accounts.length&&<p>El catálogo está vacío. Ingresa cuentas o importa el catálogo aprobado por Contabilidad.</p>}</section></>}
 </div>
}
