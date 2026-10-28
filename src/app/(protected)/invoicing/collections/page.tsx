'use client'

import Link from 'next/link'
import { AlertCircle, ArrowDownLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, History, Landmark, LoaderCircle, Receipt, RefreshCw, Search, Wallet } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { useBillingClients } from '@/src/hooks/useBillingClients'
import { useTreasuryAccounts } from '@/src/hooks/useTreasuryAccounts'
import { TreasuryAccountField } from '@/src/components/accounting/TreasuryAccountField'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { FinanceEmptyState, FinanceMetric, FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { readAllReportRows } from '@/src/lib/report-query'
import { roundMoney } from '@/src/lib/invoice-fiscal'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { downloadFinancialReport } from '@/src/components/invoicing/FinancialReportExport'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type Debt={id:string;root_id:string;invoice_type:string;invoice_number:string;issue_date:string;due_date:string|null;payment_condition:string;credit_days:number;days_elapsed:number;days_overdue:number;balance:number;status:string}
type Receipt={id:string;receipt_number:string;amount:number;applied_amount:number;unapplied_amount:number;payment_date:string;payment_method:string;reference:string;notes:string;status:string}
type Applied={id:string;amount:number;status:string;document:{invoice_number:string;invoice_type:string}|null}
export default function CollectionsPage() {
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`
  const identity=useRef(context)
  useEffect(()=>{identity.current=context;return()=>{identity.current=''}},[context])
  const version=useRef(0),busyRef=useRef(false),retry=useRef({signature:'',id:''})
  const {clients,loading:clientsLoading,error:clientsError,reload:reloadClients}=useBillingClients(context)
  const [client,setClient]=useState(''),[currency,setCurrency]=useState('HNL')
  const [snapshot,setSnapshot]=useState<{key:string;debts:Debt[];receipts:Receipt[]}|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
  const [allocations,setAllocations]=useState<Record<string,string>>({}),[amount,setAmount]=useState(''),[date,setDate]=useState(toDateInputValue)
  const [exchangeRate,setExchangeRate]=useState('')
  const treasury=useTreasuryAccounts(),[bankAccount,setBankAccount]=useState('')
  const [method,setMethod]=useState('Transferencia'),[reference,setReference]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false)
  const [advance,setAdvance]=useState<Receipt|null>(null),[reversal,setReversal]=useState<Receipt|null>(null),[reason,setReason]=useState(''),[page,setPage]=useState(0)
  const key=`${context}:${client}:${currency}`,keyRef=useRef(key)
  useEffect(()=>{keyRef.current=key;return()=>{keyRef.current=''}},[key])
  const data=snapshot?.key===key?snapshot:null
  const customer=clients.find(c=>c.id===client)||null
  useEffect(()=>{
    const timer=setTimeout(()=>{
      setClient('');setSnapshot(null);setAllocations({});setAdvance(null)
      setAmount('');setReference('');setNotes('');setExchangeRate('');setReversal(null);setReason('');retry.current={signature:'',id:''}
    },0)
    return()=>clearTimeout(timer)
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
  const pendingTotal=data?roundMoney(data.debts.reduce((sum,document)=>sum+Number(document.balance),0)):null
  const overdueDebts=data?.debts.filter(document=>document.days_overdue>0)||[]
  const overdueTotal=roundMoney(overdueDebts.reduce((sum,document)=>sum+Number(document.balance),0))
  const availableAdvance=data?roundMoney(data.receipts.filter(receipt=>receipt.status==='Aplicado').reduce((sum,receipt)=>sum+Number(receipt.unapplied_amount),0)):null
  const financeButton=financeActionClass
  async function submit() {
    if(busyRef.current||loading||!data||!customer)return
    if(!Number.isFinite(received)||received<=0||remaining<0||allocationRows.some(a=>!Number.isFinite(a.amount)||a.amount<=0||a.amount>Number(data.debts.find(d=>d.id===a.document_id)?.balance||0))){toast.error('Revisa el importe recibido y las aplicaciones seleccionadas.');return}
    if(advance&&!allocationRows.length){toast.error('Selecciona al menos un documento.');return}
    if(!advance&&(!date||date>toDateInputValue()||(!reference.trim()&&method!=='Efectivo'))){toast.error('Revisa fecha y referencia del pago.');return}
    if(!advance&&currency==='USD'&&(!Number.isFinite(Number(exchangeRate))||Number(exchangeRate)<=0||Number(exchangeRate)>1000000)){toast.error('Indica la tasa HNL por USD del recibo.');return}
    if(!advance&&(treasury.loading||treasury.error||(treasury.accounts.length&&!treasury.accounts.some(a=>a.id===bankAccount&&a.currency===currency)))){toast.error('Selecciona la cuenta bancaria/caja del recibo.');return}
    const signature=JSON.stringify({key,advance:advance?.id,received,date,method,reference,notes,allocationRows,exchangeRate,bankAccount})
    if(retry.current.signature!==signature)retry.current={signature,id:crypto.randomUUID()}
    const owner=context,request=retry.current.id
    busyRef.current=true;setBusy(true)
    try {
      const result=advance?await supabase.rpc('allocate_customer_receipt',{p_receipt_id:advance.id,p_request_id:request,p_allocations:allocationRows}):
        treasury.accounts.length?await supabase.rpc('treasury_register_source',{p_kind:'Recibo',p_account_id:bankAccount,p_rate:currency==='HNL'?1:Number(exchangeRate),p_payload:{request_id:request,cliente_id:client,amount:received,currency,date,method,reference,notes,allocations:allocationRows}}):await supabase.rpc('register_customer_receipt',{p_request_id:request,p_cliente_id:client,p_amount:received,p_currency:currency,p_payment_date:date,p_payment_method:method,p_reference:reference,p_notes:notes,p_allocations:allocationRows,p_exchange_rate:currency==='HNL'?1:Number(exchangeRate)})
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
  return <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
    <FinancePageHeader title="Cobranza y recibos" description="Registra pagos, distribúyelos entre documentos y da seguimiento a los anticipos de cada cliente." icon={Wallet} actions={<Link href="/invoicing/statements" className={financeButton}><FileText className="h-4 w-4" />Estado de cuenta<ArrowRight className="h-3.5 w-3.5" /></Link>} />

    <section className={`${cardClass} relative !p-0`} aria-labelledby="collection-account-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-[#B3282D] dark:bg-rose-950/40 dark:text-rose-300">01</span><div><h2 id="collection-account-heading" className="text-sm font-bold text-slate-900 dark:text-white">Selecciona la cuenta del cliente</h2><p className="mt-0.5 text-xs text-slate-500">Busca al cliente y elige la moneda que vas a gestionar.</p></div></div>{customer && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Cliente seleccionado</span>}</div>
      <fieldset disabled={busy} className="grid min-w-0 gap-4 p-5 sm:grid-cols-3 sm:p-6"><div className="min-w-0 space-y-2 sm:col-span-2"><label htmlFor="collections-client" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cliente</label><ClienteCombobox key={context} id="collections-client" clientes={clients} value={client} onChange={setClient} disabled={busy||Boolean(clientsError)} loading={clientsLoading} placeholder="Buscar un cliente por nombre, código o RTN…" className={`${fieldClass} h-auto min-h-16 py-3`} aria-describedby="collections-client-help" /><p id="collections-client-help" className="text-[11px] text-slate-500">{clientsLoading?'Cargando el directorio de clientes…':clientsError?'El directorio no está disponible.':`${clients.length} clientes disponibles · Puedes escribir para encontrar uno.`}</p></div>
        <div className="space-y-2"><label htmlFor="collections-currency" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Moneda de cobranza</label><div className="relative"><Landmark aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><select id="collections-currency" className={`${fieldClass} h-16 pl-11 font-semibold`} value={currency} onChange={e=>setCurrency(e.target.value)}><option value="HNL">HNL · Lempiras</option><option value="USD">USD · Dólares</option></select></div><p className="text-[11px] text-slate-500">Saldos y aplicaciones en esta moneda.</p></div>
      </fieldset>
      {clientsError&&<div role="alert" className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="h-4 w-4 shrink-0" /><span className="flex-1">{clientsError}</span><button type="button" onClick={reloadClients} className="font-semibold underline">Reintentar clientes</button></div>}
    </section>

    {error&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="h-5 w-5 shrink-0" /><span className="flex-1">{error}</span><button type="button" className={financeButton} onClick={()=>void refresh()}><RefreshCw className="h-3.5 w-3.5" />Reintentar</button></div>}
    {!client&&!clientsError&&<FinanceEmptyState icon={Search} title="Encuentra al cliente. El resto, aquí mismo." description="Busca por nombre, código o RTN para ver sus documentos pendientes, registrar un pago o aplicar un anticipo.">
      <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">{[{icon:Search,title:'Elige un cliente',detail:'Consulta su cuenta en HNL o USD.'},{icon:ArrowDownLeft,title:'Distribuye el pago',detail:'Marca documentos y define importes.'},{icon:Receipt,title:'Guarda el recibo',detail:'Conserva el detalle de cada aplicación.'}].map((step,index)=><div key={step.title} className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><span className="mt-0.5 text-xs font-bold text-[#B3282D] dark:text-rose-300">0{index+1}</span><div><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{step.title}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{step.detail}</p></div></div>)}</div>
    </FinanceEmptyState>}

    {client&&!error&&<section aria-label="Resumen de la cuenta" className="grid gap-4 sm:grid-cols-3">
      <FinanceMetric label="Saldo pendiente" value={pendingTotal==null?'—':formatMoney(pendingTotal,currency)} detail={data?`${data.debts.length} documentos con saldo`:'Consultando los documentos del cliente…'} icon={FileText} tone="slate" />
      <FinanceMetric label="Saldo vencido" value={data?formatMoney(overdueTotal,currency):'—'} detail={data?`${overdueDebts.length} documentos fuera de plazo`:'Consultando vencimientos…'} icon={Clock} tone="rose" />
      <FinanceMetric label="Anticipos disponibles" value={availableAdvance==null?'—':formatMoney(availableAdvance,currency)} detail={data?'Saldo de recibos disponible para aplicar':'Consultando los recibos del cliente…'} icon={Wallet} tone="emerald" />
    </section>}
    {loading&&<p role="status" className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Actualizando saldos y recibos…</p>}

    {data&&<>
      <form className="grid items-start gap-5 xl:grid-rows-[min-content_1fr] xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={e=>{e.preventDefault();void submit()}}>
        <fieldset disabled={busy||loading} className={`${cardClass} min-w-0 !p-0 xl:col-start-1 xl:row-start-1`}>
          <legend className="sr-only">Documentos e importes a aplicar</legend>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800"><FileText className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Aplicar a documentos</h2><p className="mt-1 text-xs text-slate-500">Selecciona facturas o notas y ajusta el importe de cada aplicación.</p></div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{allocationRows.length} seleccionados</span></div>
          {data.debts.length>0?<div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead className="bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400"><tr><th scope="col" className="w-12 py-3 pl-5"><span className="sr-only">Seleccionar</span></th><th scope="col" className="p-3 text-left">Documento</th><th scope="col" className="p-3 text-left">Condición y plazo</th><th scope="col" className="p-3 text-right">Saldo</th><th scope="col" className="py-3 pl-3 pr-5 text-right">A aplicar</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.debts.map(d=>{
            const selected=d.id in allocations,exceeds=selected&&Number(allocations[d.id])>Number(d.balance)
            return <tr key={d.id} className={selected?'bg-rose-50/45 dark:bg-rose-950/10':'transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/40'}><td className="py-4 pl-5"><input aria-label={`Aplicar a ${d.invoice_number}`} type="checkbox" className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-[#B3282D] disabled:cursor-not-allowed" checked={selected} disabled={!['Aprobada','Parcialmente Pagada','Vencida','Pagada','Saldada'].includes(d.status)} onChange={e=>setAllocations(prev=>{const next={...prev};if(e.target.checked)next[d.id]=String(d.balance);else delete next[d.id];return next})}/></td>
              <td className="px-3 py-4"><Link href={`/invoicing/${d.id}`} className="font-semibold text-slate-900 underline-offset-4 hover:text-[#B3282D] hover:underline dark:text-slate-100">{d.invoice_number}</Link><p className="mt-1 text-[11px] text-slate-500">{d.invoice_type} · {formatDate(d.issue_date)}</p><p className="mt-1 text-[10px] text-slate-400">{d.status}</p></td>
              <td className="px-3 py-4"><span className="text-xs font-medium text-slate-700 dark:text-slate-300">{d.payment_condition==='Credito'?`Crédito · ${d.credit_days} días`:'Contado'}</span><p className="mt-1 text-[11px] text-slate-500">{d.days_elapsed} días transcurridos</p>{d.days_overdue>0&&<span className="mt-1.5 inline-flex rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{d.days_overdue} días vencidos</span>}</td>
              <td className="whitespace-nowrap px-3 py-4 text-right text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(Number(d.balance),currency)}</td><td className="py-4 pl-3 pr-5"><input aria-label={`Importe para ${d.invoice_number}`} aria-invalid={exceeds||undefined} className={`${fieldClass} ml-auto h-10 w-32 px-3 text-right tabular-nums ${exceeds?'border-rose-400':''}`} type="number" min="0.01" step="0.01" max={d.balance} disabled={!selected} placeholder="0.00" value={allocations[d.id]??''} onChange={e=>setAllocations(prev=>({...prev,[d.id]:e.target.value}))}/>{exceeds&&<p className="mt-1 text-right text-[10px] text-rose-600">Supera el saldo</p>}</td>
            </tr>
          })}</tbody></table></div>:<div className="flex flex-col items-center px-5 py-12 text-center"><CheckCircle2 className="h-9 w-9 text-emerald-500" /><h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Sin documentos pendientes en {currency}</h3><p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">Puedes registrar el pago como anticipo y aplicarlo cuando corresponda.</p></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800"><p className="flex items-center gap-2 text-[11px] text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />Tú decides qué documentos y qué importes cubrir.</p>{allocationRows.length>0&&<button type="button" className="text-xs font-semibold text-[#B3282D] hover:underline dark:text-rose-300" onClick={()=>setAllocations({})}>Limpiar selección</button>}</div>
        </fieldset>

        <fieldset disabled={busy||loading} className={`${cardClass} min-w-0 space-y-5 !p-5 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:sticky xl:top-6`}>
          <legend className="sr-only">{advance?'Aplicar anticipo':'Registrar pago recibido'}</legend>
          {!advance&&<TreasuryAccountField {...treasury} currency={currency} value={bankAccount} onChange={setBankAccount}/>}
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-[#B3282D] dark:bg-rose-950/40 dark:text-rose-300"><ArrowDownLeft className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{advance?'Anticipo del cliente':'Nuevo ingreso'}</p><h2 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{advance?'Distribuir anticipo':'Registrar pago recibido'}</h2></div></div>
          {advance?<div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20"><p className="text-xs font-semibold text-amber-800 dark:text-amber-200">{advance.receipt_number}</p><p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{formatMoney(Number(advance.unapplied_amount),currency)}</p><p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">Selecciona los documentos a cubrir con el saldo disponible de este recibo.</p><button type="button" className="text-xs font-semibold text-amber-800 underline dark:text-amber-200" onClick={()=>{setAdvance(null);setAllocations({})}}>Cancelar aplicación</button></div>:<div className="space-y-4">
            <div><label htmlFor="receipt-amount" className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Importe recibido</label><div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{currency}</span><input id="receipt-amount" aria-label={`Importe recibido ${currency}`} className={`${fieldClass} h-14 pl-14 text-lg font-semibold tabular-nums`} type="number" min="0.01" step="0.01" placeholder="0.00" required value={amount} onChange={e=>setAmount(e.target.value)}/></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="min-w-0"><label htmlFor="receipt-date" className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Fecha del pago</label><input id="receipt-date" className={`${fieldClass} min-w-0 px-3 text-xs`} type="date" required max={toDateInputValue()} value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div className="min-w-0"><label htmlFor="receipt-method" className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Método de pago</label><select id="receipt-method" className={`${fieldClass} min-w-0 px-3 text-xs`} value={method} onChange={e=>setMethod(e.target.value)}>{[{value:'Efectivo',label:'Efectivo'},{value:'Cheque',label:'Cheque'},{value:'Deposito',label:'Depósito bancario'},{value:'Transferencia',label:'Transferencia'},{value:'Tarjeta debito',label:'Tarjeta de débito'},{value:'Tarjeta credito',label:'Tarjeta de crédito'}].map(method=><option key={method.value} value={method.value}>{method.label}</option>)}</select></div></div>
            {currency==='USD'&&<div><label htmlFor="receipt-exchange" className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Tasa HNL por USD</label><input id="receipt-exchange" required type="number" min="0.000001" max="1000000" step="0.000001" className={fieldClass} value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)}/></div>}
            <div><label htmlFor="receipt-reference" className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">Referencia o voucher</label><input id="receipt-reference" className={fieldClass} placeholder="Número de transferencia, depósito…" maxLength={200} required={method!=='Efectivo'} value={reference} onChange={e=>setReference(e.target.value)}/>{method!=='Efectivo'&&<p className="mt-1.5 text-[10px] text-slate-400">Obligatoria para este método de pago.</p>}</div>
            <details className="group rounded-xl border border-dashed border-slate-200 p-3 dark:border-slate-700"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200">Comentario opcional<ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" /></summary><label htmlFor="receipt-notes" className="sr-only">Comentarios del recibo</label><textarea id="receipt-notes" rows={2} className={`${fieldClass} mt-3 h-auto min-h-20 py-3`} placeholder="Agrega una observación al recibo…" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></details>
          </div>}
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-xs dark:bg-slate-900"><div className="flex items-center justify-between gap-3 text-slate-500"><span>{advance?'Disponible del anticipo':'Importe recibido'}</span><span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoney(Number.isFinite(received)?received:0,currency)}</span></div><div className="flex items-center justify-between gap-3 text-slate-500"><span>Aplicación a documentos</span><span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoney(allocated,currency)}</span></div><div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 dark:border-slate-700"><span className={remaining<0?'font-semibold text-rose-700 dark:text-rose-300':'font-semibold text-emerald-700 dark:text-emerald-300'}>{remaining<0?'Aplicación excedida':'Remanente disponible'}</span><span className={`font-bold tabular-nums ${remaining<0?'text-rose-700 dark:text-rose-300':'text-emerald-700 dark:text-emerald-300'}`}>{formatMoney(Number.isFinite(remaining)?remaining:0,currency)}</span></div></div>
          <p className="text-[11px] leading-relaxed text-slate-500">{remaining<0?'Reduce los importes aplicados o revisa el monto recibido antes de guardar.':'El importe no aplicado queda como anticipo del cliente en esta moneda.'}</p>
          <button className={`${primaryButtonClass} flex w-full items-center justify-center gap-2 !bg-[#B3282D] shadow-sm transition hover:!bg-[#932126] disabled:cursor-not-allowed`} disabled={busy||loading||remaining<0}>{busy?<LoaderCircle className="h-4 w-4 animate-spin" />:<CheckCircle2 className="h-4 w-4" />}{busy?'Guardando…':advance?'Aplicar anticipo':'Guardar recibo'}</button>
        </fieldset>
      <section className={`${cardClass} !p-0 xl:col-start-1 xl:row-start-2`} aria-labelledby="receipt-history-title"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800"><History className="h-4 w-4" /></span><div><h2 id="receipt-history-title" className="text-sm font-bold text-slate-900 dark:text-white">Historial de recibos</h2><p className="mt-1 text-xs text-slate-500">{customer?.nombre} · {currency}</p></div></div><span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-700">{data.receipts.length} recibos</span></div>
        {data.receipts.length>0?<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60"><tr><th scope="col" className="py-3 pl-5 pr-3 text-left">Recibo y fecha</th><th scope="col" className="p-3 text-left">Estado</th><th scope="col" className="p-3 text-right">Recibido</th><th scope="col" className="p-3 text-right">Aplicado</th><th scope="col" className="p-3 text-right">Anticipo disponible</th><th scope="col" className="py-3 pl-3 pr-5 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.receipts.slice(page*50,page*50+50).map(r=><tr key={r.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40"><td className="py-4 pl-5 pr-3"><p className="font-semibold text-slate-800 dark:text-slate-100">{r.receipt_number}</p><p className="mt-1 text-[11px] text-slate-500">{formatDate(r.payment_date)} · {r.payment_method}</p></td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${r.status==='Aplicado'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300':'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{r.status}</span></td><td className="whitespace-nowrap p-3 text-right text-xs font-medium tabular-nums">{formatMoney(Number(r.amount),currency)}</td><td className="whitespace-nowrap p-3 text-right text-xs tabular-nums text-slate-500">{formatMoney(Number(r.applied_amount),currency)}</td><td className={`whitespace-nowrap p-3 text-right text-xs font-semibold tabular-nums ${Number(r.unapplied_amount)>0?'text-emerald-700 dark:text-emerald-300':'text-slate-400'}`}>{formatMoney(Number(r.unapplied_amount),currency)}</td><td className="py-3 pl-3 pr-5"><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy||loading} className={`${financeButton} !px-3 !py-2`} onClick={()=>void receiptPdf(r)}><FileText className="h-3.5 w-3.5" />PDF</button>{Number(r.unapplied_amount)>0&&<button type="button" disabled={busy||loading} className={`${financeButton} !border-emerald-200 !text-emerald-700 dark:!border-emerald-900 dark:!text-emerald-300`} onClick={()=>{setAdvance(r);setAllocations({})}}>Aplicar anticipo<ArrowRight className="h-3 w-3" /></button>}{r.status==='Aplicado'&&<button type="button" disabled={busy||loading} className="rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/40" onClick={()=>{setReversal(r);setReason('')}}>Revertir</button>}</div></td></tr>)}</tbody></table></div>:<div className="px-5 py-10 text-center"><Receipt className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Todavía no hay recibos en {currency}</p><p className="mt-1 text-xs text-slate-500">Los pagos que registres aparecerán aquí con su detalle y saldo disponible.</p></div>}
        {data.receipts.length>0&&<div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800"><span className="text-xs text-slate-500">Página {page+1} de {Math.max(1,Math.ceil(data.receipts.length/50))}</span><div className="flex gap-2"><button type="button" className={`${financeButton} !px-3 !py-2`} disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-3.5 w-3.5" />Anterior</button><button type="button" className={`${financeButton} !px-3 !py-2`} disabled={(page+1)*50>=data.receipts.length} onClick={()=>setPage(p=>p+1)}>Siguiente<ChevronRight className="h-3.5 w-3.5" /></button></div></div>}
      </section>
      </form>


    </>}

    <Dialog open={!!reversal} onOpenChange={open=>{if(!open&&!busy)setReversal(null)}}><DialogContent><DialogHeader><DialogTitle>Revertir {reversal?.receipt_number}</DialogTitle><DialogDescription>Se revertirán todas sus aplicaciones y se restaurarán los saldos. El historial conservará el recibo y el reverso.</DialogDescription></DialogHeader><label htmlFor="receipt-reversal-reason" className="text-xs font-semibold text-slate-600">Motivo del reverso</label><textarea id="receipt-reversal-reason" className={`${fieldClass} h-auto min-h-24 py-3`} maxLength={2000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/><div className="flex justify-end gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={()=>setReversal(null)}>Cancelar</button><button type="button" className={primaryButtonClass} disabled={busy||!reason.trim()} onClick={()=>void reverse()}>Confirmar reverso</button></div></DialogContent></Dialog>
  </div>
}
