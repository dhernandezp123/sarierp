'use client'
import { InvoiceMasterSettings } from '@/src/components/invoicing/InvoiceMasterSettings'
import { BillingOfficeAccessSettings } from '@/src/components/invoicing/BillingOfficeAccessSettings'
import { useRef,useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { accountingPurposes,type AccountingPeriod } from '@/src/lib/accounting'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { formatDate } from '@/src/lib/format'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass } from '@/src/lib/ui-classes'
export default function AccountingSettingsPage(){
 const {context,data,error,loading,reload,isCurrent}=useAccounting(),lock=useRef(false)
 const [draft,setDraft]=useState<{context:string;automatic:boolean;start:string;mappings:Record<string,string>}|null>(null)
 const [busy,setBusy]=useState(false),[start,setStart]=useState(''),[end,setEnd]=useState(''),[closing,setClosing]=useState<AccountingPeriod|null>(null)
 const form=draft?.context===context?draft:data
 async function save(){
  if(lock.current||!form)return
  lock.current=true;setBusy(true)
  try{const {error}=await supabase.rpc('save_accounting_settings',{p_automatic:form.automatic,p_start:form.start||null,p_mappings:form.mappings});if(error)throw error
   if(isCurrent()){toast.success('Configuración contable guardada.');setDraft(null);await reload()}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo guardar.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function period(record?:AccountingPeriod){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{const {error}=await supabase.rpc('manage_accounting_period',{p_start:record?.starts_on||start,p_end:record?.ends_on||end,p_closed:!!record});if(error)throw error
   if(isCurrent()){toast.success(record?'Período cerrado.':'Período creado.');setStart('');setEnd('');await reload()}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo guardar el período.')}
  finally{lock.current=false;setBusy(false)}
 }
 return <div className="space-y-5 p-4 sm:p-6"><h1 className="text-2xl font-bold">Configuración contable</h1><AccountingNav/><InvoiceMasterSettings/><BillingOfficeAccessSettings/>
 {error&&<p role="alert" className="text-red-600">{error} <button onClick={()=>void reload()}>Reintentar</button></p>}{loading&&<p>Cargando…</p>}
 {data&&form&&<><form className={`${cardClass} space-y-4`} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="space-y-4"><legend className="font-semibold">Cuentas operativas y activación</legend>
 <p className="text-sm">La contabilidad se prepara sin saldos iniciales. Define las cuentas, los períodos y la fecha de inicio cuando Contabilidad la apruebe. La moneda de los libros es HNL; los documentos conservan su moneda original.</p>
 <div className="grid gap-3 md:grid-cols-2">{accountingPurposes.map(([purpose,label,kind])=><label key={purpose}>{label}<select className={fieldClass} value={form.mappings[purpose]||''} onChange={e=>setDraft({...form,context,mappings:{...form.mappings,[purpose]:e.target.value}})}><option value="">Sin configurar</option>{data.accounts.filter(a=>a.postable&&a.active&&a.kind===kind).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>)}</div>
 <label className="block">Fecha de inicio contable<input className={fieldClass} type="date" value={form.start} onChange={e=>setDraft({...form,context,start:e.target.value})}/></label>
 <label className="flex gap-2"><input type="checkbox" checked={form.automatic} onChange={e=>setDraft({...form,context,automatic:e.target.checked})}/>Activar contabilización automática desde la fecha indicada</label>
 <button className={primaryButtonClass}>Guardar configuración</button></fieldset></form>
 <section className={`${cardClass} space-y-4`}><h2 className="font-semibold">Períodos contables</h2><form onSubmit={e=>{e.preventDefault();void period()}}><fieldset disabled={busy} className="flex flex-wrap items-end gap-3"><label>Desde<input type="date" required className={fieldClass} value={start} onChange={e=>setStart(e.target.value)}/></label><label>Hasta<input type="date" required className={fieldClass} value={end} onChange={e=>setEnd(e.target.value)}/></label><button className={primaryButtonClass}>Crear período abierto</button></fieldset></form>
 <div className="space-y-2">{data.periods.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-2"><span>{formatDate(p.starts_on)} — {formatDate(p.ends_on)} · {p.closed?'Cerrado':'Abierto'}</span>{!p.closed&&<button disabled={busy} className={secondaryButtonClass} onClick={()=>setClosing(p)}>Cerrar período</button>}</div>)}</div></section></>}
 <ConfirmDialog open={!!closing} onOpenChange={open=>{if(!open)setClosing(null)}} title="Cerrar período contable" description="No se aceptarán nuevos asientos en este período. Las correcciones posteriores se registrarán mediante ajustes o reversos en un período abierto." confirmLabel="Cerrar período" onConfirm={()=>{if(closing)void period(closing)}}/>
 </div>
}
