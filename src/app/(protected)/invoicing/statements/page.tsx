'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { customerStatement, type CustomerMovement } from '@/src/lib/customer-statement'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { cardClass, fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'
import type { ReportPdfData } from '@/src/components/pdf/report-pdf'

const kinds=['Factura','Nota de Crédito','Nota de Débito','Pago','Reverso','Anulación']
type Client={id:string;nombre:string}
type Snapshot={context:string;client:string;name:string;from:string;to:string;currency:string;movements:CustomerMovement[]}
export default function CustomerStatementsPage() {
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`
  const identity=useRef(context)
  useEffect(()=>{identity.current=context;return()=>{identity.current=''}},[context])
  const version=useRef(0)
  const [clients,setClients]=useState<Client[]>([]),[client,setClient]=useState(''),[currency,setCurrency]=useState('HNL')
  const [from,setFrom]=useState(()=>toDateInputValue().slice(0,7)+'-01'),[to,setTo]=useState(toDateInputValue)
  const [selectedKinds,setSelectedKinds]=useState<string[]>([]),[snapshot,setSnapshot]=useState<Snapshot|null>(null)
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(0)
  useEffect(()=>{
    let current=true
    const timer=setTimeout(()=>{
      setClients([]);setClient('');setSnapshot(null)
      void readAllReportRows<Client>((a,b)=>supabase.from('clientes').select('id,nombre').order('nombre').order('id').range(a,b),{label:'clientes',isCurrent:()=>current})
        .then(rows=>{if(current)setClients(rows)}).catch(()=>{if(current)setError('No se pudieron cargar los clientes. Recarga la página.')})
    },0)
    return()=>{current=false;clearTimeout(timer)}
  },[context])
  async function load() {
    if(!client||!from||!to||from>to){setError('Selecciona cliente y un período válido.');return}
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
  return <div className="space-y-5 p-4 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><h1 className="text-2xl font-bold">Estado de cuenta consolidado</h1><Link href="/invoicing/collections" className="text-blue-700 underline">Cobranza y recibos</Link></div>
    <form className={`${cardClass} grid gap-3 md:grid-cols-5`} onSubmit={e=>{e.preventDefault();void load()}}>
      <label className="md:col-span-2">Cliente<select className={fieldClass} value={client} onChange={e=>setClient(e.target.value)}><option value="">Selecciona un cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <label>Desde<input className={fieldClass} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input className={fieldClass} type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
      <label>Moneda<select className={fieldClass} value={currency} onChange={e=>setCurrency(e.target.value)}><option>HNL</option><option>USD</option></select></label>
      <fieldset className="flex flex-wrap gap-3 md:col-span-5"><legend className="mb-2 text-sm">Tipos de movimiento (sin selección: todos)</legend>{kinds.map(kind=><label key={kind} className="flex gap-1 text-sm"><input type="checkbox" checked={selectedKinds.includes(kind)} onChange={e=>{setPage(0);setSelectedKinds(prev=>e.target.checked?[...prev,kind]:prev.filter(k=>k!==kind))}}/>{kind}</label>)}</fieldset>
      <button className={primaryButtonClass} disabled={loading||!client}>{loading?'Consultando…':'Consultar'}</button>
    </form>
    {error&&<p role="alert" className="text-red-600">{error}</p>}
    {statement&&<section className={`${cardClass} space-y-4`}><div className="grid gap-3 sm:grid-cols-4">{report.metrics.map(metric=><div key={metric.label}><p className="text-sm text-slate-500">{metric.label}</p><strong>{metric.value}</strong></div>)}</div>
      {statement.reconstructed&&<p className="text-sm text-amber-700">Los movimientos anteriores a la activación de este historial se reconstruyeron de los registros disponibles; las anulaciones previas pueden no estar representadas.</p>}
      {statement.filtered&&<p className="text-sm">El detalle está filtrado. Saldo inicial, saldo corrido y saldo final incluyen todos los movimientos del cliente en esta moneda.</p>}
      <FinancialReportExport data={report} filename={`estado-cuenta-${from}-${to}`}/>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{report.columns.map(c=><th key={c.key} className="p-2 text-left">{c.label}</th>)}</tr></thead><tbody>{statement.rows.slice(page*50,page*50+50).map(m=><tr key={m.id} className="border-t"><td className="p-2">{formatDate(m.movement_date)}</td><td className="p-2">{m.kind}</td><td className="p-2">{m.invoice_id?<Link className="underline" href={`/invoicing/${m.invoice_id}`}>{m.reference}</Link>:m.reference}<p className="text-xs text-slate-500">{m.description}</p></td><td className="p-2 text-right">{formatMoney(Number(m.debit),currency)}</td><td className="p-2 text-right">{formatMoney(Number(m.credit),currency)}</td><td className="p-2 text-right">{formatMoney(m.balance,currency)}</td></tr>)}</tbody></table></div>
      {!statement.rows.length&&<p>No hay movimientos para este detalle.</p>}
      <div className="flex gap-3 text-sm"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page+1} / {Math.max(1,Math.ceil(statement.rows.length/50))}</span><button disabled={(page+1)*50>=statement.rows.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
    </section>}
  </div>
}
