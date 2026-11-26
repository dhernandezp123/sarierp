'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {ChartNoAxesCombined} from 'lucide-react'
import {supabase} from '@/src/lib/supabase/client'
import {useAccounting} from '@/src/hooks/useAccounting'
import {readAllReportRows,readReportRowsByIds} from '@/src/lib/report-query'
import {monthlyExpenses,expenseMonthBounds,type ExpenseLine} from '@/src/lib/monthly-expenses'
import type {AccountKind,JournalEntry} from '@/src/lib/accounting'
import {AccountingNav} from '@/src/components/accounting/AccountingNav'
import {JournalDetail} from '@/src/components/accounting/JournalDetail'
import {FinancePageHeader} from '@/src/components/invoicing/FinanceWorkspace'
import {FinancialReportExport} from '@/src/components/invoicing/FinancialReportExport'
import {FormField} from '@/src/components/ui/form-field'
import {Pagination} from '@/src/components/ui/Pagination'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/src/components/ui/dialog'
import {formatDate,formatMoney,toDateInputValue} from '@/src/lib/format'
import {cardClass,fieldClass,primaryButtonClass} from '@/src/lib/ui-classes'
type RawLine=Omit<ExpenseLine,'kind'|'provider'|'entry'>&{account:{kind:AccountKind}|{kind:AccountKind}[];entry:JournalEntry|JournalEntry[]}
type Asset={id:string;code:string;name:string;acquisition_date:string;cost:number;acquisition_line_id:string|null}
export default function MonthlyExpensesPage(){
 const {context,error,isCurrent}=useAccounting(),version=useRef(0),owner=useRef('')
 const [month,setMonth]=useState(()=>toDateInputValue().slice(0,7)),[kind,setKind]=useState<'Gasto'|'Costo'>('Gasto'),[group,setGroup]=useState<'account'|'provider'>('account')
 const [state,setState]=useState<{key:string;lines:ExpenseLine[];assets:Asset[]}|null>(null),[busyKey,setBusyKey]=useState<string|null>(null),[failure,setFailure]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(25),[entry,setEntry]=useState<JournalEntry|null>(null)
 const key=`${context}:${month}`;useEffect(()=>{owner.current=key;return()=>{owner.current='' }},[key])
 const current=state?.key===key?state:null,busy=busyKey===key
 async function load(){
  let bounds:ReturnType<typeof expenseMonthBounds>;try{bounds=expenseMonthBounds(month)}catch(e){setFailure((e as Error).message);return}
  const run=++version.current,active=()=>run===version.current&&isCurrent()&&owner.current===key
  setBusyKey(key);setFailure('');setState(null);setPage(1);setEntry(null)
  try{
   const [raw,assets]=await Promise.all([
    readAllReportRows<RawLine>((a,b)=>supabase.from('journal_lines').select('id,account_id,account_code,account_name,debit,credit,description,account:accounting_accounts(kind),entry:journal_entries!inner(*)').gte('entry.entry_date',bounds.previousFrom).lte('entry.entry_date',bounds.to).order('id').range(a,b),{label:'gastos mensuales',isCurrent:active}),
    readAllReportRows<Asset>((a,b)=>supabase.from('fixed_assets').select('id,code,name,acquisition_date,cost,acquisition_line_id').gte('acquisition_date',bounds.from).lte('acquisition_date',bounds.to).order('id').range(a,b),{label:'adquisiciones de activos',isCurrent:active})
   ])
   const lines=raw.map(row=>{const e=Array.isArray(row.entry)?row.entry[0]:row.entry,a=Array.isArray(row.account)?row.account[0]:row.account;if(!e||!a)throw new Error('Hay partidas incompletas. Reintenta la consulta.');return {...row,entry:e,kind:a.kind,provider:'Sin proveedor asociado'} as ExpenseLine})
   const parents=await readReportRowsByIds<JournalEntry>(lines.flatMap(l=>l.entry.reverses_id?[l.entry.reverses_id]:[]),(ids,a,b)=>supabase.from('journal_entries').select('*').in('id',ids).order('id').range(a,b),{label:'orígenes de reversos',isCurrent:active})
   const originals=new Map(parents.map(e=>[e.id,e]))
   const source=(e:JournalEntry)=>e.reverses_id?originals.get(e.reverses_id)||e:e
   const payables=await readReportRowsByIds<{id:string;proveedor_id:string|null;purchase_document_id:string|null}>(lines.flatMap(l=>{const e=source(l.entry);return e.source_type==='Compra'&&e.source_id?[e.source_id]:[]}),(ids,a,b)=>supabase.from('cuentas_pagar').select('id,proveedor_id,purchase_document_id').in('id',ids).order('id').range(a,b),{label:'orígenes de compras',isCurrent:active})
   const [documents,suppliers]=await Promise.all([
    readReportRowsByIds<{id:string;supplier_snapshot:{name?:string}|null}>(payables.flatMap(p=>p.purchase_document_id?[p.purchase_document_id]:[]),(ids,a,b)=>supabase.from('purchase_documents').select('id,supplier_snapshot').in('id',ids).order('id').range(a,b),{label:'proveedores históricos',isCurrent:active}),
    readReportRowsByIds<{id:string;nombre:string}>(payables.flatMap(p=>p.proveedor_id?[p.proveedor_id]:[]),(ids,a,b)=>supabase.from('proveedores').select('id,nombre').in('id',ids).order('id').range(a,b),{label:'proveedores',isCurrent:active})
   ])
   const names=new Map(payables.map(p=>[p.id,documents.find(d=>d.id===p.purchase_document_id)?.supplier_snapshot?.name||suppliers.find(s=>s.id===p.proveedor_id)?.nombre||'Proveedor no identificado']))
   for(const l of lines){const e=source(l.entry);l.provider_key='unassigned';if(e.source_type==='Compra'){l.provider=names.get(e.source_id||'')||'Proveedor no identificado';l.provider_key=payables.find(p=>p.id===e.source_id)?.proveedor_id||`unidentified:${e.source_id||e.id}`}}
   monthlyExpenses(lines,month,'Gasto');monthlyExpenses(lines,month,'Costo')
   if(assets.some(a=>!Number.isFinite(Number(a.cost))||Number(a.cost)<0))throw new Error('Hay un costo de activo inválido. Revisa el registro antes de exportar.')
   if(active())setState({key,lines,assets})
  }catch(e){if(active())setFailure((e as Error).message)}finally{if(active())setBusyKey(null)}
 }
 const report=current?monthlyExpenses(current.lines,month,kind,group):null
 const exports=report?{title:`${kind==='Gasto'?'Gastos':'Costos'} mensuales`,subtitle:'Partidas contabilizadas · HNL',dateRange:`${formatDate(report.bounds.from)} — ${formatDate(report.bounds.to)}`,generatedAt:formatDate(new Date()),filters:[`Comparación: ${report.bounds.previous}`,group==='account'?'Ranking por cuenta':'Ranking por proveedor','Neto debe menos haber; incluye reversos. Los activos se muestran por separado.'],metrics:[{label:'Mes seleccionado',value:formatMoney(report.current,'HNL')},{label:'Mes anterior',value:formatMoney(report.previous,'HNL')},{label:'Variación',value:formatMoney(report.change,'HNL')}],columns:[{key:'label',label:group==='account'?'Cuenta':'Proveedor'},{key:'current',label:'Mes HNL',align:'right' as const},{key:'previous',label:'Anterior HNL',align:'right' as const},{key:'change',label:'Variación HNL',align:'right' as const}],rows:report.ranking.map(r=>({label:r.label,current:r.current,previous:r.previous,change:r.change}))}:null
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Gastos mensuales" description="Identifica las cuentas y proveedores con mayor gasto y compáralos con el mes anterior." icon={ChartNoAxesCombined}/><AccountingNav/>
 <form className={`${cardClass} flex flex-wrap items-end gap-4`} onSubmit={e=>{e.preventDefault();void load()}}><FormField label="Mes"><input className={fieldClass} type="month" required value={month} onChange={e=>{setMonth(e.target.value);setEntry(null)}}/></FormField><FormField label="Clasificación"><select className={fieldClass} value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setPage(1)}}><option>Gasto</option><option>Costo</option></select></FormField><FormField label="Agrupar por"><select className={fieldClass} value={group} onChange={e=>setGroup(e.target.value as typeof group)}><option value="account">Cuenta contable</option><option value="provider">Proveedor</option></select></FormField><button className={primaryButtonClass} disabled={busy}>{busy?'Consultando…':'Consultar'}</button></form>
 {(failure||error)&&<p role="alert" className="text-red-600">{failure||error}</p>}
 {report&&exports&&<><section className={`${cardClass} space-y-4`}><div className="grid gap-4 sm:grid-cols-3">{exports.metrics.map(m=><div key={m.label}><p className="text-sm text-slate-500">{m.label}</p><strong>{m.value}</strong></div>)}</div><FinancialReportExport data={exports} filename={`gastos-${month}-${kind}-${group}`}/><p className="text-xs text-slate-500">Importes contables en HNL. Los abonos y reversos reducen el gasto; las cuentas sin movimiento actual conservan su comparación anterior.</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">{group==='account'?'Cuenta':'Proveedor'}</th><th>Mes HNL</th><th>Anterior HNL</th><th>Variación</th></tr></thead><tbody>{report.ranking.map(r=><tr key={r.id} className="border-t"><td className="p-2">{r.label}</td><td className="p-2 text-right">{formatMoney(r.current,'HNL')}</td><td className="p-2 text-right">{formatMoney(r.previous,'HNL')}</td><td className="p-2 text-right">{r.percent===null?'Sin base anterior':`${r.percent.toFixed(1)} %`}</td></tr>)}</tbody></table></div>{!report.ranking.length&&<p>Sin partidas para estos filtros.</p>}</section>
 <section className={`${cardClass} space-y-3`}><h2 className="font-semibold">Detalle del mes seleccionado</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Fecha','Asiento','Cuenta / concepto','Proveedor','Neto HNL'].map(t=><th key={t} className="p-2 text-left">{t}</th>)}</tr></thead><tbody>{report.detail.slice((page-1)*size,page*size).map(l=><tr key={l.id} className="border-t"><td className="p-2 whitespace-nowrap">{formatDate(l.entry.entry_date)}</td><td className="p-2"><button className="text-[#B3282D] underline" onClick={()=>setEntry(l.entry)}>#{l.entry.entry_number}</button></td><td className="p-2">{l.account_code} · {l.account_name}<p className="text-xs text-slate-500">{l.description||l.entry.description}</p></td><td className="p-2">{l.provider}</td><td className="p-2 text-right">{formatMoney(Number(l.debit)-Number(l.credit),'HNL')}</td></tr>)}</tbody></table></div><Pagination page={page} pageSize={size} total={report.detail.length} onPageChange={setPage} onPageSizeChange={s=>{setSize(s);setPage(1)}}/></section>
 <section className={`${cardClass} space-y-3`}><h2 className="font-semibold">Adquisiciones registradas como activos</h2><p className="text-sm text-slate-500">Registro de activos del mes por fecha de adquisición. No forma parte del gasto; no representa todas las inversiones ni los pagos bancarios. El costo puede incluir registros históricos sin partida vinculada.</p>{current?.assets.length?<ul className="space-y-2">{current.assets.map(a=><li key={a.id} className="flex flex-wrap justify-between gap-2 border-b py-2"><span>{formatDate(a.acquisition_date)} · {a.code} · {a.name}{!a.acquisition_line_id?' · Sin partida vinculada':''}</span><strong>{formatMoney(Number(a.cost),'HNL')}</strong></li>)}</ul>:<p>Sin adquisiciones registradas en este mes.</p>}<Link href="/accounting/assets" className="text-[#B3282D] underline">Ver registro de activos</Link></section></>}
 <Dialog open={Boolean(entry&&current)} onOpenChange={open=>{if(!open)setEntry(null)}}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Detalle contable</DialogTitle><DialogDescription>Partida registrada y documento de origen.</DialogDescription></DialogHeader>{entry&&current&&<JournalDetail key={`${context}:${entry.id}`} entry={entry}/>}</DialogContent></Dialog>
 </div>
}
