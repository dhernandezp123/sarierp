'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { ListTree, Pencil, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { accountKinds,accountLevels,canParentAccount,canPostAccount,parseAccountCsv,type AccountLevel,type AccountingAccount,type ImportedAccount } from '@/src/lib/accounting'
import { Badge } from '@/src/components/ui/badge'
import { FormField } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass,fieldLabelClass } from '@/src/lib/ui-classes'

const empty={code:'',name:'',kind:'Activo' as AccountingAccount['kind'],parent_id:null as string|null,postable:true,active:true,account_level:null as AccountLevel|null}
export default function AccountingAccountsPage(){
 const {context,data,error,loading,reload,isCurrent}=useAccounting()
 const [editor,setEditor]=useState<{context:string;form:typeof empty & {id?:string}}|null>(null),[csv,setCsv]=useState<{context:string;rows:ImportedAccount[]}|null>(null)
 const [busy,setBusy]=useState(false),lock=useRef(false),[filter,setFilter]=useState(''),[statusFilter,setStatusFilter]=useState('all'),[page,setPage]=useState(0)
 const formRef=useRef<HTMLFormElement>(null),codeRef=useRef<HTMLInputElement>(null),[opened,setOpened]=useState(0)
 const [confirmEdit,setConfirmEdit]=useState(false),[deleting,setDeleting]=useState<AccountingAccount|null>(null)
 const form=editor?.context===context?editor.form:null,preview=csv?.context===context?csv.rows:null
 const filtered=data?.accounts.filter(a=>(statusFilter==='all'||a.active===(statusFilter==='active'))&&(a.code+' '+a.name).toLowerCase().includes(filter.toLowerCase()))||[],pages=Math.max(1,Math.ceil(filtered.length/50)),currentPage=Math.min(page,pages-1)
 // El formulario se abre arriba de la tabla: llevar la vista y el foco hasta él.
 useEffect(()=>{if(!opened)return;formRef.current?.scrollIntoView({behavior:'smooth',block:'start'});codeRef.current?.focus({preventScroll:true})},[opened])
 function openEditor(next:typeof empty & {id?:string}){setEditor({context,form:next});setOpened(n=>n+1)}
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
 async function remove(account:AccountingAccount){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{
   const {error}=await supabase.rpc('delete_accounting_account',{p_account_id:account.id})
   if(error)throw error
   if(isCurrent()){toast.success(`Cuenta ${account.code} eliminada.`);if(form?.id===account.id)setEditor(null);await reload()}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo eliminar la cuenta.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function read(file:File|undefined){
  if(!file)return
  if(file.size>2*1024*1024){toast.error('Usa un archivo CSV de hasta 2 MB.');return}
  try{const rows=parseAccountCsv(await file.text());if(isCurrent())setCsv({context,rows})}catch(e){toast.error((e as Error).message)}
 }
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Catálogo de cuentas" description="Estructura del catálogo, cuentas auxiliares que reciben movimientos e importación controlada." icon={ListTree}/><AccountingNav/>
  {error&&<p role="alert" className="text-red-600">{error} <button onClick={()=>void reload()}>Reintentar</button></p>}{loading&&<p>Cargando catálogo…</p>}
  {data&&<><div className="flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={busy} onClick={()=>openEditor({...empty})}>Nueva cuenta</button><label className={secondaryButtonClass}>Importar CSV<input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={e=>{void read(e.target.files?.[0]);e.target.value=''}}/></label></div>
  <p className="max-w-3xl text-sm text-slate-500">CSV: codigo,nombre,tipo,padre,movimiento y, opcionalmente, nivel. Naturalezas: {accountKinds.join(', ')}. Movimiento: Sí/No. Incluye las cuentas padre antes de las hijas; los códigos existentes se rechazan. La importación no carga saldos.</p>
  {preview&&<section className={`${cardClass} space-y-2`}><h2 className="font-semibold">Revisar {preview.length} cuentas antes de importar</h2><p className="text-sm text-slate-500">{preview.filter(a=>a.postable).length} de movimiento · {preview.filter(a=>!a.postable).length} sin movimiento</p><div className="max-h-64 overflow-auto">{preview.map(a=><p key={a.code} className="text-sm">{a.code} · {a.name} · {a.kind}{a.account_level?` · ${a.account_level}`:''} · {a.postable?'Movimiento':'Sin movimiento'}{a.parent_code?` · Padre ${a.parent_code}`:''}</p>)}</div><div className="flex gap-2"><button disabled={busy} className={primaryButtonClass} onClick={()=>void save(true)}>Confirmar importación</button><button disabled={busy} className={secondaryButtonClass} onClick={()=>setCsv(null)}>Cancelar</button></div></section>}
  {form&&<form ref={formRef} className={`${cardClass} scroll-mt-6 ring-2 ring-[#B3282D]/30`} onSubmit={e=>{e.preventDefault();if(form.id)setConfirmEdit(true);else void save()}}><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-semibold">{form.id?`Editar cuenta ${form.code}`:'Nueva cuenta'}</legend>
    <label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Código</span><input ref={codeRef} required className={fieldClass} maxLength={40} value={form.code} onChange={e=>setEditor({context,form:{...form,code:e.target.value}})}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Nombre</span><input required className={fieldClass} maxLength={160} value={form.name} onChange={e=>setEditor({context,form:{...form,name:e.target.value}})}/></label>
    <label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Naturaleza</span><CompactSelect aria-label="Naturaleza de la cuenta" value={form.kind} className="max-w-md" options={accountKinds.map(k=>({value:k,label:k}))} onValueChange={value=>{const kind=value as AccountingAccount['kind'];setEditor({context,form:{...form,kind,parent_id:null,postable:form.postable&&canPostAccount(kind,form.account_level)}})}}/></label>
    <label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Cuenta padre</span><CompactSelect aria-label="Cuenta padre" value={form.parent_id||''} className="max-w-md" searchable options={[{value:'',label:'Sin padre'},...data.accounts.filter(a=>canParentAccount(a,form.kind)&&a.id!==form.id).map(a=>({value:a.id,label:`${a.code} · ${a.name}`,description:a.kind}))]} onValueChange={value=>setEditor({context,form:{...form,parent_id:value||null}})}/></label>
    <label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Nivel</span><CompactSelect aria-label="Nivel de la cuenta" value={form.account_level||''} className="max-w-md" options={[{value:'',label:'Sin nivel definido'},...accountLevels.map(level=>({value:level,label:level}))]} onValueChange={value=>{const account_level=(value||null) as AccountLevel|null;setEditor({context,form:{...form,account_level,postable:form.postable&&canPostAccount(form.kind,account_level)}})}}/></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={form.postable} disabled={!canPostAccount(form.kind,form.account_level)} onChange={e=>setEditor({context,form:{...form,postable:e.target.checked}})}/>Recibe movimientos</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={e=>setEditor({context,form:{...form,active:e.target.checked}})}/>Activa</label>
    <div className="flex gap-2"><button className={primaryButtonClass}>Guardar</button><button type="button" className={secondaryButtonClass} onClick={()=>setEditor(null)}>Cancelar</button></div></fieldset></form>}
  <section className={`${cardClass} space-y-3`}><div className="grid items-end gap-3 sm:grid-cols-[minmax(0,32rem)_minmax(0,14rem)]"><label className="flex min-w-0 flex-col gap-1.5 max-w-lg"><span className={fieldLabelClass}>Buscar por código o nombre</span><input className={fieldClass} value={filter} onChange={e=>{setFilter(e.target.value);setPage(0)}}/></label><FormField as="div" label="Estado"><CompactSelect aria-label="Filtrar cuentas por estado" value={statusFilter} options={[{value:'all',label:'Todas'},{value:'active',label:'Activas'},{value:'inactive',label:'Inactivas'}]} onValueChange={value=>{setStatusFilter(value);setPage(0)}}/></FormField></div><div className="max-h-[65vh] overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Código</th><th>Nombre</th><th>Naturaleza</th><th>Nivel</th><th>Uso</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{filtered.slice(currentPage*50,currentPage*50+50).map(a=><tr key={a.id} className={`border-t ${form?.id===a.id?'bg-rose-50 dark:bg-rose-950/30':''}`}><td className="p-2">{a.code}</td><td className="p-2">{a.name}</td><td>{a.kind}</td><td>{a.account_level||'—'}</td><td>{a.postable?'Movimiento':'Sin movimiento'}</td><td><Badge className={a.active?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'}>{a.active?'Activa':'Inactiva'}</Badge></td><td><div className="flex items-center gap-1"><button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[#B3282D] hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40" disabled={busy} aria-current={form?.id===a.id||undefined} onClick={()=>openEditor({...a,account_level:a.account_level??null})}><Pencil className="h-3.5 w-3.5" aria-hidden/>{form?.id===a.id?'Editando':'Editar'}</button><button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40" disabled={busy} title={`Eliminar cuenta ${a.code}`} aria-label={`Eliminar cuenta ${a.code}`} onClick={()=>setDeleting(a)}><Trash2 className="h-4 w-4" aria-hidden/></button></div></td></tr>)}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><span>{filtered.length} cuentas · Página {currentPage+1} de {pages}</span><div className="flex gap-3"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</button><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Siguiente</button></div></div>{!!data.accounts.length&&!filtered.length&&<p>No hay cuentas que coincidan con la búsqueda.</p>}{!data.accounts.length&&<p>El catálogo está vacío. Ingresa cuentas o importa el catálogo aprobado por Contabilidad.</p>}</section>
  <ConfirmDialog open={confirmEdit&&!!form?.id} onOpenChange={setConfirmEdit} title={`¿Guardar cambios en la cuenta ${form?.code||''}?`} description="Los cambios se aplican al catálogo de inmediato y afectan los reportes y asientos que usan esta cuenta." confirmLabel="Guardar cambios" onConfirm={()=>void save()}/>
  <ConfirmDialog open={!!deleting} onOpenChange={open=>{if(!open)setDeleting(null)}} danger title={`¿Eliminar la cuenta ${deleting?.code||''}?`} description={`${deleting?.name||''}. Solo se eliminan cuentas sin hijas, movimientos ni asignaciones; si la cuenta ya se usó, desactívala. Esta acción no se puede deshacer.`} confirmLabel="Eliminar cuenta" onConfirm={()=>{if(deleting)void remove(deleting)}}/></>}
 </div>
}
