'use client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback,useEffect,useRef,useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { readAllReportRows } from '@/src/lib/report-query'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { NumberInput } from '@/src/components/ui/NumberInput'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { ReceiptText } from 'lucide-react'
import { BillingOfficeSelect } from '@/src/components/invoicing/BillingOfficeSelect'
import { PdfDownloadButton } from '@/src/components/pdf/PdfDownloadButton'
import { FiscalVoidControl } from '@/src/components/invoicing/FiscalVoidControl'
import { PurchaseFiscalPdf } from '@/src/components/pdf/purchase-fiscal-pdf'
import { invoiceLineAmounts } from '@/src/lib/invoice-fiscal'
import type { PurchaseFiscalDocument } from '@/src/lib/purchase-documents'
import { formatDate,formatMoney,toDateInputValue } from '@/src/lib/format'
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/src/components/ui/dialog'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass } from '@/src/lib/ui-classes'
type Supplier={id:string;nombre:string}
type Payable={id:string;proveedor_id:string;descripcion:string;numero_factura_proveedor:string|null;moneda:string;pending_balance:number}
type Row={id:string;document_type?:string;document_number:string;issue_date:string;currency:string;total:number;status:string;payable_id:string;supplier_snapshot:{name:string};table:'purchase_documents'|'withholding_documents'}
const blankLine=()=>({id:crypto.randomUUID(),description:'',quantity:'1',unit_price:'',discount_amount:'0',tax_rate:'0',tax_credit:false,account_id:'',base:'',rate:''})
export default function PurchasesPage(){
 const params=useSearchParams(),requestedDocument=params.get('document'),requestedTable=params.get('table')
 const documentVersion=useRef(0)
 const {context,data,error,loading,isCurrent}=useAccounting(),lock=useRef(false),request=useRef({signature:'',id:''}),version=useRef(0)
 const [resources,setResources]=useState<{context:string;suppliers:Supplier[];payables:Payable[]}|null>(null),[readError,setReadError]=useState('')
 const [history,setHistory]=useState<{key:string;rows:Row[]}|null>(null),[from,setFrom]=useState(()=>toDateInputValue().slice(0,7)+'-01'),[to,setTo]=useState(toDateInputValue),[page,setPage]=useState(0)
 const [editor,setEditor]=useState(''),[kind,setKind]=useState('Factura de proveedor'),[supplier,setSupplier]=useState(''),[office,setOffice]=useState<string|null>(null),[payable,setPayable]=useState('')
 const [date,setDate]=useState(toDateInputValue),[due,setDue]=useState(''),[currency,setCurrency]=useState('HNL'),[rate,setRate]=useState(''),[number,setNumber]=useState(''),[notes,setNotes]=useState('')
 const [identity,setIdentity]=useState(''),[address,setAddress]=useState(''),[phone,setPhone]=useState(''),[sourceCai,setSourceCai]=useState('')
 const [lines,setLines]=useState<ReturnType<typeof blankLine>[]>([]),[busy,setBusy]=useState(false),[selected,setSelected]=useState<{context:string;document:PurchaseFiscalDocument;table:Row['table']}|null>(null)
 const key=`${context}:${from}:${to}`,current=resources?.context===context?resources:null,rows=history?.key===key?history.rows:null,retention=kind==='Comprobante de Retención'
 const load=useCallback(async()=>{
  const run=++version.current;setReadError('')
  try{
   const [suppliers,payables,purchases,retentions]=await Promise.all([
    readAllReportRows<Supplier>((a,b)=>supabase.from('proveedores').select('id,nombre').eq('is_active',true).order('nombre').order('id').range(a,b),{label:'proveedores'}),
    readAllReportRows<Payable>((a,b)=>supabase.from('supplier_payable_balances').select('id,proveedor_id,descripcion,numero_factura_proveedor,moneda,pending_balance').gt('pending_balance',0).eq('needs_reconciliation',false).neq('status','Anulada').order('id').range(a,b),{label:'compras pendientes'}),
    readAllReportRows<Omit<Row,'table'>>((a,b)=>supabase.from('purchase_documents').select('id,document_type,document_number,issue_date,currency,total,status,payable_id,supplier_snapshot').gte('issue_date',from).lte('issue_date',to).order('id').range(a,b),{label:'compras'}),
    readAllReportRows<Omit<Row,'table'>>((a,b)=>supabase.from('withholding_documents').select('id,document_number,issue_date,currency,total,status,payable_id,supplier_snapshot').gte('issue_date',from).lte('issue_date',to).order('id').range(a,b),{label:'retenciones'}),
   ])
   if(run===version.current&&isCurrent()){setResources({context,suppliers,payables});setHistory({key,rows:[...purchases.map(r=>({...r,table:'purchase_documents' as const})),...retentions.map(r=>({...r,table:'withholding_documents' as const}))].sort((a,b)=>b.issue_date.localeCompare(a.issue_date)||b.document_number.localeCompare(a.document_number))})}
  }catch(e){if(run===version.current){setHistory(null);setReadError((e as Error).message)}}
 },[context,from,to,key,isCurrent])
 useEffect(()=>{const timer=setTimeout(()=>{setPage(0);void load()},0);return()=>clearTimeout(timer)},[load])
 function newDocument(){setEditor(context);setLines([blankLine()]);setSupplier('');setOffice(null);setPayable('');setDate(toDateInputValue());setDue('');setNumber('');setNotes('');setIdentity('');setAddress('');setPhone('');setSourceCai('')}
 const change=(id:string,field:string,value:string|boolean)=>setLines(prev=>prev.map(l=>l.id===id?{...l,[field]:value}:l))
 const openDocument=useCallback(async(table:Row['table'],id:string,active:()=>boolean=()=>true)=>{
  const run=++documentVersion.current
  const {data:document,error}=await supabase.from(table).select('*').eq('id',id).single()
  if(!active()||!isCurrent()||run!==documentVersion.current)return
  if(error){toast.error('No se pudo abrir el documento.');return}setSelected({context,document:document as PurchaseFiscalDocument,table})
 },[context,isCurrent,setSelected])
 const canOpen=Boolean(data)
 useEffect(()=>{
  if(!canOpen||!requestedDocument||!['purchase_documents','withholding_documents'].includes(requestedTable||''))return
  let active=true
  const timer=setTimeout(()=>void openDocument(requestedTable as Row['table'],requestedDocument,()=>active),0)
  return()=>{active=false;clearTimeout(timer)}
 },[canOpen,openDocument,requestedDocument,requestedTable])
 async function save(){
  if(lock.current||!current||editor!==context)return
  if(previewError){toast.error(previewError);return}
  const document={document_type:kind,supplier_id:supplier,office_id:office,issue_date:date,due_date:due||null,currency,exchange_rate:currency==='HNL'?1:Number(rate),document_number:number,notes,supplier_identity:identity,supplier_address:address,supplier_phone:phone,source_cai:sourceCai}
  const items=retention?lines.map(l=>({description:l.description,base:Number(l.base),rate:Number(l.rate)})):lines.map(l=>({description:l.description,quantity:Number(l.quantity),unit_price:Number(l.unit_price),discount_amount:Number(l.discount_amount),tax_rate:Number(l.tax_rate),tax_credit:kind==='Boleta de Compra'?false:l.tax_credit,account_id:l.account_id}))
  const signature=JSON.stringify({context,document,items,payable});if(request.current.signature!==signature)request.current={signature,id:crypto.randomUUID()}
  lock.current=true;setBusy(true)
  try{
   const result=retention?await supabase.rpc('create_withholding_document',{p_request_id:request.current.id,p_payable_id:payable,p_office_id:office,p_issue_date:date,p_items:items}):await supabase.rpc('create_purchase_document',{p_request_id:request.current.id,p_document:document,p_items:items})
   if(result.error)throw result.error
   if(isCurrent()){toast.success(retention?'Retención emitida y aplicada al saldo.':'Compra registrada y vinculada a Cuentas por Pagar.');setEditor('');request.current={signature:'',id:''};await load();await openDocument(retention?'withholding_documents':'purchase_documents',result.data)}
  }catch(e){if(isCurrent())toast.error((e as {message?:string}).message||'No se pudo registrar el documento.')}
  finally{lock.current=false;setBusy(false)}
 }
 const selectedPayable=current?.payables.find(p=>p.id===payable),documentCurrency=retention?selectedPayable?.moneda||currency:currency
 let preview=0,previewError=''
 try{preview=lines.reduce((sum,l)=>sum+(retention?Math.round(Number(l.base)*Number(l.rate))/100:(()=>{const net=invoiceLineAmounts(Number(l.quantity),Number(l.unit_price),Number(l.discount_amount)).net;return net+Math.round(net*Number(l.tax_rate))/100})()),0)}catch(e){previewError=e instanceof Error?e.message:'Revisa los importes.'}
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Compras y documentos fiscales" description="Compras, documentos fiscales de proveedores y su contabilización." icon={ReceiptText}/><AccountingNav/>
 {(error||readError)&&<p role="alert" className="text-red-600">{error||readError} <button onClick={()=>void load()}>Reintentar</button></p>}{loading&&<p>Cargando configuración…</p>}
 {data&&current&&<><div className="flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={busy} onClick={newDocument}>Registrar documento</button><Link className={secondaryButtonClass} href="/suppliers">Proveedores</Link><Link className={secondaryButtonClass} href="/accounts-payable">Cuentas por pagar</Link></div>
 {editor===context&&<form className={`${cardClass} space-y-4`} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="space-y-4"><legend className="font-semibold">Nuevo documento</legend><div className="grid gap-3 md:grid-cols-3">
 <label>Tipo<select className={fieldClass} value={kind} onChange={e=>{setKind(e.target.value);setLines([blankLine()])}}><option>Factura de proveedor</option><option>Boleta de Compra</option><option>Comprobante de Retención</option></select></label>
 <label>Proveedor<select required className={fieldClass} value={supplier} onChange={e=>{setSupplier(e.target.value);setPayable('')}}><option value="">Seleccionar proveedor</option>{current.suppliers.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
 <label>Fecha de emisión<input type="date" required max={toDateInputValue()} className={fieldClass} value={date} onChange={e=>setDate(e.target.value)}/></label>
 <div><p className="mb-1 text-sm">Oficina emisora {kind==='Factura de proveedor'?'(opcional)':'(obligatoria)'}</p><BillingOfficeSelect value={office||''} onChange={value=>setOffice(value||null)} disabled={busy}/></div>
 {retention?<label className="md:col-span-2">Compra a la que se aplica<select required className={fieldClass} value={payable} onChange={e=>setPayable(e.target.value)}><option value="">Seleccionar cuenta pendiente</option>{current.payables.filter(p=>p.proveedor_id===supplier).map(p=><option key={p.id} value={p.id}>{p.numero_factura_proveedor||p.descripcion} · {formatMoney(Number(p.pending_balance),p.moneda)}</option>)}</select></label>:<><label>Moneda<select className={fieldClass} value={currency} onChange={e=>setCurrency(e.target.value)}><option>HNL</option><option>USD</option></select></label>{currency==='USD'&&<label>HNL por USD<NumberInput type="number" required min="0.000001" step="0.000001" max="1000000" className={fieldClass} value={rate} onChange={e=>setRate(e.target.value)}/></label>}
 <label>Vencimiento (opcional)<input type="date" className={fieldClass} value={due} onChange={e=>setDue(e.target.value)}/></label>{kind==='Factura de proveedor'&&<label>N.º factura del proveedor<input required maxLength={120} className={fieldClass} value={number} onChange={e=>setNumber(e.target.value)}/></label>}</>}
 </div>
 {kind==='Boleta de Compra'&&<div className="grid gap-3 md:grid-cols-3"><label>RTN o identidad del proveedor<input required maxLength={30} className={fieldClass} value={identity} onChange={e=>setIdentity(e.target.value)}/></label><label>Domicilio del proveedor<input required maxLength={500} className={fieldClass} value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Teléfono del proveedor<input required maxLength={50} className={fieldClass} value={phone} onChange={e=>setPhone(e.target.value)}/></label><p className="text-sm text-slate-600 md:col-span-3">La boleta no respalda crédito fiscal de ISV. Contabilidad debe verificar la procedencia y los límites de deducción de esta compra.</p></div>}
 {kind==='Factura de proveedor'&&<label className="block">CAI de la factura del proveedor (si corresponde)<input maxLength={100} className={fieldClass} value={sourceCai} onChange={e=>setSourceCai(e.target.value)}/></label>}
 {kind!=='Factura de proveedor'&&<p className="text-sm text-slate-500">El número fiscal se asignará del CAI vigente de esta oficina al registrar. Los conceptos y porcentajes de retención deben corresponder al respaldo aprobado por Contabilidad.</p>}
 {lines.map((line,index)=><div key={line.id} className="grid gap-2 border-t pt-3 md:grid-cols-4"><label className="md:col-span-2">Concepto {index+1}<input required maxLength={500} className={fieldClass} value={line.description} onChange={e=>change(line.id,'description',e.target.value)}/></label>
 {retention?<><label>Base {documentCurrency}<NumberInput type="number" required min="0.01" step="0.01" className={fieldClass} value={line.base} onChange={e=>change(line.id,'base',e.target.value)}/></label><label>Retención %<NumberInput type="number" required min="0.0001" max="100" step="0.0001" className={fieldClass} value={line.rate} onChange={e=>change(line.id,'rate',e.target.value)}/></label></>:<><label>Cantidad<NumberInput type="number" required min="0.0001" step="0.0001" className={fieldClass} value={line.quantity} onChange={e=>change(line.id,'quantity',e.target.value)}/></label><label>Precio {currency}<NumberInput type="number" required min="0" step="0.01" className={fieldClass} value={line.unit_price} onChange={e=>change(line.id,'unit_price',e.target.value)}/></label>
 <label>Descuento {currency}<NumberInput type="number" required min="0" step="0.01" className={fieldClass} value={line.discount_amount} onChange={e=>change(line.id,'discount_amount',e.target.value)}/></label>
 <label className="md:col-span-2">Cuenta de costo / gasto / activo<select required className={fieldClass} value={line.account_id} onChange={e=>change(line.id,'account_id',e.target.value)}><option value="">Seleccionar cuenta</option>{data.accounts.filter(a=>a.active&&a.postable&&['Activo','Costo','Gasto'].includes(a.kind)).map(a=><option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label><label>ISV<select className={fieldClass} value={line.tax_rate} onChange={e=>change(line.id,'tax_rate',e.target.value)}><option value="0">Sin ISV</option><option value="15">15%</option><option value="18">18%</option></select></label><label className="flex items-center gap-2"><input type="checkbox" checked={kind==='Boleta de Compra'?false:line.tax_credit} disabled={kind==='Boleta de Compra'||line.tax_rate==='0'} onChange={e=>change(line.id,'tax_credit',e.target.checked)}/>ISV acreditable</label></>}
 <button type="button" disabled={lines.length<2} className="text-left text-red-600" onClick={()=>setLines(prev=>prev.filter(l=>l.id!==line.id))}>Quitar línea</button></div>)}
 <button type="button" className={secondaryButtonClass} disabled={lines.length>=(retention?20:200)} onClick={()=>setLines(prev=>[...prev,blankLine()])}>Agregar línea</button>
 {!retention&&<label className="block">Observaciones<textarea maxLength={2000} className={fieldClass} value={notes} onChange={e=>setNotes(e.target.value)}/></label>}
 <p role="alert" className="text-sm text-red-600">{previewError}</p><p className="font-bold">Total {formatMoney(preview,documentCurrency)}</p><div className="flex gap-2"><button className={primaryButtonClass} disabled={busy||preview<=0||!!previewError}>{busy?'Registrando…':kind==='Factura de proveedor'?'Registrar compra':'Emitir documento fiscal'}</button><button type="button" className={secondaryButtonClass} onClick={()=>setEditor('')}>Cancelar</button></div></fieldset></form>}
 <section className={`${cardClass} space-y-3`}><div className="flex flex-wrap gap-3"><label>Desde<input type="date" className={fieldClass} value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" className={fieldClass} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
 <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Fecha / documento</th><th>Proveedor</th><th>Tipo</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows?.slice(page*50,page*50+50).map(r=><tr className="border-t" key={r.id}><td className="p-2">{formatDate(r.issue_date)}<p>{r.document_number}</p></td><td>{r.supplier_snapshot.name}</td><td>{r.document_type||'Retención'}</td><td className="p-2 text-right">{formatMoney(Number(r.total),r.currency)}</td><td>{r.status}</td><td><div className="flex gap-2"><button className="text-[#B3282D] underline underline-offset-4 dark:text-rose-300" onClick={()=>void openDocument(r.table,r.id)}>Ver / PDF</button><Link className="text-[#B3282D] underline underline-offset-4 dark:text-rose-300" href={`/accounts-payable/${r.payable_id}`}>Saldo y pagos</Link></div></td></tr>)}</tbody></table></div>
 {rows&&!rows.length&&<p>No hay documentos en este período.</p>}<div className="flex gap-3"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page+1} / {Math.max(1,Math.ceil((rows?.length||0)/50))}</span><button disabled={(page+1)*50>=(rows?.length||0)} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div></section></>}
 <Dialog open={selected?.context===context} onOpenChange={open=>{if(!open){documentVersion.current++;setSelected(null)}}}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.document.document_number}</DialogTitle><DialogDescription>Documento guardado con su emisor, detalle fiscal y cuenta por pagar.</DialogDescription></DialogHeader>{selected?.context===context&&<div className="space-y-3"><p>{selected.document.supplier_snapshot.name} · {selected.document.status}</p><p>Total: {formatMoney(Number(selected.document.total),selected.document.currency)}</p><PdfDownloadButton document={<PurchaseFiscalPdf data={selected.document}/>} fileName={`${selected.document.document_number}.pdf`} className={primaryButtonClass}>Descargar PDF</PdfDownloadButton><FiscalVoidControl table={selected.table} documentId={selected.document.id} status={selected.document.status} onChanged={()=>{void openDocument(selected.table,selected.document.id);void load()}}/><Link className="block text-[#B3282D] underline underline-offset-4 dark:text-rose-300" href={`/accounts-payable/${selected.document.payable_id}`}>Ver saldo y pagos</Link></div>}</DialogContent></Dialog>
 </div>
}
