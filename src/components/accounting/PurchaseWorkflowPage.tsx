'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { cardClass, fieldClass, fieldClassSm, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { canManagePurchaseWorkflow, purchaseExpenseAccounts, selectPurchaseExpenseAccount, newPurchaseWorkflowLine, purchaseWorkflowDueDate, purchaseWorkflowAmounts, purchaseWorkflowRemaining,
  type PurchaseAllocation, type PurchaseWorkflowDocument, type PurchaseWorkflowKind, type PurchaseWorkflowLine } from '@/src/lib/purchase-workflow'
import type { FiscalMode } from '@/src/lib/invoice-fiscal'
import type { AccountingAccount } from '@/src/lib/accounting'
import { AccountingNav } from './AccountingNav'
import { PurchaseNavigation } from './PurchaseNavigation'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { BillingOfficeSelect } from '@/src/components/invoicing/BillingOfficeSelect'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { FinanceNumberInput as NumberInput } from '@/src/components/ui/FinanceNumberInput'
import { Pagination } from '@/src/components/ui/Pagination'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/src/components/ui/dialog'
import { PdfDownloadButton } from '@/src/components/pdf/PdfDownloadButton'
import { PurchaseWorkflowPdf } from '@/src/components/pdf/purchase-workflow-pdf'
import { UnsavedChangesGuard, markFormSaved, requestFormNavigation } from '@/src/components/ui/UnsavedChangesGuard'

type Supplier = { id: string; nombre: string; terminos_pago: number; moneda: string; default_expense_account_id: string | null }
type Event = { id: string; action: string; reason: string; actor_id: string; revision: number; created_at: string }
type Resources = { context: string; documents: PurchaseWorkflowDocument[]; suppliers: Supplier[]; accounts: AccountingAccount[]; allocations: PurchaseAllocation[] }
type Form = Pick<PurchaseWorkflowDocument, 'kind' | 'issue_date' | 'due_date' | 'currency' | 'exchange_rate' | 'fiscal_mode' | 'payment_condition' | 'payment_method' | 'payment_reference' | 'supplier_reference' | 'supplier_cai' | 'internal_notes' | 'commercial_notes'> & { supplier_id: string; office_id: string; supplier_address: string; items: PurchaseWorkflowLine[] }
type Command = { action: string; document?: PurchaseWorkflowDocument; form?: Form; reason?: string; invoice?: Record<string, string>; quantities?: { id: string; quantity: number }[] }

