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
import { FinancePageHeader, financeLinkClass } from '@/src/components/invoicing/FinanceWorkspace'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { Pagination } from '@/src/components/ui/Pagination'
import { Plus, ReceiptText, Trash2 } from 'lucide-react'
import { BillingOfficeSelect } from '@/src/components/invoicing/BillingOfficeSelect'
import { PdfDownloadButton } from '@/src/components/pdf/PdfDownloadButton'
import { FiscalVoidControl } from '@/src/components/invoicing/FiscalVoidControl'
import { PurchaseFiscalPdf } from '@/src/components/pdf/purchase-fiscal-pdf'
import { invoiceLineAmounts } from '@/src/lib/invoice-fiscal'
import { InvoiceLineSettingsProvider, ServiceCatalogSelect, ServiceLineAccountSelect } from '@/src/components/invoicing/InvoiceLineSettings'
import { SupplierExpenseAccountSelect } from '@/src/components/suppliers/SupplierExpenseAccountSelect'
import { applyPurchaseAccountDefault, type PurchaseAccountSource } from '@/src/lib/supplier-accounting'
import type { ServiceSourceKind, ServiceTaxVariant } from '@/src/lib/service-accounting'
import type { PurchaseFiscalDocument } from '@/src/lib/purchase-documents'
import { formatDate,formatMoney,toDateInputValue } from '@/src/lib/format'
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/src/components/ui/dialog'
import { cardClass,fieldClass,primaryButtonClass,secondaryButtonClass } from '@/src/lib/ui-classes'
type Supplier={id:string;nombre:string;default_expense_account_id:string|null}
type Payable={id:string;proveedor_id:string;descripcion:string;numero_factura_proveedor:string|null;moneda:string;pending_balance:number}
type Row={id:string;document_type?:string;document_number:string;issue_date:string;currency:string;total:number;status:string;payable_id:string;supplier_snapshot:{name:string};table:'purchase_documents'|'withholding_documents'}
const blankLine=()=>({id:crypto.randomUUID(),description:'',quantity:'1',unit_price:'',discount_amount:'0',tax_rate:'0',tax_credit:false,account_id:'',account_source:'default' as PurchaseAccountSource,base:'',rate:'',service_catalog_kind:undefined as ServiceSourceKind|undefined,service_catalog_code:'',service_tax_variant:undefined as ServiceTaxVariant|undefined})
export default function PurchasesPage(){
 const params=useSearchParams(),requestedDocument=params.get('document'),requestedTable=params.get('table')
 const documentVersion=useRef(0)
 const {context,data,error,loading,isCurrent}=useAccounting(),lock=useRef(false),request=useRef({signature:'',id:''}),version=useRef(0)
 const [resources,setResources]=useState<{context:string;suppliers:Supplier[];payables:Payable[]}|null>(null),[readError,setReadError]=useState('')
 const [history,setHistory]=useState<{key:string;rows:Row[]}|null>(null),[from,setFrom]=useState(()=>toDateInputValue().slice(0,7)+'-01'),[to,setTo]=useState(toDateInputValue),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(50)
 const [editor,setEditor]=useState(''),[kind,setKind]=useState('Factura de proveedor'),[supplier,setSupplier]=useState(''),[documentAccount,setDocumentAccount]=useState(''),[office,setOffice]=useState<string|null>(null),[payable,setPayable]=useState('')
 const [date,setDate]=useState(toDateInputValue),[due,setDue]=useState(''),[currency,setCurrency]=useState('HNL'),[rate,setRate]=useState(''),[number,setNumber]=useState(''),[notes,setNotes]=useState('')
 const [identity,setIdentity]=useState(''),[address,setAddress]=useState(''),[phone,setPhone]=useState(''),[sourceCai,setSourceCai]=useState('')
 const [lines,setLines]=useState<ReturnType<typeof blankLine>[]>([]),[busy,setBusy]=useState(false),[selected,setSelected]=useState<{context:string;document:PurchaseFiscalDocument;table:Row['table']}|null>(null)
 const key=`${context}:${from}:${to}`,current=resources?.context===context?resources:null,rows=history?.key===key?history.rows:null,retention=kind==='Comprobante de Retención'
 const load=useCallback(async()=>{
  const run=++version.current;setReadError('')
  try{
   const [suppliers,payables,purchases,retentions]=await Promise.all([
    readAllReportRows<Supplier>((a,b)=>supabase.from('proveedores').select('id,nombre,default_expense_account_id').eq('is_active',true).order('nombre').order('id').range(a,b),{label:'proveedores'}),
    readAllReportRows<Payable>((a,b)=>supabase.from('supplier_payable_balances').select('id,proveedor_id,descripcion,numero_factura_proveedor,moneda,pending_balance').gt('pending_balance',0).eq('needs_reconciliation',false).neq('status','Anulada').order('id').range(a,b),{label:'compras pendientes'}),
    readAllReportRows<Omit<Row,'table'>>((a,b)=>supabase.from('purchase_documents').select('id,document_type,document_number,issue_date,currency,total,status,payable_id,supplier_snapshot').gte('issue_date',from).lte('issue_date',to).order('id').range(a,b),{label:'compras'}),
    readAllReportRows<Omit<Row,'table'>>((a,b)=>supabase.from('withholding_documents').select('id,document_number,issue_date,currency,total,status,payable_id,supplier_snapshot').gte('issue_date',from).lte('issue_date',to).order('id').range(a,b),{label:'retenciones'}),
   ])
   if(run===version.current&&isCurrent()){setResources({context,suppliers,payables});setHistory({key,rows:[...purchases.map(r=>({...r,table:'purchase_documents' as const})),...retentions.map(r=>({...r,table:'withholding_documents' as const}))].sort((a,b)=>b.issue_date.localeCompare(a.issue_date)||b.document_number.localeCompare(a.document_number))})}
  }catch(e){if(run===version.current){setHistory(null);setReadError((e as Error).message)}}
 },[context,from,to,key,isCurrent])
 useEffect(()=>{const timer=setTimeout(()=>{setPage(0);void load()},0);return()=>clearTimeout(timer)},[load])
 function newDocument(){setEditor(context);setLines([blankLine()]);setSupplier('');setDocumentAccount('');setOffice(null);setPayable('');setDate(toDateInputValue());setDue('');setNumber('');setNotes('');setIdentity('');setAddress('');setPhone('');setSourceCai('')}
 const change=(id:string,field:string,value:string|boolean)=>setLines(prev=>prev.map(l=>l.id===id?{...l,[field]:value,...(field==='account_id'?{account_source:'manual' as const}:{})}:l))
 function changeDocumentAccount(value:string){setDocumentAccount(value);setLines(prev=>applyPurchaseAccountDefault(prev,value))}
 function changeSupplier(value:string){setSupplier(value);changeDocumentAccount(current?.suppliers.find(s=>s.id===value)?.default_expense_account_id||'')}
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
  const document={document_type:kind,supplier_id:supplier,expense_account_id:documentAccount||null,office_id:office,issue_date:date,due_date:due||null,currency,exchange_rate:currency==='HNL'?1:Number(rate),document_number:number,notes,supplier_identity:identity,supplier_address:address,supplier_phone:phone,source_cai:sourceCai}
  const items=retention?lines.map(l=>({description:l.description,base:Number(l.base),rate:Number(l.rate)})):lines.map(l=>({description:l.description,quantity:Number(l.quantity),unit_price:Number(l.unit_price),discount_amount:Number(l.discount_amount),tax_rate:Number(l.tax_rate),tax_credit:kind==='Boleta de Compra'?false:l.tax_credit,account_id:l.account_id||null,service_catalog_kind:l.service_catalog_kind||null,service_catalog_code:l.service_catalog_code||null,service_tax_variant:l.service_tax_variant||null}))
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
 // Importe por línea: neto + ISV (compras) o retención sobre la base.
 const lineTotal=(l:ReturnType<typeof blankLine>)=>{if(retention)return Math.round(Number(l.base)*Number(l.rate))/100;const net=invoiceLineAmounts(Number(l.quantity),Number(l.unit_price),Number(l.discount_amount)).net;return{net,tax:Math.round(net*Number(l.tax_rate))/100}}
 let subtotal=0,tax=0,preview=0,previewError=''
 try{for(const l of lines){const t=lineTotal(l);if(typeof t==='number')preview+=t;else{subtotal+=t.net;tax+=t.tax;preview+=t.net+t.tax}}}catch(e){previewError=e instanceof Error?e.message:'Revisa los importes.'}
 const shownLineTotal=(l:ReturnType<typeof blankLine>)=>{try{const t=lineTotal(l);return formatMoney(typeof t==='number'?t:t.net+t.tax,documentCurrency)}catch{return '—'}}
 const reference=(l:ReturnType<typeof blankLine>)=>l.service_catalog_kind&&l.service_catalog_code?{kind:l.service_catalog_kind,code:l.service_catalog_code}:undefined
 const variant=(l:ReturnType<typeof blankLine>)=>l.service_tax_variant||(Number(l.tax_rate)>0?'I':'E')
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Compras y documentos fiscales" description="Compras, documentos fiscales de proveedores y su contabilización." icon={ReceiptText}/><AccountingNav/>
 {(error||readError)&&<p role="alert" className="text-red-600">{error||readError} <button className={financeLinkClass} onClick={()=>void load()}>Reintentar</button></p>}{loading&&<p>Cargando configuración…</p>}
 {data&&current&&<><div className="flex flex-wrap gap-3"><button className={primaryButtonClass} disabled={busy} onClick={newDocument}>Registrar documento</button><Link className={secondaryButtonClass} href="/suppliers">Proveedores</Link><Link className={secondaryButtonClass} href="/accounts-payable">Cuentas por pagar</Link></div>
 {editor===context&&<form className={`${cardClass} space-y-8`} onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="space-y-8"><legend className="sr-only">Nuevo documento</legend>
 <FormSection title="Documento" description={retention?'El número fiscal se asignará del CAI vigente de la oficina al emitir.':kind==='Boleta de Compra'?'El número fiscal se asignará del CAI vigente de la oficina al registrar.':'Datos de la factura recibida del proveedor.'}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  <FormField label="Tipo de documento" required><select className={fieldClass} value={kind} onChange={e=>{setKind(e.target.value);setLines([blankLine()])}}><option>Factura de proveedor</option><option>Boleta de Compra</option><option>Comprobante de Retención</option></select></FormField>
  <FormField label="Proveedor" required className="lg:col-span-2"><select required className={fieldClass} value={supplier} onChange={e=>{changeSupplier(e.target.value);setPayable('')}}><option value="">Seleccionar proveedor</option>{current.suppliers.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></FormField>
  <FormField label="Fecha de emisión" required><input type="date" required max={toDateInputValue()} className={fieldClass} value={date} onChange={e=>setDate(e.target.value)}/></FormField>
  {!retention&&<FormField label="Vencimiento"><input type="date" className={fieldClass} value={due} onChange={e=>setDue(e.target.value)}/></FormField>}
  <BillingOfficeSelect label={kind==='Factura de proveedor'?'Oficina emisora (opcional)':'Oficina emisora'} required={kind!=='Factura de proveedor'} value={office||''} onChange={value=>setOffice(value||null)} disabled={busy}/>
  {retention?<FormField label="Compra a la que se aplica" required><select required className={fieldClass} value={payable} onChange={e=>setPayable(e.target.value)}><option value="">Seleccionar cuenta pendiente</option>{current.payables.filter(p=>p.proveedor_id===supplier).map(p=><option key={p.id} value={p.id}>{p.numero_factura_proveedor||p.descripcion} · {formatMoney(Number(p.pending_balance),p.moneda)}</option>)}</select></FormField>
  :<><FormField label="Moneda" required><select className={fieldClass} value={currency} onChange={e=>setCurrency(e.target.value)}><option>HNL</option><option>USD</option></select></FormField>{currency==='USD'&&<FormField label="HNL por USD" required><NumberInput type="number" required min="0.000001" step="0.000001" max="1000000" className={fieldClass} value={rate} onChange={e=>setRate(e.target.value)}/></FormField>}</>}
  {kind==='Factura de proveedor'&&<><FormField label="N.º factura del proveedor" required><input required maxLength={120} className={fieldClass} value={number} onChange={e=>setNumber(e.target.value)}/></FormField><FormField label="CAI de la factura del proveedor" hint="Solo si la factura lo incluye."><input maxLength={100} className={fieldClass} value={sourceCai} onChange={e=>setSourceCai(e.target.value)}/></FormField></>}
 </div></FormSection>
 {kind==='Boleta de Compra'&&<FormSection title="Datos del proveedor" description="La boleta no respalda crédito fiscal de ISV. Contabilidad debe verificar la procedencia y los límites de deducción de esta compra."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><FormField label="RTN o identidad" required><input required maxLength={30} className={fieldClass} value={identity} onChange={e=>setIdentity(e.target.value)}/></FormField><FormField label="Teléfono" required><input required maxLength={50} className={fieldClass} value={phone} onChange={e=>setPhone(e.target.value)}/></FormField><FormField label="Domicilio" required className="sm:col-span-2 lg:col-span-3"><input required maxLength={500} className={fieldClass} value={address} onChange={e=>setAddress(e.target.value)}/></FormField></div></FormSection>}
 {!retention&&<FormField as="div" label="Cuenta predeterminada de esta compra" hint="Inicialmente usa la del proveedor. Cambiarla conserva las cuentas elegidas manualmente por línea."><SupplierExpenseAccountSelect accounts={data.accounts} value={documentAccount} onChange={changeDocumentAccount} label="Cuenta predeterminada de esta compra" disabled={busy}/></FormField>}
 <FormSection title={retention?'Conceptos de retención':'Líneas de la compra'} description={retention?'Los conceptos y porcentajes deben corresponder al respaldo aprobado por Contabilidad.':undefined} actions={<button type="button" className={`${secondaryButtonClass} inline-flex items-center gap-2`} disabled={lines.length>=(retention?20:200)} onClick={()=>setLines(prev=>[...prev,{...blankLine(),account_id:documentAccount}])}><Plus className="h-4 w-4"/>Agregar línea</button>}>
 <InvoiceLineSettingsProvider><div className="space-y-4">{lines.map((line,index)=><div key={line.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700/60">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-900 dark:text-white">Línea {index+1}</p><div className="flex items-center gap-4"><span className="text-sm font-semibold tabular-nums">{shownLineTotal(line)}</span><button type="button" disabled={lines.length<2} aria-label={`Quitar línea ${index+1}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 disabled:opacity-40 dark:text-red-400" onClick={()=>setLines(prev=>prev.filter(l=>l.id!==line.id))}><Trash2 className="h-4 w-4"/>Quitar</button></div></div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {!retention&&<><FormField as="div" label="Servicio de catálogo (opcional)" className="sm:col-span-2"><ServiceCatalogSelect side="expense" disabled={busy} reference={reference(line)} variant={variant(line)} onClear={()=>setLines(previous=>previous.map(item=>item.id===line.id?{...item,service_catalog_kind:undefined,service_catalog_code:''}:item))} onSelect={service=>{const taxVariant=service.tax_variant||(service.taxable?'I':'E');setLines(previous=>previous.map(item=>item.id===line.id?{...item,description:service.label,tax_rate:taxVariant==='I'?'15':'0',account_id:'',account_source:'service' as const,service_catalog_kind:service.kind,service_catalog_code:service.code,service_tax_variant:taxVariant}:item))}}/></FormField>
  <FormField as="div" label="Cuenta de costo / gasto / activo" className="sm:col-span-2"><ServiceLineAccountSelect side="expense" accountId={line.account_id} onAccount={id=>change(line.id,'account_id',id)} manualAccounts={data.accounts} disabled={busy} reference={reference(line)} variant={variant(line)}/></FormField></>}
  <FormField label="Concepto" required className="sm:col-span-2"><input required maxLength={500} className={fieldClass} value={line.description} onChange={e=>change(line.id,'description',e.target.value)}/></FormField>
  {retention?<><FormField label={`Base ${documentCurrency}`} required><NumberInput type="number" required min="0.01" step="0.01" className={fieldClass} value={line.base} onChange={e=>change(line.id,'base',e.target.value)}/></FormField><FormField label="Retención %" required><NumberInput type="number" required min="0.0001" max="100" step="0.0001" className={fieldClass} value={line.rate} onChange={e=>change(line.id,'rate',e.target.value)}/></FormField></>
  :<><FormField label="Cantidad" required><NumberInput type="number" required min="0.0001" step="0.0001" className={fieldClass} value={line.quantity} onChange={e=>change(line.id,'quantity',e.target.value)}/></FormField><FormField label={`Precio unitario ${currency}`} required><NumberInput type="number" required min="0" step="0.01" className={fieldClass} value={line.unit_price} onChange={e=>change(line.id,'unit_price',e.target.value)}/></FormField>
  <FormField label={`Descuento ${currency}`}><NumberInput type="number" required min="0" step="0.01" className={fieldClass} value={line.discount_amount} onChange={e=>change(line.id,'discount_amount',e.target.value)}/></FormField>
  <FormField label="ISV"><select className={fieldClass} value={line.tax_rate} onChange={e=>setLines(previous=>previous.map(item=>item.id===line.id?{...item,tax_rate:e.target.value,service_tax_variant:undefined}:item))}><option value="0">Sin ISV</option><option value="15">15%</option><option value="18">18%</option></select></FormField>
  <label className="flex h-12 items-center gap-2 self-end text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4" checked={kind==='Boleta de Compra'?false:line.tax_credit} disabled={kind==='Boleta de Compra'||line.tax_rate==='0'} onChange={e=>change(line.id,'tax_credit',e.target.checked)}/>ISV acreditable</label></>}
  </div></div>)}</div></InvoiceLineSettingsProvider></FormSection>
 <div className="grid gap-6 border-t border-slate-100 pt-6 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_20rem]">
  {!retention&&<FormField label="Observaciones"><textarea rows={3} maxLength={2000} className={`${fieldClass} h-auto py-3`} value={notes} onChange={e=>setNotes(e.target.value)}/></FormField>}
  <div className="space-y-4 lg:col-start-2"><dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900/60">{!retention&&<><div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">Subtotal</dt><dd className="tabular-nums">{previewError?'—':formatMoney(subtotal,documentCurrency)}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500 dark:text-slate-400">ISV</dt><dd className="tabular-nums">{previewError?'—':formatMoney(tax,documentCurrency)}</dd></div></>}<div className={`flex justify-between gap-4 text-base font-bold ${retention?'':'border-t border-slate-200 pt-2 dark:border-slate-700'}`}><dt>{retention?'Total retenido':'Total'}</dt><dd className="tabular-nums">{previewError?'—':formatMoney(preview,documentCurrency)}</dd></div></dl>
  {previewError&&<p role="alert" className="text-sm text-red-600">{previewError}</p>}
  <div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondaryButtonClass} onClick={()=>setEditor('')}>Cancelar</button><button className={primaryButtonClass} disabled={busy||preview<=0||!!previewError}>{busy?'Registrando…':kind==='Factura de proveedor'?'Registrar compra':'Emitir documento fiscal'}</button></div></div>
 </div></fieldset></form>}
 <section className={`${cardClass} space-y-4`}><div className="grid max-w-md grid-cols-2 gap-4"><FormField label="Desde"><input type="date" className={fieldClass} value={from} onChange={e=>setFrom(e.target.value)}/></FormField><FormField label="Hasta"><input type="date" className={fieldClass} value={to} onChange={e=>setTo(e.target.value)}/></FormField></div>
 <div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400"><th className="p-2">Fecha / documento</th><th className="p-2">Proveedor</th><th className="p-2">Tipo</th><th className="p-2 text-right">Total</th><th className="p-2">Estado</th><th className="p-2">Acciones</th></tr></thead><tbody>{rows?.slice(page*pageSize,(page+1)*pageSize).map(r=><tr className="border-t" key={r.id}><td className="p-2">{formatDate(r.issue_date)}<p>{r.document_number}</p></td><td className="p-2">{r.supplier_snapshot.name}</td><td className="p-2">{r.document_type||'Retención'}</td><td className="p-2 text-right tabular-nums">{formatMoney(Number(r.total),r.currency)}</td><td className="p-2">{r.status}</td><td className="p-2"><div className="flex gap-3"><button className={financeLinkClass} onClick={()=>void openDocument(r.table,r.id)}>Ver / PDF</button><Link className={financeLinkClass} href={`/accounts-payable/${r.payable_id}`}>Saldo y pagos</Link></div></td></tr>)}</tbody></table></div>
 {rows&&!rows.length&&<p className="py-5">No hay documentos en este período.</p>}{rows&&rows.length>0&&<Pagination page={page+1} pageSize={pageSize} total={rows.length} onPageChange={p=>setPage(p-1)} onPageSizeChange={size=>{setPageSize(size);setPage(0)}}/>}</div></section></>}
 <Dialog open={selected?.context===context} onOpenChange={open=>{if(!open){documentVersion.current++;setSelected(null)}}}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{selected?.document.document_number}</DialogTitle><DialogDescription>Documento guardado con su emisor, detalle fiscal y cuenta por pagar.</DialogDescription></DialogHeader>{selected?.context===context&&<div className="space-y-3"><p>{selected.document.supplier_snapshot.name} · {selected.document.status}</p><p>Total: {formatMoney(Number(selected.document.total),selected.document.currency)}</p><PdfDownloadButton document={<PurchaseFiscalPdf data={selected.document}/>} fileName={`${selected.document.document_number}.pdf`} className={primaryButtonClass}>Descargar PDF</PdfDownloadButton><FiscalVoidControl table={selected.table} documentId={selected.document.id} status={selected.document.status} onChanged={()=>{void openDocument(selected.table,selected.document.id);void load()}}/><Link className="block text-[#B3282D] underline underline-offset-4 dark:text-rose-300" href={`/accounts-payable/${selected.document.payable_id}`}>Ver saldo y pagos</Link></div>}</DialogContent></Dialog>
 </div>
}
