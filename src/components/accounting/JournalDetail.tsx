'use client'
import { useEffect,useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { FinancialReportExport } from '@/src/components/invoicing/FinancialReportExport'
import { formatDate,formatMoney } from '@/src/lib/format'
import type { JournalEntry } from '@/src/lib/accounting'
type Line={id:string;account_code:string;account_name:string;debit:number;credit:number;description:string}
export function JournalDetail({entry}:{entry:JournalEntry}){
 const {user,profile}=useUser(),identity=`${user?.id}:${profile?.tenant_id}:${entry.id}`
 const [result,setResult]=useState<{identity:string;rows:Line[];error:string}|null>(null),[revision,setRevision]=useState(0)
 useEffect(()=>{let current=true
  void readAllReportRows<Line>((a,b)=>supabase.from('journal_lines').select('id,account_code,account_name,debit,credit,description').eq('entry_id',entry.id).order('sort_order').order('id').range(a,b),{label:'líneas del asiento',isCurrent:()=>current})
   .then(rows=>{if(current)setResult({identity,rows,error:''})}).catch(()=>{if(current)setResult({identity,rows:[],error:'No se pudo cargar la partida.'})})
  return()=>{current=false}
 },[identity,entry.id,revision])
 const current=result?.identity===identity?result:null
 if(!current)return <p>Cargando partida…</p>
 if(current.error)return <p role="alert" className="text-red-600">{current.error} <button onClick={()=>setRevision(n=>n+1)}>Reintentar</button></p>
 const debit=current.rows.reduce((s,l)=>s+Number(l.debit),0),credit=current.rows.reduce((s,l)=>s+Number(l.credit),0)
 const columns=[{key:'account',label:'Cuenta'},{key:'description',label:'Comentario'},{key:'debit',label:'Debe HNL',align:'right' as const},{key:'credit',label:'Haber HNL',align:'right' as const}]
 return <div className="space-y-3"><p>Asiento #{entry.entry_number} · {formatDate(entry.entry_date)} · {entry.source_type}</p><p>{entry.description}</p>
 {entry.source_type==='Factura'&&entry.source_id&&<Link className="text-blue-700 underline" href={`/invoicing/${entry.source_id}`}>Ver documento de origen</Link>}
 <FinancialReportExport filename={`asiento-${entry.entry_number}`} data={{title:`Asiento #${entry.entry_number}`,subtitle:entry.description,generatedAt:formatDate(new Date()),dateRange:formatDate(entry.entry_date),filters:['Moneda contable: HNL',entry.source_type,...(entry.reversed_by_id?['Reversado mediante otra partida']:[])],metrics:[{label:'Debe',value:formatMoney(debit,'HNL')},{label:'Haber',value:formatMoney(credit,'HNL')}],columns,rows:current.rows.map(l=>({account:`${l.account_code} · ${l.account_name}`,description:l.description,debit:Number(l.debit),credit:Number(l.credit)}))}}/>
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{columns.map(c=><th key={c.key} className="p-2 text-left">{c.label}</th>)}</tr></thead><tbody>{current.rows.map(l=><tr key={l.id} className="border-t"><td className="p-2">{l.account_code} · {l.account_name}</td><td className="p-2">{l.description}</td><td className="p-2 text-right">{formatMoney(Number(l.debit),'HNL')}</td><td className="p-2 text-right">{formatMoney(Number(l.credit),'HNL')}</td></tr>)}</tbody><tfoot><tr><td colSpan={2} className="p-2 font-semibold">Total</td><td className="p-2 text-right font-bold">{formatMoney(debit,'HNL')}</td><td className="p-2 text-right font-bold">{formatMoney(credit,'HNL')}</td></tr></tfoot></table></div>
 </div>
}
