'use client'

import Link from 'next/link'
import { AlertCircle, ArrowDownLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Clock, FileText, Filter, History, LoaderCircle, Search, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { useBillingClients } from '@/src/hooks/useBillingClients'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { FinanceEmptyState, FinanceMetric, FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { readAllReportRows } from '@/src/lib/report-query'
import { customerStatement, type CustomerMovement } from '@/src/lib/customer-statement'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { cardClass, fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'
import type { ReportPdfData } from '@/src/components/pdf/report-pdf'

const kinds=['Factura','Nota de Crédito','Nota de Débito','Pago','Reverso','Anulación']
type Snapshot={context:string;client:string;name:string;from:string;to:string;currency:string;movements:CustomerMovement[]}
export default function CustomerStatementsPage() {
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`
  const identity=useRef(context)
  useEffect(()=>{identity.current=context;return()=>{identity.current=''}},[context])
  const version=useRef(0)
  const {clients,loading:clientsLoading,error:clientsError,reload:reloadClients}=useBillingClients(context)
  const [client,setClient]=useState(''),[currency,setCurrency]=useState('HNL')
  const [from,setFrom]=useState(()=>toDateInputValue().slice(0,7)+'-01'),[to,setTo]=useState(toDateInputValue)
  const [selectedKinds,setSelectedKinds]=useState<string[]>([]),[snapshot,setSnapshot]=useState<Snapshot|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(0)
  useEffect(()=>{
    const timer=setTimeout(()=>{
      setClient('');setSnapshot(null)
    },0)
    return()=>clearTimeout(timer)
  },[context])
  async function load() {
    if(clientsLoading||!clients.some(customer=>customer.id===client)||!from||!to||from>to){setError('Selecciona cliente y un período válido.');return}
    const run=++version.current,owner=context
    setLoading(true);setError('');setSnapshot(null);setPage(0)
    try {
      const movements=await readAllReportRows<CustomerMovement>((a,b)=>supabase.from('customer_movements')
        .select('id,movement_date,created_at,currency,kind,debit,credit,reference,description,invoice_id,receipt_id,reconstructed')
        .eq('cliente_id',client).eq('currency',currency).lte('movement_date',to).order('movement_date').order('created_at').order('id').range(a,b),
        {label:'movimientos del cliente',isCurrent:()=>run===version.current&&identity.current===owner})
      if(run===version.current&&identity.current===owner)setSnapshot({context:owner,client,name:clients.find(c=>c.id===client)?.nombre||'',from,to,currency,movements})
    }catch(e){if(run===version.current&&identity.current===owner)setError(e instanceof Error?e.message:'No se pudo consultar el estado.')}
    finally{if(run===version.current&&identity.current===owner)setLoading(false)}
  }
  const current=snapshot?.context===context && snapshot.client===client && snapshot.from===from && snapshot.to===to && snapshot.currency===currency ? snapshot : null
  const statement=current?customerStatement(current.movements,current.from,current.to,current.currency,selectedKinds):null
  const report:ReportPdfData={title:'Estado de cuenta consolidado',subtitle:current?.name||'',dateRange:`${formatDate(from)} — ${formatDate(to)}`,generatedAt:formatDate(new Date()),
    filters:[currency,selectedKinds.length?`Detalle filtrado: ${selectedKinds.join(', ')}. Los saldos incluyen todos los movimientos.`:'Todos los movimientos',
      ...(statement?.reconstructed?['Historial anterior reconstruido de registros disponibles; no certifica anulaciones previas.']:[])],
    metrics:statement?[{label:'Saldo inicial',value:formatMoney(statement.opening,currency)},{label:'Débitos del período',value:formatMoney(statement.debit,currency)},
      {label:'Créditos del período',value:formatMoney(statement.credit,currency)},{label:'Saldo final',value:formatMoney(statement.closing,currency)}]:[],
    columns:[{key:'date',label:'Fecha',width:'12%'},{key:'kind',label:'Tipo',width:'15%'},{key:'reference',label:'Documento / referencia',width:'25%'},
      {key:'debit',label:'Débito',align:'right'},{key:'credit',label:'Crédito',align:'right'},{key:'balance',label:'Saldo',align:'right'}],
    rows:statement?.rows.map(m=>({date:formatDate(m.movement_date),kind:m.kind,reference:m.reference,debit:Number(m.debit),credit:Number(m.credit),balance:m.balance}))||[]}
  return <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6">
    <FinancePageHeader title="Estado de cuenta consolidado" description="Consulta el movimiento financiero del cliente, revisa sus saldos y comparte el detalle del período." icon={FileText} actions={<Link href="/invoicing/collections" className={financeActionClass}><Wallet className="h-4 w-4" />Cobranza y recibos<ArrowRight className="h-3.5 w-3.5" /></Link>} />

    <form className={`${cardClass} !p-0`} onSubmit={e=>{e.preventDefault();void load()}}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:px-6"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-[#B3282D] dark:bg-rose-950/30 dark:text-rose-300"><Search className="h-4 w-4" /></span><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Prepara tu consulta</h2><p className="mt-0.5 text-xs text-slate-500">Cliente, período y moneda en un mismo lugar.</p></div></div>
      <fieldset disabled={loading} className="min-w-0 space-y-5 p-5 sm:p-6"><legend className="sr-only">Filtros del estado de cuenta</legend>
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,2fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)]"><div className="min-w-0 space-y-2 md:col-span-2 xl:col-span-1"><label htmlFor="statement-client" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cliente</label><ClienteCombobox key={context} id="statement-client" clientes={clients} value={client} onChange={setClient} loading={clientsLoading} disabled={loading||Boolean(clientsError)} placeholder="Buscar por nombre, código o RTN…" className={`${fieldClass} h-auto min-h-16 py-3`} /></div>
          <div className="space-y-2"><label htmlFor="statement-from" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Desde</label><input id="statement-from" className={`${fieldClass} h-16`} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div className="space-y-2"><label htmlFor="statement-to" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Hasta</label><input id="statement-to" className={`${fieldClass} h-16`} type="date" value={to} onChange={e=>setTo(e.target.value)}/></div><div className="space-y-2"><label htmlFor="statement-currency" className="text-xs font-semibold text-slate-600 dark:text-slate-300">Moneda</label><select id="statement-currency" className={`${fieldClass} h-16 font-semibold`} value={currency} onChange={e=>setCurrency(e.target.value)}><option value="HNL">HNL · Lempiras</option><option value="USD">USD · Dólares</option></select></div>
        </div>
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 dark:border-slate-800 xl:flex-row xl:items-end xl:justify-between"><fieldset className="min-w-0"><legend className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><Filter className="h-3.5 w-3.5" />Movimientos a mostrar</legend><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={!selectedKinds.length} onClick={()=>{setSelectedKinds([]);setPage(0)}} className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 ${!selectedKinds.length?'border-[#B3282D] bg-[#B3282D] text-white':'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'}`}>Todos</button>{kinds.map(kind=><label key={kind} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-medium transition focus-within:ring-2 focus-within:ring-rose-200 ${selectedKinds.includes(kind)?'border-rose-200 bg-rose-50 text-[#B3282D] dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300':'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900'}`}><input type="checkbox" className="h-3.5 w-3.5 accent-[#B3282D]" checked={selectedKinds.includes(kind)} onChange={e=>{setPage(0);setSelectedKinds(prev=>e.target.checked?[...prev,kind]:prev.filter(k=>k!==kind))}}/>{kind}</label>)}</div></fieldset>
          <button className={`${primaryButtonClass} inline-flex shrink-0 items-center justify-center gap-2 !bg-[#B3282D] transition hover:!bg-[#932126] disabled:cursor-not-allowed`} disabled={loading||clientsLoading||!client||Boolean(clientsError)}>{loading?<LoaderCircle className="h-4 w-4 animate-spin" />:<Search className="h-4 w-4" />}{loading?'Consultando…':'Consultar estado'}</button>
        </div>
      </fieldset>
      {clientsError&&<div role="alert" className="mx-5 mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="h-4 w-4" /><span className="flex-1">{clientsError}</span><button type="button" className="font-semibold underline" onClick={reloadClients}>Reintentar clientes</button></div>}
    </form>

    {error&&<p role="alert" className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="h-5 w-5 shrink-0" />{error}</p>}
    {!statement&&!loading&&!error&&!clientsError&&<FinanceEmptyState icon={History} title={client?'Listo para consultar su movimiento':'La historia de la cuenta, en un solo lugar'} description={client?'Define el período y presiona Consultar estado para ver saldos, facturas, notas y pagos.':'Selecciona un cliente y el período que deseas revisar. Encontrarás sus facturas, notas de crédito y débito, pagos y reversos.'} />}
    {loading&&<div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900"><LoaderCircle className="h-5 w-5 animate-spin text-[#B3282D]" />Preparando el estado de cuenta…</div>}

    {statement&&<>
      <section aria-label="Resumen del período" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{report.metrics.map((metric,index)=><FinanceMetric key={metric.label} label={metric.label} value={metric.value} detail={index===0?'Antes del inicio del período':index===1?'Cargos incluidos en el período':index===2?'Abonos incluidos en el período':'Incluye todos los movimientos de la cuenta'} icon={[Clock,ArrowUpRight,ArrowDownLeft,Wallet][index]} tone={(['slate','amber','emerald','rose'] as const)[index]} />)}</section>
      {statement.reconstructed&&<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>Los movimientos anteriores a la activación de este historial se reconstruyeron de los registros disponibles; las anulaciones previas pueden no estar representadas.</p></div>}
      {statement.filtered&&<div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-relaxed text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200"><Filter className="mt-0.5 h-4 w-4 shrink-0" /><p>El detalle está filtrado. Saldo inicial, saldo corrido y saldo final incluyen todos los movimientos del cliente en esta moneda.</p></div>}
      <section className={`${cardClass} !p-0`}><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 dark:border-slate-800"><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Movimiento de la cuenta</h2><p className="mt-1 text-xs text-slate-500">{current?.name} · {formatDate(from)} al {formatDate(to)} · {currency}</p></div><div className="flex items-center gap-3"><span className="hidden text-xs text-slate-400 sm:inline">Exportar reporte</span><FinancialReportExport data={report} filename={`estado-cuenta-${from}-${to}`}/></div></div>
        {statement.rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60"><tr>{report.columns.map(c=><th scope="col" key={c.key} className={`px-5 py-3 ${c.align==='right'?'text-right':'text-left'}`}>{c.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{statement.rows.slice(page*50,page*50+50).map(m=><tr key={m.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-900/40"><td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatDate(m.movement_date)}</td><td className="px-5 py-4"><span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ${m.kind==='Nota de Crédito'||m.kind==='Pago'?'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300':m.kind==='Reverso'||m.kind==='Anulación'?'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300':'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{m.kind}</span></td><td className="max-w-md px-5 py-4">{m.invoice_id?<Link className="text-xs font-semibold text-slate-800 underline-offset-4 hover:text-[#B3282D] hover:underline dark:text-slate-100" href={`/invoicing/${m.invoice_id}`}>{m.reference}</Link>:<span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{m.reference}</span>}<p className="mt-1 text-[11px] leading-relaxed text-slate-500">{m.description}</p></td><td className="whitespace-nowrap px-5 py-4 text-right text-xs tabular-nums">{formatMoney(Number(m.debit),currency)}</td><td className="whitespace-nowrap px-5 py-4 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-300">{formatMoney(Number(m.credit),currency)}</td><td className="whitespace-nowrap px-5 py-4 text-right text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(m.balance,currency)}</td></tr>)}</tbody></table></div>:<div className="py-12 text-center"><History className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Sin movimientos para este detalle</p><p className="mt-1 text-xs text-slate-500">Revisa el período o los tipos de movimiento seleccionados.</p></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800"><span className="text-xs text-slate-500">{statement.rows.length} movimientos · Página {page+1} de {Math.max(1,Math.ceil(statement.rows.length/50))}</span><div className="flex gap-2"><button type="button" className={`${financeActionClass} !px-3 !py-2`} disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft className="h-3.5 w-3.5" />Anterior</button><button type="button" className={`${financeActionClass} !px-3 !py-2`} disabled={(page+1)*50>=statement.rows.length} onClick={()=>setPage(p=>p+1)}>Siguiente<ChevronRight className="h-3.5 w-3.5" /></button></div></div>
      </section>
    </>}
  </div>
}
