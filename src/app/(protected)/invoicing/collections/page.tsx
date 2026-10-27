'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { roundMoney } from '@/src/lib/invoice-fiscal'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { downloadFinancialReport } from '@/src/components/invoicing/FinancialReportExport'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type Client={id:string;nombre:string}
type Debt={id:string;root_id:string;invoice_type:string;invoice_number:string;issue_date:string;due_date:string|null;payment_condition:string;credit_days:number;days_elapsed:number;days_overdue:number;balance:number;status:string}
type Receipt={id:string;receipt_number:string;amount:number;applied_amount:number;unapplied_amount:number;payment_date:string;payment_method:string;reference:string;notes:string;status:string}
type Applied={id:string;amount:number;status:string;document:{invoice_number:string;invoice_type:string}|null}
export default function CollectionsPage() {
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`
  const identity=useRef(context)
  useEffect(()=>{identity.current=context;return()=>{identity.current=''}},[context])
  const version=useRef(0),busyRef=useRef(false),retry=useRef({signature:'',id:''})
  const [clients,setClients]=useState<{context:string;rows:Client[]}>({context:'',rows:[]}),[client,setClient]=useState(''),[currency,setCurrency]=useState('HNL')
  const [snapshot,setSnapshot]=useState<{key:string;debts:Debt[];receipts:Receipt[]}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
  const [allocations,setAllocations]=useState<Record<string,string>>({}),[amount,setAmount]=useState(''),[date,setDate]=useState(toDateInputValue)
  const [exchangeRate,setExchangeRate]=useState('')
  const [method,setMethod]=useState('Transferencia'),[reference,setReference]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false)
  const [advance,setAdvance]=useState<Receipt|null>(null),[reversal,setReversal]=useState<Receipt|null>(null),[reason,setReason]=useState(''),[page,setPage]=useState(0)
  const key=`${context}:${client}:${currency}`,keyRef=useRef(key)
  useEffect(()=>{keyRef.current=key;return()=>{keyRef.current=''}},[key])
  const data=snapshot?.key===key?snapshot:null
  const customer=clients.context===context?clients.rows.find(c=>c.id===client):null
  useEffect(()=>{
    let current=true
    const timer=setTimeout(()=>{
      setClient('');setSnapshot(null);setAllocations({});setAdvance(null)
      setAmount('');setReference('');setNotes('');setExchangeRate('');setReversal(null);setReason('');retry.current={signature:'',id:''}
      void readAllReportRows<Client>((a,b)=>supabase.from('clientes').select('id,nombre').order('nombre').order('id').range(a,b),{label:'clientes',isCurrent:()=>current})
        .then(rows=>{if(current)setClients({context,rows})}).catch(()=>{if(current)setError('No se pudieron cargar los clientes. Recarga la página.')})
    },0)
    return()=>{current=false;clearTimeout(timer)}
  },[context])
  const refresh=useCallback(async()=>{
    if(!client)return
    const run=++version.current
    setLoading(true);setError('')
    const isCurrent=()=>run===version.current&&keyRef.current===key
    try {
      const [debts,receipts]=await Promise.all([
        readAllReportRows<Debt>((a,b)=>supabase.from('customer_document_balances').select('*').eq('cliente_id',client).eq('currency',currency).gt('balance',0).order('issue_date').order('id').range(a,b),{label:'saldos',isCurrent}),
        readAllReportRows<Receipt>((a,b)=>supabase.from('customer_receipt_balances').select('*').eq('cliente_id',client).eq('currency',currency).order('payment_date',{ascending:false}).order('id').range(a,b),{label:'recibos',isCurrent}),
      ])
      if(isCurrent())setSnapshot({key,debts,receipts})
    }catch(e){if(isCurrent()){setSnapshot(null);setError(e instanceof Error?e.message:'No se pudieron cargar los saldos.')}}
    finally{if(isCurrent())setLoading(false)}
  },[client,currency,key])
  useEffect(()=>{const timer=setTimeout(()=>{setAllocations({});setAdvance(null);setPage(0);void refresh()},0);return()=>clearTimeout(timer)},[refresh])
  const allocationRows=Object.entries(allocations).map(([document_id,value])=>({document_id,amount:Number(value)}))
  const allocated=roundMoney(allocationRows.reduce((sum,a)=>sum+(Number.isFinite(a.amount)?a.amount:0),0))
  const received=advance?Number(advance.unapplied_amount):Number(amount),remaining=roundMoney(received-allocated)
  async function submit() {
    if(busyRef.current||loading||!data||!customer)return
    if(!Number.isFinite(received)||received<=0||remaining<0||allocationRows.some(a=>!Number.isFinite(a.amount)||a.amount<=0||a.amount>Number(data.debts.find(d=>d.id===a.document_id)?.balance||0))){toast.error('Revisa el importe recibido y las aplicaciones seleccionadas.');return}
    if(advance&&!allocationRows.length){toast.error('Selecciona al menos un documento.');return}
    if(!advance&&(!date||date>toDateInputValue()||(!reference.trim()&&method!=='Efectivo'))){toast.error('Revisa fecha y referencia del pago.');return}
    if(!advance&&currency==='USD'&&(!Number.isFinite(Number(exchangeRate))||Number(exchangeRate)<=0||Number(exchangeRate)>1000000)){toast.error('Indica la tasa HNL por USD del recibo.');return}
    const signature=JSON.stringify({key,advance:advance?.id,received,date,method,reference,notes,allocationRows,exchangeRate})
    if(retry.current.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    const owner=context,request=retry.current.id
    busyRef.current=true;setBusy(true)
    try {
      const result=advance?await supabase.rpc('allocate_customer_receipt',{p_receipt_id:advance.id,p_request_id:request,p_allocations:allocationRows}):
        await supabase.rpc('register_customer_receipt',{p_request_id:request,p_cliente_id:client,p_amount:received,p_currency:currency,p_payment_date:date,p_payment_method:method,p_reference:reference,p_notes:notes,p_allocations:allocationRows,p_exchange_rate:currency==='HNL'?1:Number(exchangeRate)})
      if(result.error)throw result.error
      if(identity.current!==owner)return
      toast.success(advance?'Anticipo aplicado.':'Recibo registrado.');retry.current={signature:'',id:''};setAllocations({});setAdvance(null);setAmount('');setReference('');setNotes('');await refresh()
    }catch(e){if(identity.current===owner)toast.error(e instanceof Error?e.message:(e as {message?:string}).message||'No se pudo registrar. Puedes reintentar sin duplicar el cobro.')}
    finally{busyRef.current=false;setBusy(false)}
  }
  async function reverse() {
    if(busyRef.current||!reversal||!reason.trim())return
    busyRef.current=true;setBusy(true);const owner=context
    try {
      const {error}=await supabase.rpc('reverse_customer_receipt',{p_receipt_id:reversal.id,p_reason:reason.trim()})
      if(error)throw error
      if(identity.current===owner){toast.success('Recibo reversado y saldos restaurados.');setReversal(null);setReason('');setAdvance(null);setAllocations({});await refresh()}
    }catch(e){if(identity.current===owner)toast.error((e as {message?:string}).message||'No se pudo revertir.')}
    finally{busyRef.current=false;setBusy(false)}
  }
  async function receiptPdf(receipt:Receipt) {
    if(busyRef.current)return
    busyRef.current=true;setBusy(true);const owner=context
    try {
      const applied=await readAllReportRows<Applied>((a,b)=>supabase.from('invoice_payments').select('id,amount,status,document:invoices!invoice_payments_document_fk(invoice_number,invoice_type)').eq('receipt_id',receipt.id).order('id').range(a,b)
        .then(result=>({...result,data:result.data?.map(p=>({...p,document:Array.isArray(p.document)?p.document[0]||null:p.document}))||null})),{label:'aplicaciones del recibo',isCurrent:()=>identity.current===owner})
      if(identity.current!==owner)return
      await downloadFinancialReport({title:`Recibo ${receipt.receipt_number}`,subtitle:customer?.nombre||'',generatedAt:formatDate(new Date()),dateRange:formatDate(receipt.payment_date),
        filters:[receipt.status,`${receipt.payment_method} · ${receipt.reference}`,receipt.notes,'Comprobante de pago; no sustituye un documento fiscal.'],
        metrics:[{label:'Recibido',value:formatMoney(Number(receipt.amount),currency)},{label:'Aplicado vigente',value:formatMoney(Number(receipt.applied_amount),currency)},{label:'Anticipo disponible',value:formatMoney(Number(receipt.unapplied_amount),currency)}],
        columns:[{key:'type',label:'Tipo'},{key:'document',label:'Documento'},{key:'status',label:'Estado'},{key:'amount',label:`Aplicación ${currency}`,align:'right'}],
        rows:applied.map(p=>({type:p.document?.invoice_type||'',document:p.document?.invoice_number||'',status:p.status,amount:Number(p.amount)}))},receipt.receipt_number,'pdf')
    }catch(e){toast.error((e as {message?:string}).message||'No se pudo generar el recibo.')}
    finally{busyRef.current=false;setBusy(false)}
  }
  return <div className="space-y-5 p-4 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">Cobranza y recibos</h1><Link href="/invoicing/statements" className="text-blue-700 underline">Estado de cuenta consolidado</Link></div>
    <fieldset disabled={busy} className={`${cardClass} grid gap-3 sm:grid-cols-3`}><label className="sm:col-span-2">Cliente<select className={fieldClass} value={client} onChange={e=>setClient(e.target.value)}><option value="">Selecciona un cliente</option>{(clients.context===context?clients.rows:[]).map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label>Moneda<select className={fieldClass} value={currency} onChange={e=>setCurrency(e.target.value)}><option>HNL</option><option>USD</option></select></label></fieldset>
    {error&&<div role="alert" className="text-red-600">{error} <button className="underline" onClick={()=>void refresh()}>Reintentar</button></div>}{loading&&<p role="status">Consultando saldos…</p>}
    {data&&<><form className={`${cardClass} space-y-4`} onSubmit={e=>{e.preventDefault();void submit()}}><fieldset disabled={busy||loading} className="space-y-4"><legend className="font-semibold">{advance?`Aplicar anticipo de ${advance.receipt_number}`:'Registrar pago recibido'}</legend>
      {advance?<div className="flex gap-3"><p>Disponible: {formatMoney(Number(advance.unapplied_amount),currency)}</p><button type="button" className="underline" onClick={()=>{setAdvance(null);setAllocations({})}}>Cancelar aplicación</button></div>:<div className="grid gap-3 sm:grid-cols-3">
        <label>Importe recibido {currency}<input className={fieldClass} type="number" min="0.01" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Fecha<input className={fieldClass} type="date" required max={toDateInputValue()} value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label>Método de pago<select className={fieldClass} value={method} onChange={e=>setMethod(e.target.value)}>{['Efectivo','Cheque','Deposito','Transferencia','Tarjeta debito','Tarjeta credito'].map(m=><option key={m}>{m}</option>)}</select></label>
        {currency==='USD'&&<label>Tasa HNL por USD<input required type="number" min="0.000001" max="1000000" step="0.000001" className={fieldClass} value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)}/></label>}
        <label>Referencia / voucher<input className={fieldClass} maxLength={200} required={method!=='Efectivo'} value={reference} onChange={e=>setReference(e.target.value)}/></label><label className="sm:col-span-2">Comentarios<input className={fieldClass} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      </div>}
      <p className="text-sm">Selecciona los documentos y el importe que deseas aplicar. Lo no aplicado queda disponible como anticipo del cliente en esta moneda.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Aplicar</th><th className="text-left p-2">Documento</th><th>Condición / antigüedad</th><th>Saldo</th><th>Importe a aplicar</th></tr></thead><tbody>{data.debts.map(d=><tr className="border-t" key={d.id}><td className="p-2"><input aria-label={`Aplicar a ${d.invoice_number}`} type="checkbox" checked={d.id in allocations} disabled={!['Aprobada','Parcialmente Pagada','Vencida','Pagada','Saldada'].includes(d.status)} onChange={e=>setAllocations(prev=>{const next={...prev};if(e.target.checked)next[d.id]=String(d.balance);else delete next[d.id];return next})}/></td>
        <td className="p-2"><Link href={`/invoicing/${d.id}`} className="underline">{d.invoice_number}</Link><p>{d.invoice_type} · {d.status}</p><p className="text-xs text-slate-500">{formatDate(d.issue_date)}</p></td>
        <td className="p-2 text-center">{d.payment_condition==='Credito'?`Crédito ${d.credit_days} días`:'Contado'}<p>{d.days_elapsed} días transcurridos</p>{d.days_overdue>0&&<p className="text-red-600">{d.days_overdue} días vencidos</p>}</td><td className="p-2 text-right">{formatMoney(Number(d.balance),currency)}</td>
        <td className="p-2"><input aria-label={`Importe para ${d.invoice_number}`} className={`${fieldClass} w-36`} type="number" min="0.01" step="0.01" max={d.balance} disabled={!(d.id in allocations)} value={allocations[d.id]??''} onChange={e=>setAllocations(prev=>({...prev,[d.id]:e.target.value}))}/></td></tr>)}</tbody></table></div>
      {!data.debts.length&&<p>No hay documentos pendientes en esta moneda. Puedes registrar un anticipo.</p>}
      <div className="flex flex-wrap gap-4 font-semibold"><span>Aplicación: {formatMoney(allocated,currency)}</span><span className={remaining<0?'text-red-600':''}>Remanente: {formatMoney(Number.isFinite(remaining)?remaining:0,currency)}</span></div>
      <button className={primaryButtonClass} disabled={busy||loading}>{busy?'Guardando…':advance?'Aplicar anticipo':'Guardar recibo'}</button>
    </fieldset></form>
    <section className={`${cardClass} space-y-3`}><h2 className="font-semibold">Recibos del cliente</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Recibo / fecha</th><th>Estado</th><th>Recibido</th><th>Aplicado</th><th>Anticipo</th><th>Acciones</th></tr></thead><tbody>{data.receipts.slice(page*50,page*50+50).map(r=><tr key={r.id} className="border-t"><td className="p-2">{r.receipt_number}<p>{formatDate(r.payment_date)}</p></td><td className="p-2">{r.status}</td><td className="p-2 text-right">{formatMoney(Number(r.amount),currency)}</td><td className="p-2 text-right">{formatMoney(Number(r.applied_amount),currency)}</td><td className="p-2 text-right">{formatMoney(Number(r.unapplied_amount),currency)}</td><td className="p-2"><div className="flex flex-wrap gap-2"><button disabled={busy||loading} className={secondaryButtonClass} onClick={()=>void receiptPdf(r)}>PDF</button>{Number(r.unapplied_amount)>0&&<button disabled={busy||loading} className={secondaryButtonClass} onClick={()=>{setAdvance(r);setAllocations({})}}>Aplicar anticipo</button>}{r.status==='Aplicado'&&<button disabled={busy||loading} className="text-red-600 underline" onClick={()=>{setReversal(r);setReason('')}}>Revertir</button>}</div></td></tr>)}</tbody></table></div>
      {!data.receipts.length&&<p>No hay recibos registrados.</p>}<div className="flex gap-3 text-sm"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page+1} / {Math.max(1,Math.ceil(data.receipts.length/50))}</span><button disabled={(page+1)*50>=data.receipts.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
    </section></>}
    <Dialog open={!!reversal} onOpenChange={open=>{if(!open&&!busy)setReversal(null)}}><DialogContent><DialogHeader><DialogTitle>Revertir {reversal?.receipt_number}</DialogTitle><DialogDescription>Se revertirán todas sus aplicaciones y se restaurarán los saldos. El historial conservará el recibo y el reverso.</DialogDescription></DialogHeader><label>Motivo<textarea className={fieldClass} maxLength={2000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button className={primaryButtonClass} disabled={busy||!reason.trim()} onClick={()=>void reverse()}>Confirmar reverso</button></DialogContent></Dialog>
  </div>
}