export function PurchaseWorkflowPage({ kind }: { kind: PurchaseWorkflowKind }) {
  const { user, profile, loading: userLoading } = useUser()
  const permitted = canManagePurchaseWorkflow(profile), tenant = profile?.tenant_id || ''
  const context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const owner = useRef(''), generation = useRef(0), lock = useRef(false), request = useRef({ signature: '', id: '' })
  const [resources, setResources] = useState<Resources | null>(null), [error, setError] = useState(''), [busyContext, setBusyContext] = useState('')
  const busy = busyContext === context
  const [editor, setEditor] = useState<{ context: string; document?: PurchaseWorkflowDocument } | null>(null)
  const [selection, setSelection] = useState<{ context: string; id: string } | null>(null)
  const [events, setEvents] = useState<{ context: string; id: string; rows: Event[]; error: string } | null>(null)
  const [reason, setReason] = useState<{ context: string; action: string; document: PurchaseWorkflowDocument } | null>(null)
  const [invoice, setInvoice] = useState<{ context: string; document: PurchaseWorkflowDocument } | null>(null)
  const [query, setQuery] = useState(''), [page, setPage] = useState(1), [size, setSize] = useState(25)
  useEffect(() => { owner.current = context; return () => { owner.current = '' } }, [context])
  const load = useCallback(async () => {
    if (!permitted || !tenant) return
    const run = ++generation.current
    try {
      const [documents, suppliers, accounts, allocations] = await Promise.all([
        readAllReportRows<PurchaseWorkflowDocument>((a,b) => supabase.from('purchase_workflow_documents').select('*').eq('tenant_id',tenant).order('issue_date',{ascending:false}).order('id').range(a,b),{label:'solicitudes y órdenes'}),
        readAllReportRows<Supplier>((a,b) => supabase.from('proveedores').select('id,nombre,terminos_pago,moneda,default_expense_account_id').eq('tenant_id',tenant).eq('is_active',true).order('nombre').order('id').range(a,b),{label:'proveedores'}),
        readAllReportRows<AccountingAccount>((a,b) => supabase.from('accounting_accounts').select('*').eq('tenant_id',tenant).eq('active',true).eq('postable',true).eq('kind','Gasto').order('code').order('id').range(a,b),{label:'cuentas de compra'}),
        readAllReportRows<PurchaseAllocation>((a,b) => supabase.from('purchase_order_allocations').select('id,order_id,item_id,quantity,discount_amount,purchase_document_id,is_active').eq('tenant_id',tenant).order('id').range(a,b),{label:'cantidades facturadas'}),
      ])
      if (owner.current === context && generation.current === run) { setResources({context,documents,suppliers,accounts,allocations}); setError('') }
    } catch (e) { if (owner.current === context && generation.current === run) { setResources(null); setError((e as Error).message) } }
  }, [permitted, tenant, context])
  useEffect(() => { const timer = setTimeout(() => void load(),0); return () => clearTimeout(timer) }, [load])
  const selectedId = selection?.context === context ? selection.id : ''
  const loadEvents = useCallback(async () => {
    if (!selectedId || !permitted) return
    try {
      const rows = await readAllReportRows<Event>((a,b) => supabase.from('purchase_workflow_events').select('id,action,reason,actor_id,revision,created_at').eq('tenant_id',tenant).eq('document_id',selectedId).order('created_at').order('id').range(a,b),{label:'historial de aprobación'})
      if (owner.current === context) setEvents({context,id:selectedId,rows,error:''})
    } catch { if (owner.current === context) setEvents({context,id:selectedId,rows:[],error:'No se pudo cargar el historial.'}) }
  }, [selectedId, permitted, tenant, context])
  useEffect(() => { const timer = setTimeout(() => void loadEvents(),0); return () => clearTimeout(timer) }, [loadEvents])
  const current = permitted && resources?.context === context ? resources : null
  const selected = current?.documents.find(d => d.id === selectedId)
  const run = async (command: Command) => {
    if (!permitted || lock.current || owner.current !== context) return
    const args = { p_action: command.action, p_id: command.document?.id || null, p_revision: command.document?.revision || 0,
      p_document: command.form ? {...command.form,items:undefined} : command.invoice || {},
      p_items: command.form?.items || command.quantities || [], p_reason: command.reason || '' }
    const signature = JSON.stringify({context,args})
    if (request.current.signature !== signature) request.current = {signature,id:crypto.randomUUID()}
    lock.current = true; setBusyContext(context)
    try {
      const response = await supabase.rpc('manage_purchase_workflow',{p_request_id:request.current.id,...args})
      if (response.error) throw response.error
      if (owner.current !== context) return
      request.current = {signature:'',id:''}; markFormSaved(); setEditor(null); setReason(null); setInvoice(null)
      if (command.action !== 'invoice' && command.action !== 'order') setSelection({context,id:String(response.data)})
      toast.success(command.action === 'invoice' ? 'Factura registrada y cantidades vinculadas a la orden.' : command.action === 'order' ? 'Orden creada en borrador. Disponible en la pestaña Órdenes.' : 'Documento actualizado.')
      await load(); await loadEvents()
    } catch (e) { if (owner.current === context) toast.error((e as Error).message || 'No se pudo guardar. Reintenta con los mismos datos.') }
    finally { lock.current = false; if (owner.current === context) setBusyContext('') }
  }
  if (userLoading) return <p>Cargando permisos…</p>
  if (!permitted) return <p role="alert">Solo Admin y Contabilidad activos y aprobados pueden acceder a solicitudes y órdenes de compra.</p>
  const rows = (current?.documents || []).filter(d => d.kind === kind && `${d.document_number} ${d.supplier_snapshot.name || ''} ${d.status}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')))
  return <div className="space-y-6"><FinancePageHeader title={kind === 'Solicitud' ? 'Solicitudes de compra' : 'Órdenes de compra'} icon={ClipboardList} eyebrow="Contabilidad"
    description="Prepara, aprueba y consulta tus compras antes de registrar la factura del proveedor." />
    <AccountingNav /><PurchaseNavigation />
    {error && <p role="alert" className="text-red-700">{error} <button className={secondaryButtonClass} onClick={() => void load()}>Reintentar</button></p>}
    {!current && !error && <p>Cargando documentos…</p>}
    {current && <>
      <div className="flex flex-wrap items-end gap-3"><button className={primaryButtonClass} disabled={busy} onClick={() => requestFormNavigation(() => {setEditor({context});setSelection(null)})}><Plus className="mr-2 inline h-4 w-4" />{kind === 'Solicitud' ? 'Nueva solicitud' : 'Nueva orden'}</button>
        <FormField label="Buscar documento"><input className={fieldClass} value={query} onChange={e => {setQuery(e.target.value);setPage(1)}} placeholder="Número, proveedor o estado" /></FormField>
        <button className={secondaryButtonClass} disabled={busy||editor?.context===context} onClick={() => void load()}>Actualizar</button></div>
      {editor?.context !== context && <div className={`${cardClass} space-y-3`}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Número</th><th className="p-3">Proveedor</th><th className="p-3">Fecha</th><th className="p-3">Estado</th><th className="p-3 text-right">Total</th></tr></thead><tbody>
        {rows.slice((page-1)*size,page*size).map(d => <tr className="border-b" key={d.id}><td className="p-3"><button className="font-semibold text-[#B3282D] underline" disabled={busy} onClick={() => requestFormNavigation(() => {setSelection({context,id:d.id});setEditor(null)})}>{d.document_number}</button></td><td className="p-3">{d.supplier_snapshot.name || 'Por definir'}</td><td className="p-3 whitespace-nowrap">{formatDate(d.issue_date)}</td><td className="p-3">{d.status}</td><td className="p-3 text-right whitespace-nowrap">{formatMoney(d.total,d.currency)}</td></tr>)}
      </tbody></table></div>{!rows.length && <p className="p-3 text-sm text-slate-500">No hay documentos para esta búsqueda. Puedes crear uno nuevo.</p>}
      <Pagination page={page} pageSize={size} total={rows.length} onPageChange={setPage} onPageSizeChange={n => {setSize(n);setPage(1)}} /></div>}
      {editor?.context === context && <PurchaseWorkflowEditor key={`${context}:${editor.document?.id || 'new'}:${editor.document?.revision || 0}`} kind={kind} document={editor.document} suppliers={current.suppliers} accounts={current.accounts} busy={busy} onCancel={() => setEditor(null)} onSave={form => void run({action:'save',document:editor.document,form})} />}
      {selected && !editor && <section className={`${cardClass} space-y-5`} aria-label="Detalle de compra"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.document_number} · {selected.status}</h2><p className="text-sm text-slate-500">Revisión {selected.revision} · {selected.supplier_snapshot.name || 'Proveedor por definir'}</p></div><PdfDownloadButton className={secondaryButtonClass} document={<PurchaseWorkflowPdf data={selected} />} fileName={`${selected.document_number}.pdf`}>Descargar PDF</PdfDownloadButton></div>
        <p>{formatMoney(selected.total,selected.currency)} · Emisión {formatDate(selected.issue_date)} · Vencimiento {formatDate(selected.due_date)}</p>
        <div className="space-y-2">{purchaseWorkflowRemaining(selected,current.allocations).map(line => <div key={line.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{line.description}</p><p>{line.quantity} × {formatMoney(line.unit_price,selected.currency)}{selected.kind === 'Orden' ? ` · Pendiente de facturar: ${line.remaining}` : ''}</p></div>)}</div>
        {selected.internal_notes && <p className="text-sm"><strong>Nota interna:</strong> {selected.internal_notes}</p>}
        <div className="flex flex-wrap gap-2">
          {['Borrador','Rechazada','Aprobada','Pendiente'].includes(selected.status) && !current.allocations.some(a => a.order_id === selected.id) && !current.documents.some(d => d.source_request_id === selected.id) && <button disabled={busy} className={secondaryButtonClass} onClick={() => setEditor({context,document:selected})}>Editar · vuelve a borrador</button>}
          {['Borrador','Rechazada'].includes(selected.status) && <button disabled={busy} className={primaryButtonClass} onClick={() => void run({action:'submit',document:selected})}>Enviar a aprobación</button>}
          {selected.status === 'Pendiente' && <><button disabled={busy} className={primaryButtonClass} onClick={() => void run({action:'approve',document:selected})}>Aprobar</button><button disabled={busy} className={secondaryButtonClass} onClick={() => setReason({context,action:'reject',document:selected})}>Rechazar</button></>}
          {selected.kind === 'Solicitud' && selected.status === 'Aprobada' && !current.documents.some(d => d.source_request_id === selected.id) && <button disabled={busy} className={primaryButtonClass} onClick={() => void run({action:'order',document:selected})}>Crear orden de compra</button>}
          {selected.kind === 'Orden' && ['Aprobada','Parcialmente facturada'].includes(selected.status) && <button disabled={busy} className={primaryButtonClass} onClick={() => setInvoice({context,document:selected})}>Registrar factura desde orden</button>}
          {!['Cancelada','Facturada'].includes(selected.status) && !current.documents.some(d => d.source_request_id === selected.id) && <button disabled={busy} className={secondaryButtonClass} onClick={() => setReason({context,action:'cancel',document:selected})}>Cancelar {selected.status === 'Parcialmente facturada' ? 'remanente' : 'documento'}</button>}
        </div>
        {selected.kind === 'Solicitud' && current.documents.filter(d => d.source_request_id === selected.id).map(d => <p className="text-sm" key={d.id}>Orden vinculada: <Link className="text-[#B3282D] underline" href="/accounting/purchase-orders">{d.document_number}</Link></p>)}
        {selected.kind === 'Orden' && [...new Set(current.allocations.filter(a => a.order_id === selected.id).map(a => a.purchase_document_id))].map((id,index) => <p key={id}><Link className="text-sm text-[#B3282D] underline" href={`/accounting/purchases?document=${id}&table=purchase_documents`}>Ver factura vinculada {index+1}</Link></p>)}
        <div className="border-t pt-4"><h3 className="font-medium">Historial de acciones</h3>{events?.context === context && events.id === selected.id ? events.error ? <p role="alert">{events.error} <button onClick={() => void loadEvents()}>Reintentar</button></p> : <ul className="mt-2 space-y-2 text-xs text-slate-500">{events.rows.map(e => <li key={e.id}>{formatDate(e.created_at)} · {e.action} · revisión {e.revision} · Actor: {e.actor_id}{e.reason ? ` · ${e.reason}` : ''}</li>)}</ul> : <p>Cargando historial…</p>}</div>
      </section>}
    </>}
    {reason?.context === context && <PurchaseReasonDialog busy={busy} action={reason.action} onClose={() => setReason(null)} onConfirm={value => void run({action:reason.action,document:reason.document,reason:value})} />}
    {invoice?.context === context && current && <PurchaseInvoiceDialog busy={busy} document={invoice.document} allocations={current.allocations} onClose={() => setInvoice(null)} onSave={(document,quantities) => void run({action:'invoice',document:invoice.document,invoice:document,quantities})} />}
  </div>
}

function PurchaseReasonDialog({busy,action,onClose,onConfirm}:{busy:boolean;action:string;onClose:()=>void;onConfirm:(value:string)=>void}) {
  const [value,setValue] = useState('')
  return <Dialog open onOpenChange={open => {if(!open&&!busy)onClose()}}><DialogContent><DialogTitle>{action === 'reject' ? 'Rechazar compra' : 'Cancelar compra'}</DialogTitle><DialogDescription>El motivo queda registrado. Las facturas existentes conservan su saldo y su vínculo.</DialogDescription><FormField label="Motivo" required><textarea className={`${fieldClass} h-28 py-3`} maxLength={1000} disabled={busy} value={value} onChange={e => setValue(e.target.value)} /></FormField><div className="flex justify-end gap-2"><button disabled={busy} className={secondaryButtonClass} onClick={onClose}>Volver</button><button disabled={busy||!value.trim()} className={primaryButtonClass} onClick={() => onConfirm(value.trim())}>Confirmar</button></div></DialogContent></Dialog>
}

function PurchaseInvoiceDialog({document,allocations,busy,onClose,onSave}:{document:PurchaseWorkflowDocument;allocations:PurchaseAllocation[];busy:boolean;onClose:()=>void;onSave:(document:Record<string,string>,quantities:{id:string;quantity:number}[])=>void}) {
  const remaining = purchaseWorkflowRemaining(document,allocations).filter(l => l.remaining>0)
  const [quantities,setQuantities] = useState<Record<string,number>>(() => Object.fromEntries(remaining.map(l => [l.id,l.remaining])))
  const [number,setNumber] = useState(''), [cai,setCai] = useState(''), [date,setDate] = useState(toDateInputValue), [due,setDue] = useState(() => document.due_date < toDateInputValue() ? toDateInputValue() : document.due_date)
  return <Dialog open onOpenChange={open => {if(!open&&!busy)onClose()}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogTitle>Factura del proveedor · {document.document_number}</DialogTitle><DialogDescription>Se registrará la factura recibida y su cuenta por pagar usando los precios, descuentos e impuestos aprobados. Puedes facturar una parte. Si cambian los precios, revisa la orden antes de facturar.</DialogDescription>
    <form className="space-y-5" onSubmit={e => {e.preventDefault();onSave({document_number:number,source_cai:cai,issue_date:date,due_date:due},remaining.filter(l => quantities[l.id]>0).map(l => ({id:l.id,quantity:quantities[l.id]})))}}><fieldset disabled={busy} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><FormField label="N.º factura del proveedor" required><input className={fieldClass} value={number} maxLength={120} required onChange={e => setNumber(e.target.value)} /></FormField><FormField label="CAI del proveedor"><input className={fieldClass} value={cai} maxLength={100} onChange={e => setCai(e.target.value)} /></FormField><FormField label="Fecha de factura" required><input type="date" className={fieldClass} required max={toDateInputValue()} value={date} onChange={e => setDate(e.target.value)} /></FormField><FormField label="Vencimiento" required><input type="date" className={fieldClass} required min={date} value={due} onChange={e => setDue(e.target.value)} /></FormField></div>
    {remaining.map(l => <FormField key={l.id} label={l.description} className="max-w-sm" hint={`Pendiente: ${l.remaining} · ${formatMoney(l.unit_price,document.currency)} por unidad`}><NumberInput numericKind="quantity" type="number"  min={0} max={l.remaining} step="any" required value={quantities[l.id]} onChange={e => setQuantities(q => ({...q,[l.id]:Number(e.target.value)}))} /></FormField>)}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondaryButtonClass} onClick={onClose}>Cancelar</button><button className={primaryButtonClass} disabled={!number.trim()||!remaining.some(l => quantities[l.id]>0)}>Registrar factura</button></div></fieldset></form>
  </DialogContent></Dialog>
}

export function PurchaseWorkflowEditor({kind,document,suppliers,accounts,busy,onCancel,onSave}:{kind:PurchaseWorkflowKind;document?:PurchaseWorkflowDocument;suppliers:Supplier[];accounts:AccountingAccount[];busy:boolean;onCancel:()=>void;onSave:(form:Form)=>void}) {
  const [form,setForm] = useState<Form>(() => document ? {...document,supplier_id:document.supplier_id||'',office_id:document.office_id||'',supplier_address:document.supplier_snapshot.address||''} : {
    kind,supplier_id:'',office_id:'',supplier_address:'',issue_date:toDateInputValue(),due_date:toDateInputValue(),currency:'HNL',exchange_rate:1,fiscal_mode:'Mixta',payment_condition:'Contado',payment_method:'',payment_reference:'',supplier_reference:'',supplier_cai:'',internal_notes:'',commercial_notes:'',items:[newPurchaseWorkflowLine()],
  })
  const [initial] = useState(() => JSON.stringify(form))
  const expenses = purchaseExpenseAccounts(accounts)
  const change = <K extends keyof Form>(key:K,value:Form[K]) => setForm(f => ({...f,[key]:value}))
  const lineChange = (id:string,patch:Partial<PurchaseWorkflowLine>) => setForm(f => ({...f,items:f.items.map(l => l.id===id ? {...l,...patch} : l)}))
  let totals: ReturnType<typeof purchaseWorkflowAmounts> | null = null, calculationError = ''
  try { totals = purchaseWorkflowAmounts(form.items,form.fiscal_mode) } catch(e) { calculationError=(e as Error).message }
  return <form className={`${cardClass} space-y-7`} onSubmit={e => {e.preventDefault();if(form.items.some(l => l.account_id && !expenses.some(a => a.id===l.account_id))){toast.error('Selecciona cuentas de gasto activas para las líneas indicadas.');return}onSave({...form,items:form.items.map(l=>({...l,service_catalog_kind:null,service_catalog_code:null}))})}}><UnsavedChangesGuard active={!busy} dirty={JSON.stringify(form)!==initial} /><fieldset disabled={busy} className="space-y-7"><legend className="sr-only">{kind} de compra</legend>
    <FormSection title={`${document ? 'Editar' : 'Nueva'} ${kind.toLocaleLowerCase('es')} de compra`} description="El documento se guarda en borrador. Una modificación requiere una nueva aprobación."><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <FormField label="Proveedor" required={kind==='Orden'} as="div"><CompactSelect aria-label="Proveedor" disabled={busy} value={form.supplier_id} options={[{value:'',label:'Por definir'},...suppliers.map(s => ({value:s.id,label:s.nombre}))]} searchable onValueChange={id => {const s=suppliers.find(x => x.id===id);setForm(f => ({...f,supplier_id:id,due_date:purchaseWorkflowDueDate(f.issue_date,s?.terminos_pago||0),currency:s?.moneda==='USD'?'USD':'HNL',exchange_rate:s?.moneda==='USD'?f.exchange_rate:1,payment_condition:s?.terminos_pago?'Credito':'Contado',items:f.items.map(l => ({...l,account_id:l.account_id||(expenses.some(a=>a.id===s?.default_expense_account_id)?s?.default_expense_account_id:null)||null}))}))}} /></FormField>
      <BillingOfficeSelect label="Oficina emisora" required value={form.office_id} onChange={id => change('office_id',id)} disabled={busy} />
      <FormField label="Dirección del proveedor"><input className={fieldClass} value={form.supplier_address} maxLength={500} onChange={e => change('supplier_address',e.target.value)} /></FormField>
      <FormField label="Fecha de emisión" required><input className={fieldClass} type="date" required value={form.issue_date} onChange={e => change('issue_date',e.target.value)} /></FormField>
      <FormField label="Fecha de vencimiento" required><input className={fieldClass} type="date" required min={form.issue_date} value={form.due_date} onChange={e => change('due_date',e.target.value)} /></FormField>
      <FormField label="Condición de pago"><select className={fieldClass} value={form.payment_condition} onChange={e => change('payment_condition',e.target.value as Form['payment_condition'])}><option value="Contado">Contado</option><option value="Credito">Crédito</option></select></FormField>
      <FormField label="Medio de pago previsto"><select className={fieldClass} value={form.payment_method} onChange={e => change('payment_method',e.target.value)}>{['','Transferencia','Cheque','Efectivo','Otro'].map(v => <option value={v} key={v}>{v||'Por definir'}</option>)}</select></FormField>
      <FormField label="Referencia de pago / cheque"><input className={fieldClass} value={form.payment_reference} maxLength={200} onChange={e => change('payment_reference',e.target.value)} /></FormField>
      <div className="finance-field-row gap-4">
      <FormField label="Moneda del documento" className="w-28"><select className={fieldClass} value={form.currency} onChange={e => {change('currency',e.target.value);if(e.target.value==='HNL')change('exchange_rate',1)}}><option>HNL</option><option>USD</option></select></FormField>
      <FormField label="Tipo de cambio HNL por USD" className="w-40" required><NumberInput numericKind="exchange" type="number"  disabled={form.currency==='HNL'||busy} min={0.000001} max={1000000} step="any" value={form.exchange_rate} onChange={e => change('exchange_rate',Number(e.target.value))} required /></FormField>
      </div>
      <FormField label="Referencia de cotización / factura"><input className={fieldClass} value={form.supplier_reference} maxLength={200} onChange={e => change('supplier_reference',e.target.value)} /></FormField>
      <FormField label="CAI del proveedor (referencia)"><input className={fieldClass} value={form.supplier_cai} maxLength={100} onChange={e => change('supplier_cai',e.target.value)} /></FormField>
    </div></FormSection>
    <FormSection title="Detalle de compra" description="Cantidades, costos, descuentos e impuestos. La orden no genera pagos ni consume CAI."><div className="space-y-4"><FormField label="Tratamiento fiscal" className="w-full sm:w-48"><select className={fieldClassSm} value={form.fiscal_mode} onChange={e => {const mode=e.target.value as FiscalMode;setForm(f=>({...f,fiscal_mode:mode,items:f.items.map(l=>mode==='Mixta'?l:{...l,tax_treatment:mode,tax_rate:mode==='Gravada'?(l.tax_rate||15):0})}))}}>{['Mixta','Gravada','Exenta','Exonerada'].map(v => <option key={v}>{v}</option>)}</select></FormField>
      {form.items.map((line,index) => <div key={line.id} className="space-y-4 rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Línea {index+1}</h3><button type="button" aria-label={`Quitar línea ${index+1}`} className="text-sm text-red-700 disabled:opacity-50" disabled={form.items.length===1} onClick={() => change('items',form.items.filter(l => l.id!==line.id))}><Trash2 className="mr-1 inline h-4 w-4" />Quitar</button></div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <FormField label="Cuenta de gasto" as="div"><CompactSelect aria-label="Cuenta de gasto" searchable disabled={busy} value={line.account_id || ''}
            options={[{value:'',label:'Seleccionar cuenta de gasto'},...expenses.map(a=>({value:a.id,label:`${a.code} · ${a.name}`}))]}
            onValueChange={id=>lineChange(line.id,selectPurchaseExpenseAccount(line,id,accounts))} />
            {line.account_id && !expenses.some(a=>a.id===line.account_id) && <p role="alert" className="text-xs text-amber-700">Selecciona una cuenta de gasto activa para esta línea.</p>}
          </FormField>
          <FormField label="Descripción" required><input className={fieldClassSm} required maxLength={500} value={line.description} onChange={e=>lineChange(line.id,{description:e.target.value})} /></FormField>
        </div>
        <div className="finance-field-row items-start gap-4">
          <FormField label="Cantidad" required className="w-full sm:w-28"><NumberInput numericKind="quantity" type="number" required  min={0.000001} step="any" max={1000000} value={line.quantity} onChange={e=>lineChange(line.id,{quantity:Number(e.target.value)})} /></FormField>
          <FormField label="Costo unitario" required className="w-full sm:w-40"><NumberInput numericKind="money" type="number" required  min={0} step="any" max={100000000} value={line.unit_price} onChange={e=>lineChange(line.id,{unit_price:Number(e.target.value)})} /></FormField>
          <FormField label="Descuentos y rebajas" className="w-full sm:w-40"><NumberInput numericKind="money" type="number" required  min={0} step="0.01" value={line.discount_amount} onChange={e=>lineChange(line.id,{discount_amount:Number(e.target.value)})} /></FormField>
          <FormField label="Impuesto de línea" financeSize="choice"><select className={fieldClassSm} disabled={form.fiscal_mode!=='Mixta'||busy} value={line.tax_treatment} onChange={e=>lineChange(line.id,{tax_treatment:e.target.value as PurchaseWorkflowLine['tax_treatment'],tax_rate:e.target.value==='Gravada'?15:0})}><option>Exenta</option><option>Exonerada</option><option>Gravada</option></select></FormField>
          <FormField label="Tasa ISV" financeSize="quantity"><select className={fieldClassSm} disabled={form.fiscal_mode==='Exenta'||form.fiscal_mode==='Exonerada'||(form.fiscal_mode==='Mixta'&&line.tax_treatment!=='Gravada')||busy} value={line.tax_rate} onChange={e=>lineChange(line.id,{tax_rate:Number(e.target.value)})}><option value={0}>Sin ISV</option><option value={15}>15%</option><option value={18}>18%</option></select></FormField>
        </div></div>)}
      <button type="button" className={secondaryButtonClass} disabled={form.items.length>=200} onClick={() => change('items',[...form.items,newPurchaseWorkflowLine()])}><Plus className="mr-2 inline h-4 w-4" />Agregar línea</button>
    </div></FormSection>
    <div className="grid gap-6 lg:grid-cols-2"><div className="space-y-4"><FormField label="Nota interna (no aparece en PDF)"><textarea className={`${fieldClass} h-24 py-3`} value={form.internal_notes} maxLength={2000} onChange={e => change('internal_notes',e.target.value)} /></FormField><FormField label="Observación comercial para el proveedor"><textarea className={`${fieldClass} h-24 py-3`} value={form.commercial_notes} maxLength={2000} onChange={e => change('commercial_notes',e.target.value)} /></FormField></div><div className="space-y-3 rounded-xl bg-slate-50 p-5 dark:bg-slate-900"><h3 className="font-semibold">Resumen</h3>{calculationError && <p role="alert" className="text-sm text-red-700">{calculationError}</p>}{totals && <><p>Subtotal: {formatMoney(totals.subtotal,form.currency)}</p><p>Exento: {formatMoney(totals.exempt,form.currency)}</p><p>Exonerado: {formatMoney(totals.exonerated,form.currency)}</p><p>ISV: {formatMoney(totals.tax,form.currency)}</p><p className="text-xl font-semibold text-[#B3282D]">Total: {formatMoney(totals.total,form.currency)}</p></>}<p className="text-xs text-slate-500">Guardar no genera cuenta por pagar ni registra un pago.</p></div></div>
    <div className="flex flex-wrap justify-end gap-3"><button type="button" className={secondaryButtonClass} onClick={() => requestFormNavigation(onCancel)}>Cancelar</button><button className={primaryButtonClass} disabled={!totals||!form.office_id||(kind==='Orden'&&!form.supplier_id)}>Guardar borrador</button></div>
  </fieldset></form>
}
