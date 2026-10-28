'use client'
import { useEffect,useRef,useState } from 'react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import type { JournalEntry } from '@/src/lib/accounting'
import { JournalDetail } from './JournalDetail'
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/src/components/ui/dialog'
import { secondaryButtonClass,primaryButtonClass } from '@/src/lib/ui-classes'
export function InvoiceJournal({invoiceId}:{invoiceId:string}){
 const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}:${invoiceId}`
 const [open,setOpen]=useState(false),[result,setResult]=useState<{context:string;entry:JournalEntry|null;error:string}|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false)
 const lock=useRef(false),identity=useRef(context)
 useEffect(()=>{identity.current=context;return()=>{identity.current=''}},[context])
 useEffect(()=>{if(!open)return;let current=true
  void supabase.from('journal_entries').select('*').eq('source_key',`invoice:${invoiceId}`).maybeSingle().then(({data,error})=>{if(current)setResult({context,entry:data,error:error?'No se pudo consultar la partida.':''})})
  return()=>{current=false}
 },[context,invoiceId,open,revision])
 async function post(){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{const {error}=await supabase.rpc('post_invoice_journal',{p_invoice_id:invoiceId});if(error)throw error
   if(identity.current===context){toast.success('Partida contabilizada.');setRevision(n=>n+1)}
  }catch(e){if(identity.current===context)toast.error((e as {message?:string}).message||'No se pudo contabilizar.')}
  finally{lock.current=false;setBusy(false)}
 }
 if(!['Admin','Contabilidad','Finanzas'].includes(profile?.rol||''))return null
 const current=result?.context===context?result:null
 return <><button type="button" className={secondaryButtonClass} onClick={()=>setOpen(true)}>Ver partida contable</button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Partida de la factura</DialogTitle><DialogDescription>Consulta las cuentas afectadas por este documento fiscal.</DialogDescription></DialogHeader>
 {!current?<p>Cargando…</p>:current.error?<p role="alert">{current.error} <button onClick={()=>setRevision(n=>n+1)}>Reintentar</button></p>:current.entry?<JournalDetail entry={current.entry}/>:<div className="space-y-3"><p>Este documento no tiene una partida registrada. Para contabilizarlo debe estar emitido y dentro de un período abierto, con las cuentas y la fecha de inicio configuradas.</p><button className={primaryButtonClass} disabled={busy} onClick={()=>void post()}>Generar partida</button></div>}
 </DialogContent></Dialog></>
}
