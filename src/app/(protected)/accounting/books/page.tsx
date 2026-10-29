'use client'
import { useRef,useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useAccounting } from '@/src/hooks/useAccounting'
import { readAllReportRows } from '@/src/lib/report-query'
import { AccountingNav } from '@/src/components/accounting/AccountingNav'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { BookOpen } from 'lucide-react'
import { MultiSelect } from '@/src/components/ui/MultiSelect'
import { FormField } from '@/src/components/ui/form-field'
import { multiAccountLedger } from '@/src/lib/multi-account-ledger'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { accountingBook,bookLabels,type BookType,type BookLine } from '@/src/lib/accounting-books'
import { toDateInputValue } from '@/src/lib/format'
import { cardClass,fieldClass,primaryButtonClass,fieldLabelClass } from '@/src/lib/ui-classes'
type RawLine=Omit<BookLine,'kind'|'entry_id'|'entry_number'|'entry_date'|'entry_description'|'source_type'>&{account:{kind:BookLine['kind']}|{kind:BookLine['kind']}[];entry:{id:string;entry_number:number;entry_date:string;description:string;source_type:string}|{id:string;entry_number:number;entry_date:string;description:string;source_type:string}[]}
export default function AccountingBooksPage(){
 const {context,data,error,isCurrent}=useAccounting(),version=useRef(0)
 const [type,setType]=useState<BookType>('journal'),[from,setFrom]=useState(()=>toDateInputValue().slice(0,7)+'-01'),[to,setTo]=useState(toDateInputValue),[accountIds,setAccountIds]=useState<string[]>([])
 const [snapshot,setSnapshot]=useState<{key:string;lines:BookLine[]}|null>(null),[busy,setBusy]=useState(false),[readError,setReadError]=useState(''),[page,setPage]=useState(0)
 const key=`${context}:${from}:${to}`,current=snapshot?.key===key?snapshot:null
 async function load(){
  if(!from||!to||from>to){setReadError('Selecciona un período válido.');return}
  if(type==='ledger'&&!accountIds.length){setReadError('Selecciona al menos una cuenta para el libro mayor.');return}
  const run=++version.current;setBusy(true);setReadError('');setSnapshot(null);setPage(0)
  try{
   const rows=await readAllReportRows<RawLine>((a,b)=>supabase.from('journal_lines').select('id,account_id,account_code,account_name,debit,credit,description,account:accounting_accounts(kind),entry:journal_entries!inner(id,entry_number,entry_date,description,source_type)').lte('entry.entry_date',to).order('id').range(a,b),{label:'libros contables',isCurrent:()=>run===version.current&&isCurrent()})
   const lines=rows.map(row=>{const entry=Array.isArray(row.entry)?row.entry[0]:row.entry,account=Array.isArray(row.account)?row.account[0]:row.account
    if(!entry||!account)throw new Error('Hay una partida incompleta. Reintenta el reporte.')
    return {...row,kind:account.kind,entry_id:entry.id,entry_number:entry.entry_number,entry_date:entry.entry_date,entry_description:entry.description,source_type:entry.source_type} as BookLine
   })
   if(run===version.current&&isCurrent())setSnapshot({key,lines})
  }catch(e){if(run===version.current&&isCurrent())setReadError((e as Error).message)}
  finally{if(run===version.current&&isCurrent())setBusy(false)}
 }
 let report:ReturnType<typeof accountingBook>|null=null,reportError=''
 if(current){try{report=type==='ledger'?multiAccountLedger(current.lines,from,to,(data?.accounts||[]).filter(a=>accountIds.includes(a.id))):accountingBook(current.lines,type,from,to)}catch(e){reportError=(e as Error).message}}
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Libros y estados financieros" description="Libro diario, mayor, balance de comprobación, balance general y estado de resultados por período." icon={BookOpen}/><AccountingNav/>
 <form className={`${cardClass} grid gap-3 sm:grid-cols-4`} onSubmit={e=>{e.preventDefault();void load()}}><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Reporte</span><select className={fieldClass} value={type} onChange={e=>{setType(e.target.value as BookType);setPage(0)}}>{Object.entries(bookLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Desde</span><input type="date" required className={fieldClass} value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Hasta</span><input type="date" required className={fieldClass} value={to} onChange={e=>setTo(e.target.value)}/></label>
 {type==='ledger'&&<FormField as="div" label="Cuentas del libro mayor" required><MultiSelect aria-label="Cuentas del libro mayor" value={accountIds} onValueChange={values=>{setAccountIds(values);setPage(0)}} options={(data?.accounts||[]).filter(a=>a.postable).map(a=>({value:a.id,label:`${a.code} · ${a.name}`}))} placeholder="Selecciona una o varias cuentas"/></FormField>}<button className={primaryButtonClass} disabled={busy}>{busy?'Consultando…':'Consultar'}</button></form>
 {(error||readError||reportError)&&<p role="alert" className="text-red-600">{error||readError||reportError}</p>}
 {report&&<section className={`${cardClass} space-y-4`}><h2 className="font-semibold">{report.title}</h2><p className="text-sm">{report.dateRange}</p><div className="grid gap-3 sm:grid-cols-4">{report.metrics.map(m=><div key={m.label}><p className="text-sm text-slate-500">{m.label}</p><strong>{m.value}</strong></div>)}</div>{report.filters.map(f=><p key={f} className="text-xs text-slate-500">{f}</p>)}<FinancialReportExport data={report} filename={`${type}-${from}-${to}`} disabled={busy}/>
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{report.columns.map(c=><th key={c.key} className="p-2 text-left">{c.label}</th>)}</tr></thead><tbody>{report.rows.slice(page*50,page*50+50).map((row,i)=><tr key={page*50+i} className="border-t">{report.columns.map(c=><td key={c.key} className={`p-2 ${c.align==='right'?'text-right':''}`}>{typeof row[c.key]==='number'&&c.align==='right'?Number(row[c.key]).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):row[c.key]}</td>)}</tr>)}</tbody></table></div>{!report.rows.length&&<p>No hay partidas contabilizadas para este reporte.</p>}
 <div className="flex gap-3"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page+1} / {Math.max(1,Math.ceil(report.rows.length/50))}</span><button disabled={(page+1)*50>=report.rows.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div></section>}
 </div>
}
