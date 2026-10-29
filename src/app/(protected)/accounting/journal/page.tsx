'use client'
import { Pagination } from '@/src/components/ui/Pagination'
import { useCallback,useEffect,useRef,useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { readAllReportRows } from '@/src/lib/report-query'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { NumberInput } from '@/src/components/ui/NumberInput'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { ScrollText } from 'lucide-react'
import { JournalDetail } from '@/src/components/accounting/JournalDetail'
import { validateJournalLines,type JournalEntry } from '@/src/lib/accounting'
import { formatDate,formatMoney,toDateInputValue } from '@/src/lib/format'
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/src/components/ui/dialog'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass,fieldLabelClass } from '@/src/lib/ui-classes'
const blank=()=>({id:crypto.randomUUID(),account_id:'',debit:'',credit:'',description:''})
export default function JournalsPage(){
 const {context,data,error,loading,isCurrent}=useAccounting(),lock=useRef(false),retry=useRef({signature:'',id:''})
 const [busy,setBusy]=useState(false),[from,setFrom]=useState(()=>toDateInputValue().slice(0,7)+'-01'),[to,setTo]=useState(toDateInputValue)
 const [entries,setEntries]=useState<{context:string;from:string;to:string;rows:JournalEntry[]}|null>(null),[readError,setReadError]=useState(''),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(50)
 const [editing,setEditing]=useState(false),[editorContext,setEditorContext]=useState(''),[date,setDate]=useState(toDateInputValue),[description,setDescription]=useState(''),[lines,setLines]=useState<ReturnType<typeof blank>[]>([])
 const [selected,setSelected]=useState<{context:string;entry:JournalEntry}|null>(null),[reverseEntry,setReverseEntry]=useState<(JournalEntry & {context:string})|null>(null),[reason,setReason]=useState(''),[reverseDate,setReverseDate]=useState(toDateInputValue)
 const version=useRef(0)
 const load=useCallback(async()=>{
  if(!from||!to||from>to){setReadError('Selecciona un período válido.');return}
  const run=++version.current;setReadError('')
  try{const rows=await readAllReportRows<JournalEntry>((a,b)=>supabase.from('journal_entries').select('*').gte('entry_date',from).lte('entry_date',to).order('entry_date',{ascending:false}).order('entry_number',{ascending:false}).range(a,b),{label:'asientos',isCurrent:()=>run===version.current})
   if(run===version.current)setEntries({context,from,to,rows})
  }catch(e){if(run===version.current){setEntries(null);setReadError((e as Error).message)}}
 },[context,from,to])
 useEffect(()=>{const timer=setTimeout(()=>{setPage(0);void load()},0);return()=>{clearTimeout(timer)}},[load])
 const current=entries?.context===context&&entries.from===from&&entries.to===to?entries.rows:null
 async function save(){
  if(lock.current)return
  const normalized=lines.map(l=>({...l,debit:Number(l.debit),credit:Number(l.credit)})),invalid=validateJournalLines(normalized)
  if(invalid){toast.error(invalid);return}
  const signature=JSON.stringify({context,date,description,normalized});if(retry.current.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
  lock.current=true;setBusy(true)
  try{const {error}=await supabase.rpc('create_manual_journal',{p_request_id:retry.current.id,p_date:date,p_description:description,p_lines:normalized});if(error)throw error
   if(isCurrent()){toast.success('Asiento contabilizado.');setEditing(false);setLines([]);setDescription('');retry.current={signature:'',id:''};await load()}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo contabilizar.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function reverse(){
  if(lock.current||!reverseEntry||reverseEntry.context!==context)return
  lock.current=true;setBusy(true)
  try{const {error}=await supabase.rpc('reverse_journal',{p_entry_id:reverseEntry.id,p_date:reverseDate,p_reason:reason});if(error)throw error
   if(isCurrent()){toast.success('Reverso contabilizado.');setReverseEntry(null);setSelected(null);await load()}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo revertir.')}
  finally{lock.current=false;setBusy(false)}
 }
 const change=(id:string,key:string,value:string)=>setLines(prev=>prev.map(l=>l.id===id?{...l,[key]:value}:l))
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Asientos contables" description="Partidas manuales y automáticas, reversos y detalle de cada asiento." icon={ScrollText}/><AccountingNav/>
 {error&&<p role="alert" className="text-red-600">{error}</p>}{loading&&<p>Cargando cuentas…</p>}
 {data&&<><button disabled={busy} className={primaryButtonClass} onClick={()=>{setEditing(true);setEditorContext(context);setLines([blank(),blank()]);setDescription('');setDate(toDateInputValue())}}>Nuevo asiento manual</button>
 {editing&&editorContext===context&&<form className={cardClass} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">Partida manual · HNL</legend><div className="grid gap-3 md:grid-cols-2"><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Fecha</span><input required type="date" max={toDateInputValue()} className={fieldClass} value={date} onChange={e=>setDate(e.target.value)}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Concepto</span><input required maxLength={2000} className={fieldClass} value={description} onChange={e=>setDescription(e.target.value)}/></label></div>
 {lines.map((line,index)=><div key={line.id} className="grid gap-2 border-t pt-2 md:grid-cols-[2fr_1fr_1fr_2fr_auto]"><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Cuenta {index+1}</span><select required className={fieldClass} value={line.account_id} onChange={e=>change(line.id,'account_id',e.target.value)}><option value="">Seleccionar</option>{data.accounts.filter(a=>a.active&&a.postable).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Debe</span><NumberInput type="number" min="0" step="0.01" className={fieldClass} value={line.debit} onChange={e=>change(line.id,'debit',e.target.value)}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Haber</span><NumberInput type="number" min="0" step="0.01" className={fieldClass} value={line.credit} onChange={e=>change(line.id,'credit',e.target.value)}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Comentario</span><input maxLength={2000} className={fieldClass} value={line.description} onChange={e=>change(line.id,'description',e.target.value)}/></label><button type="button" disabled={lines.length<=2} onClick={()=>setLines(prev=>prev.filter(l=>l.id!==line.id))}>Quitar</button></div>)}
 <p>Debe: {formatMoney(lines.reduce((s,l)=>s+(Number(l.debit)||0),0),'HNL')} · Haber: {formatMoney(lines.reduce((s,l)=>s+(Number(l.credit)||0),0),'HNL')}</p>
 <div className="flex flex-wrap gap-2"><button type="button" disabled={lines.length>=500} className={secondaryButtonClass} onClick={()=>setLines(prev=>[...prev,blank()])}>Agregar línea</button><button className={primaryButtonClass}>Contabilizar</button><button type="button" className={secondaryButtonClass} onClick={()=>setEditing(false)}>Cancelar</button></div></fieldset></form>}
 <section className={`${cardClass} space-y-3`}><div className="flex flex-wrap gap-3"><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Desde</span><input type="date" className={fieldClass} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Hasta</span><input type="date" className={fieldClass} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
 {readError&&<p role="alert">{readError} <button onClick={()=>void load()}>Reintentar</button></p>}{!current&&!readError&&<p>Cargando asientos…</p>}
 <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>N.º / Fecha</th><th>Concepto</th><th>Origen</th><th>Acciones</th></tr></thead><tbody>{current?.slice(page*pageSize,(page+1)*pageSize).map(e=><tr key={e.id} className="border-t"><td className="p-2">#{e.entry_number} · {formatDate(e.entry_date)}</td><td className="p-2">{e.description}{e.reversed_by_id&&<p className="text-red-600">Reversado</p>}</td><td>{e.source_type}</td><td><div className="flex gap-2"><button className="text-blue-700 underline" onClick={()=>setSelected({context,entry:e})}>Ver partida</button>{e.source_type==='Manual'&&!e.reversed_by_id&&<button disabled={busy} className="text-red-600 underline" onClick={()=>{setReverseEntry({...e,context});setReason('');setReverseDate(toDateInputValue())}}>Revertir</button>}</div></td></tr>)}</tbody></table></div>
 <Pagination page={page+1} pageSize={pageSize} total={current?.length||0} onPageChange={p=>setPage(p-1)} onPageSizeChange={size=>{setPageSize(size);setPage(0)}}/></section></>}
 <Dialog open={selected?.context===context} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Partida contable</DialogTitle><DialogDescription>Detalle de cuentas e importes registrados en HNL.</DialogDescription></DialogHeader>{selected?.context===context&&<JournalDetail entry={selected.entry}/>}</DialogContent></Dialog>
 <Dialog open={reverseEntry?.context===context} onOpenChange={open=>{if(!open&&!busy)setReverseEntry(null)}}><DialogContent><DialogHeader><DialogTitle>Revertir asiento #{reverseEntry?.entry_number}</DialogTitle><DialogDescription>Se crea una partida inversa; el asiento original permanece en el diario.</DialogDescription></DialogHeader><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Fecha del reverso</span><input type="date" className={fieldClass} value={reverseDate} onChange={e=>setReverseDate(e.target.value)}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Motivo</span><textarea maxLength={1800} className={fieldClass} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className={primaryButtonClass} disabled={busy||!reason.trim()||!reverseDate} onClick={()=>void reverse()}>Confirmar reverso</button></DialogContent></Dialog>
 </div>
}
