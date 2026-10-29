'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertCircle, BarChart3, FileText, History, LoaderCircle, RefreshCw, Wallet } from 'lucide-react'
import { AccountingNav } from './AccountingNav'
import { MultiSelect } from '@/src/components/ui/MultiSelect'
import { FormField } from '@/src/components/ui/form-field'
import { Pagination } from '@/src/components/ui/Pagination'
import { FinanceEmptyState, FinanceMetric, FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { useFinanceReport } from '@/src/hooks/useFinanceReport'
import { financeDocumentReport, financeMovementReport, type FinanceFilters, type FinanceSide } from '@/src/lib/finance-report'
import { groupedFinancialReport } from '@/src/lib/financial-export'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { cardClass, fieldClass, fieldLabelClass } from '@/src/lib/ui-classes'
import type { ReportPdfData } from '@/src/components/pdf/report-pdf'

export function FinanceReportWorkspace({side,initialView='documents',title,eyebrow='Contabilidad',showAccountingNav=true}:{side:FinanceSide;initialView?:'documents'|'aging'|'movements';title?:string;eyebrow?:string;showAccountingNav?:boolean}) {
  const [filters,setFilters]=useState<FinanceFilters>({party:'',parties:[],statuses:['Pendientes'],documentTypes:[],currency:'Todos',status:'Pendientes',cutoff:toDateInputValue(new Date()),from:'',to:'',dateField:'issue_date',includeDebit:true})
  const [view,setView]=useState(initialView),[blocks,setBlocks]=useState(false),[revision,setRevision]=useState(0),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(50)
  const [kinds,setKinds]=useState<string[]>([])
  const result=useFinanceReport(side,filters.cutoff,revision),partyLabel=side==='receivable'?'Cliente':'Proveedor'
  function change<K extends keyof FinanceFilters>(key:K,value:FinanceFilters[K]){setFilters(f=>({...f,[key]:value}));setPage(0)}
  const computed=useMemo(()=>{
    if(result.loading||result.error)return {data:null,error:''}
    try{const selected={...filters,partyNames:result.parties.filter(p=>filters.parties?.includes(p.id)).map(p=>p.nombre||'Sin nombre')};return {data:view==='movements'?financeMovementReport(result.movements,selected,side,kinds):financeDocumentReport(result.documents,selected,side,view==='aging'),error:''}}
    catch(e){return {data:null,error:e instanceof Error?e.message:'Revisa los filtros del reporte.'}}
  },[result,filters,side,view,kinds])
  const report=computed.data,error=result.error||computed.error
  // Running balances cannot be added as document subtotals.
  const exported=report&&blocks&&view==='documents'?groupedFinancialReport(report):report
  const pages=Math.max(1,Math.ceil((report?.rows.length||0)/pageSize)),currentPage=Math.min(page,pages-1)
  function cell(data:ReportPdfData,row:ReportPdfData['rows'][number],key:string){const column=data.columns.find(c=>c.key===key);const value=row[key];return column?.format==='money'&&typeof value==='number'?formatMoney(value,String(row.currency||'')):String(value??'—')}
  return <div className="space-y-6">
    <FinancePageHeader eyebrow={eyebrow} title={title||(side==='receivable'?'Cuentas por cobrar':'Estado de cuenta de proveedores')} description="Documentos y saldos a la fecha de corte. Consulta el detalle, la antigüedad y el movimiento de cada cuenta." icon={Wallet} actions={<><Link href="/reports" className={financeActionClass}>Otros reportes</Link><button type="button" className={financeActionClass} onClick={()=>setRevision(r=>r+1)}><RefreshCw className="h-4 w-4"/>Actualizar</button></>}/>
    {showAccountingNav&&<AccountingNav/>}
    <section className={`${cardClass} space-y-5`} aria-label="Filtros financieros">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><FormField as="div" label={side==='receivable'?'Clientes':'Proveedores'} className="md:col-span-2"><MultiSelect id="finance-party" aria-label={partyLabel} options={result.parties.map(p=>({value:p.id,label:p.nombre||'Sin nombre'}))} value={filters.parties||[]} onValueChange={value=>change('parties',value)} placeholder={`Todos los ${side==='receivable'?'clientes':'proveedores'}`} disabled={result.loading}/></FormField>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs"><span className={fieldLabelClass}>Fecha de corte</span><input className={fieldClass} type="date" value={filters.cutoff} max={toDateInputValue(new Date())} onChange={e=>change('cutoff',e.target.value)}/></label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs"><span className={fieldLabelClass}>Moneda</span><select className={fieldClass} value={filters.currency} onChange={e=>change('currency',e.target.value)}>{['Todos','HNL','USD'].map(v=><option key={v}>{v}</option>)}</select></label></div>
      <div role="group" aria-label="Vista del reporte" className="flex flex-wrap gap-2">{([['documents','Documentos',FileText],['aging','Antigüedad',BarChart3],['movements','Movimientos',History]] as const).map(([id,label,Icon])=><button type="button" key={id} aria-pressed={view===id} className={`${financeActionClass} ${view===id?'!border-rose-300 !bg-rose-50 !text-[#B3282D]':''}`} onClick={()=>{setView(id);setPage(0)}}><Icon className="h-4 w-4"/>{label}</button>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {view!=='movements'&&<><FormField as="div" label="Estados"><MultiSelect aria-label="Estados" options={['Pendientes','Vencidos','Pagados'].map(value=>({value,label:value}))} value={filters.statuses||[]} onValueChange={value=>change('statuses',value as NonNullable<FinanceFilters['statuses']>)}/></FormField><label className="flex min-w-0 flex-col gap-1.5 text-xs"><span className={fieldLabelClass}>Fecha del documento</span><select className={fieldClass} value={filters.dateField} onChange={e=>change('dateField',e.target.value as FinanceFilters['dateField'])}><option value="issue_date">Emisión</option><option value="created_on">Creación</option><option value="due_date">Vencimiento</option></select></label></>}
        <label className="flex min-w-0 flex-col gap-1.5 text-xs"><span className={fieldLabelClass}>{view==='movements'?'Inicio de movimientos':'Desde (opcional)'}</span><input type="date" className={fieldClass} value={filters.from} max={view==='movements'?filters.cutoff:undefined} onChange={e=>change('from',e.target.value)}/></label>
        {view!=='movements'&&<label className="flex min-w-0 flex-col gap-1.5 text-xs"><span className={fieldLabelClass}>Hasta (opcional)</span><input type="date" className={fieldClass} value={filters.to} onChange={e=>change('to',e.target.value)}/></label>}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">{view==='documents'&&<label className="flex items-center gap-2"><input type="checkbox" checked={blocks} onChange={e=>setBlocks(e.target.checked)}/>Exportar con bloques por {partyLabel.toLowerCase()} en una hoja</label>}</div>
      <FormField as="div" label={view==='movements'?'Tipos de movimiento':'Tipos de documento'} hint={view==='movements'?'El filtro cambia el detalle; los saldos conservan todo el movimiento.':'Sin selección se incluyen todos los tipos, incluidas las notas de débito disponibles.'}><MultiSelect aria-label={view==='movements'?'Tipos de movimiento':'Tipos de documento'} value={view==='movements'?kinds:filters.documentTypes||[]} options={[...new Set(view==='movements'?result.movements.map(m=>m.kind):result.documents.map(d=>d.document_type))].sort().map(value=>({value,label:value}))} onValueChange={values=>{if(view==='movements')setKinds(values);else change('documentTypes',values);setPage(0)}}/></FormField>
      <p className="text-xs leading-relaxed text-slate-500">Actual = saldo no vencido. Los tramos de mora se calculan desde el vencimiento. Cada moneda se totaliza por separado.{result.legacy&&` Historial verificable desde ${formatDate(result.coverage)}; la apertura anterior se identifica como reconstruida.`}</p>
    </section>
    {error&&<div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle className="h-5 w-5 shrink-0"/>{error}</div>}
    {result.loading&&<p role="status" className="flex items-center gap-2 p-5 text-sm text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin"/>Preparando el corte financiero…</p>}
    {report&&<><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{report.metrics.map((m,i)=><FinanceMetric key={`${m.label}-${i}`} label={m.label} value={m.value} icon={Wallet} tone="rose"/>)}</div>
      <section className={`${cardClass} !p-0`}><div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800"><div><h2 className="font-bold">{report.title}</h2><p className="mt-1 text-xs text-slate-500">{report.rows.length} registros · {report.dateRange}</p></div>{exported&&<FinancialReportExport data={exported} filename={`${side}-${view}-${filters.cutoff}`} disabled={!report.rows.length}/>}</div>
        {report.rows.length?<div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-xs"><thead className="bg-slate-50 dark:bg-slate-900"><tr>{report.columns.map(c=><th key={c.key} scope="col" className={`px-4 py-3 ${c.align==='right'?'text-right':'text-left'}`}>{c.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{report.rows.slice(currentPage*pageSize,(currentPage+1)*pageSize).map((row,i)=><tr key={`${row.id||row.__party_id||''}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-900">{report.columns.map(c=><td key={c.key} className={`px-4 py-4 ${c.align==='right'?'whitespace-nowrap text-right tabular-nums':''}`}>{cell(report,row,c.key)}</td>)}</tr>)}</tbody></table></div>:<FinanceEmptyState icon={FileText} title="Sin registros para estos filtros" description="Prueba otro estado, fecha de corte o cliente/proveedor."/>}
        <Pagination page={currentPage+1} pageSize={pageSize} total={report.rows.length} onPageChange={p=>setPage(p-1)} onPageSizeChange={size=>{setPageSize(size);setPage(0)}}/><p className="px-4 pb-4 text-xs text-slate-500">La exportación incluye todos los registros.</p>
      </section><div className="space-y-1 text-xs text-slate-500">{report.filters.map(f=><p key={f}>{f}</p>)}</div></>}
  </div>
}
