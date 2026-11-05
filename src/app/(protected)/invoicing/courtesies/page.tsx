'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {Gift} from 'lucide-react'
import {toast} from 'sonner'
import {useUser} from '@/src/hooks/useUser'
import {supabase} from '@/src/lib/supabase/client'
import {courtesyStatus,courtesyAmount,type InvoiceCourtesy} from '@/src/lib/invoice-courtesies'
import {InvoiceCourtesyAmounts} from '@/src/components/invoicing/InvoiceCourtesyList'
import {FinancePageHeader,financeLinkClass} from '@/src/components/invoicing/FinanceWorkspace'
import {Pagination} from '@/src/components/ui/Pagination'
import {FormField} from '@/src/components/ui/form-field'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/src/components/ui/dialog'
import {cardClass,fieldClass,primaryButtonClass,secondaryButtonClass} from '@/src/lib/ui-classes'
import {formatMoney,formatDateTime} from '@/src/lib/format'
export default function CourtesyRequestsPage(){
 const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}:${profile?.rol}`
 return <CourtesyInbox key={context} userId={user?.id||''} finance={['Admin','Contabilidad','Finanzas'].includes(profile?.rol||'')}/>
}
function CourtesyInbox({userId,finance}:{userId:string;finance:boolean}){
 const [state,setState]=useState<{rows:InvoiceCourtesy[];total:number;canReview:boolean}|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(25),[status,setStatus]=useState('Pendiente'),[version,setVersion]=useState(0)
 const [decision,setDecision]=useState<{row:InvoiceCourtesy;action:'Aprobar'|'Rechazar'|'Retirar'}|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false)
 const mounted=useRef(true),lock=useRef(false)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{
  let active=true
  void Promise.all([supabase.rpc('get_invoice_courtesies',{p_offset:(page-1)*size,p_limit:size,p_status:status||null}),supabase.rpc('can_approve_invoice_courtesy')]).then(([r,permission])=>{
   if(!active)return
   if(r.error||permission.error||!Array.isArray(r.data?.requests))throw new Error('No se pudieron consultar las solicitudes.')
   setState({rows:r.data.requests,total:r.data.total,canReview:permission.data===true});setError('')
  }).catch(e=>{if(active){setState(null);setError((e as Error).message)}})
  return()=>{active=false}
 },[page,size,status,version])
 function choose(row:InvoiceCourtesy,action:'Aprobar'|'Rechazar'|'Retirar'){setReason('');setDecision({row,action})}
 async function decide(){
  if(!decision||lock.current||reason.trim().length<5)return
  lock.current=true;setBusy(true)
  try{const {error}=await supabase.rpc('review_invoice_courtesy',{p_id:decision.row.id,p_decision:decision.action,p_reason:reason.trim()});if(error)throw error
   if(mounted.current){toast.success('Decisión registrada.');setDecision(null);setState(null);setVersion(v=>v+1)}
  }catch(e){if(mounted.current)toast.error((e as {message?:string}).message||'No se pudo registrar la decisión.')}
  finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 return <div className="space-y-6"><FinancePageHeader eyebrow="Finanzas · Facturación" title="Solicitudes de cortesía" description="Revisión individual por concepto, motivo e importe. Una persona distinta al solicitante debe aprobar." icon={Gift} actions={<Link href={finance?"/invoicing":"/alerts"} className={secondaryButtonClass}>Volver</Link>}/>
 <div className={`${cardClass} flex flex-wrap items-end gap-3`}><FormField label="Estado"><select className={fieldClass} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);setState(null)}}><option value="">Todas</option>{['Pendiente','Aprobada','Rechazada','Revocada','Aplicada'].map(s=><option key={s}>{s}</option>)}</select></FormField><button className={secondaryButtonClass} onClick={()=>{setState(null);setVersion(v=>v+1)}}>Actualizar</button></div>
 {error?<p role="alert" className="text-red-600">{error}</p>:!state?<p role="status">Consultando solicitudes…</p>:<section className={`${cardClass} space-y-3`}>{!state.rows.length&&<p>Sin solicitudes para estos filtros.</p>}{state.rows.map(row=><article key={row.id} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{row.client_name} · {row.line_snapshot.description}</p><strong>{formatMoney(courtesyAmount(row),row.line_snapshot.currency)}</strong></div><InvoiceCourtesyAmounts row={row}/><p className="text-sm">{courtesyStatus(row)} · {row.requester_name} · {formatDateTime(row.requested_at)}</p><p className="whitespace-pre-wrap text-sm">Solicitud: {row.reason}</p>{row.review_reason&&<p className="text-sm text-slate-500">Decisión: {row.review_reason}</p>}<div className="flex flex-wrap items-center gap-2">{finance&&<Link href={`/invoicing/new?draft=${row.draft_id}`} className={financeLinkClass}>Ver borrador</Link>}{row.status==='Pendiente'&&row.is_current&&!['Emitida','Descartada'].includes(row.draft_status)&&state.canReview&&<><button disabled={busy||row.requested_by===userId} className={primaryButtonClass} onClick={()=>choose(row,'Aprobar')}>Aprobar cortesía</button><button disabled={busy||row.requested_by===userId} className={secondaryButtonClass} onClick={()=>choose(row,'Rechazar')}>Rechazar</button></>}{finance&&['Pendiente','Aprobada'].includes(row.status)&&!['Emitida','Descartada'].includes(row.draft_status)&&<button disabled={busy} className={secondaryButtonClass} onClick={()=>choose(row,'Retirar')}>Retirar solicitud</button>}</div>{row.requested_by===userId&&row.status==='Pendiente'&&<p className="text-xs text-slate-500">Tu solicitud requiere revisión de otro autorizador.</p>}</article>)}<Pagination page={page} pageSize={size} total={state.total} onPageChange={p=>{setPage(p);setState(null)}} onPageSizeChange={s=>{setSize(s);setPage(1);setState(null)}}/></section>}
 <Dialog open={Boolean(decision)} onOpenChange={open=>{if(!open&&!busy)setDecision(null)}}><DialogContent><DialogHeader><DialogTitle>{decision?.action} cortesía</DialogTitle><DialogDescription>La decisión queda vinculada a la versión actual del borrador. No modifica la cotización original.</DialogDescription></DialogHeader><FormField label="Motivo de la decisión" required><textarea aria-label="Motivo de la decisión" className={`${fieldClass} min-h-28`} maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></FormField><div className="flex justify-end gap-2"><button disabled={busy} className={secondaryButtonClass} onClick={()=>setDecision(null)}>Cancelar</button><button disabled={busy||reason.trim().length<5} className={primaryButtonClass} onClick={()=>void decide()}>{busy?'Registrando…':'Confirmar decisión'}</button></div></DialogContent></Dialog>
 </div>
}
