import { accountingBook,type BookLine } from './accounting-books'
import type { ReportPdfData } from '@/src/components/pdf/report-pdf'
export function multiAccountLedger(lines:BookLine[],from:string,to:string,accounts:{id:string;code:string;name:string}[]):ReportPdfData{
 const unique=[...new Map(accounts.map(a=>[a.id,a])).values()].sort((a,b)=>a.code.localeCompare(b.code))
 if(!unique.length)throw new Error('Selecciona al menos una cuenta para el libro mayor.')
 const reports=unique.map(a=>({account:a,report:accountingBook(lines,'ledger',from,to,a.id)})),first=reports[0].report
 return {...first,title:'Libro mayor por cuentas',filters:[...first.filters.slice(0,1),'Cada cuenta conserva su saldo inicial y saldo acumulado independiente.','Saldo positivo: deudor. Saldo negativo: acreedor.',...unique.map(a=>`${a.code} · ${a.name}`)],
  metrics:reports.flatMap(({account,report})=>report.metrics.map(m=>({...m,label:`${account.code} · ${m.label}`}))),
  rows:reports.flatMap(({account,report})=>[
   {date:'',entry:'',account:`${account.code} · ${account.name}`,description:'Saldo inicial D−H',debit:0,credit:0,balance:lines.filter(l=>l.account_id===account.id&&l.entry_date<from).reduce((n,l)=>n+Math.round(Number(l.debit)*100)-Math.round(Number(l.credit)*100),0)/100},
   ...report.rows,
  ])}
}
