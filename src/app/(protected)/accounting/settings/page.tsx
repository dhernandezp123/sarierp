'use client'
import { InvoiceMasterSettings } from '@/src/components/invoicing/InvoiceMasterSettings'
import { BillingOfficeAccessSettings } from '@/src/components/invoicing/BillingOfficeAccessSettings'
import { useRef,useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { Settings } from 'lucide-react'
import { accountingPurposes,matchesAccountingPurpose,type AccountingPeriod } from '@/src/lib/accounting'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { ServiceAccountingAssignments } from '@/src/components/accounting/ServiceAccountingAssignments'
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
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Configuración contable" description="Maestros de facturación, oficinas autorizadas y períodos contables." icon={Settings}/><AccountingNav/><div className="grid items-start gap-6 xl:grid-cols-2"><InvoiceMasterSettings/><BillingOfficeAccessSettings/></div>
 {error&&<p role="alert" className="text-red-600">{error} <button onClick={()=>void reload()}>Reintentar</button></p>}{loading&&<p>Cargando…</p>}
 {data&&form&&<><form className={`${cardClass} space-y-4`} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="space-y-4"><legend className="text-base font-bold">Cuentas operativas y activación</legend>
 <p className="text-sm text-slate-500">La contabilidad se prepara sin saldos iniciales. Define las cuentas, los períodos y la fecha de inicio cuando Contabilidad la apruebe. La moneda de los libros es HNL; los documentos conservan su moneda original.</p>
 <p className="text-xs text-slate-500">Busca cada cuenta por código o nombre. Solo se muestran cuentas activas que reciben movimientos y corresponden a esta configuración.</p>
 <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">{accountingPurposes.map(([purpose,label,kind])=><div key={purpose} className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"><label htmlFor={`accounting-${purpose}`}>{label}</label><CompactSelect id={`accounting-${purpose}`} aria-label={label} searchable disabled={busy} value={form.mappings[purpose]||''} onValueChange={value=>setDraft({...form,context,mappings:{...form.mappings,[purpose]:value}})} options={[{value:'',label:'Sin configurar'},...data.accounts.filter(a=>a.postable&&a.active&&matchesAccountingPurpose(purpose,kind,a.kind)).map(a=>({value:a.id,label:`${a.code} · ${a.name}`,description:[a.account_level,a.kind].filter(Boolean).join(' · ')}))]}/></div>)}</div>
 <label className="flex max-w-xs flex-col gap-1.5 text-sm font-medium">Fecha de inicio contable<input className={fieldClass} type="date" value={form.start} onChange={e=>setDraft({...form,context,start:e.target.value})}/></label>
 <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.automatic} onChange={e=>setDraft({...form,context,automatic:e.target.checked})}/>Activar contabilización automática desde la fecha indicada</label>
 <button className={primaryButtonClass}>Guardar configuración</button></fieldset></form>
 <section className={`${cardClass} space-y-4`}><h2 className="text-base font-bold">Períodos contables</h2><form onSubmit={e=>{e.preventDefault();void period()}}><fieldset disabled={busy} className="flex flex-wrap items-end gap-3"><label className="flex flex-col gap-1.5 text-sm font-medium">Desde<input type="date" required className={fieldClass} value={start} onChange={e=>setStart(e.target.value)}/></label><label className="flex flex-col gap-1.5 text-sm font-medium">Hasta<input type="date" required className={fieldClass} value={end} onChange={e=>setEnd(e.target.value)}/></label><button className={primaryButtonClass}>Crear período abierto</button></fieldset></form>
 <div className="space-y-2">{data.periods.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-2"><span>{formatDate(p.starts_on)} — {formatDate(p.ends_on)} · {p.closed?'Cerrado':'Abierto'}</span>{!p.closed&&<button disabled={busy} className={secondaryButtonClass} onClick={()=>setClosing(p)}>Cerrar período</button>}</div>)}</div></section></>}
 <ConfirmDialog open={!!closing} onOpenChange={open=>{if(!open)setClosing(null)}} title="Cerrar período contable" description="No se aceptarán nuevos asientos en este período. Las correcciones posteriores se registrarán mediante ajustes o reversos en un período abierto." confirmLabel="Cerrar período" onConfirm={()=>{if(closing)void period(closing)}}/>
 {data&&<ServiceAccountingAssignments key={context} accounts={data.accounts}/>}
 </div>
}
