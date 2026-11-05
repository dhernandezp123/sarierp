import type {AccountKind,JournalEntry} from './accounting'
export type ExpenseLine={id:string;account_id:string;account_code:string;account_name:string;kind:AccountKind;debit:number;credit:number;description:string;entry:JournalEntry;provider:string;provider_key?:string}
export function expenseMonthBounds(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<1900||Number(month.slice(0,4))>9998)throw new Error('Selecciona un mes válido.')
 const year=Number(month.slice(0,4)),m=Number(month.slice(5)),previous=m===1?`${year-1}-12`:`${year}-${String(m-1).padStart(2,'0')}`
 return {from:`${month}-01`,to:`${month}-${new Date(Date.UTC(year,m,0)).getUTCDate()}`,previousFrom:`${previous}-01`,previous}
}
function cents(value:number){const n=Number(value);if(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*100)))throw new Error('Importe contable inválido.');return Math.round(n*100)}
export function monthlyExpenses(lines:ExpenseLine[],month:string,kind:'Gasto'|'Costo',group:'account'|'provider'='account'){
 const bounds=expenseMonthBounds(month),groups=new Map<string,{id:string;label:string;current:number;previous:number}>()
 let current=0,previous=0
 const detail:ExpenseLine[]=[]
 for(const l of lines){
  if(l.kind!==kind||l.entry.entry_date<bounds.previousFrom||l.entry.entry_date>bounds.to)continue
  const amount=cents(l.debit)-cents(l.credit),isCurrent=l.entry.entry_date>=bounds.from
  const id=group==='account'?l.account_id:l.provider_key||l.provider,label=group==='account'?`${l.account_code} · ${l.account_name}`:l.provider
  const row=groups.get(id)||{id,label,current:0,previous:0}
  if(isCurrent){row.current+=amount;current+=amount;detail.push(l)}else{row.previous+=amount;previous+=amount}groups.set(id,row)
 }
 const ranking=[...groups.values()].sort((a,b)=>b.current-a.current||a.label.localeCompare(b.label)).map(r=>({...r,current:r.current/100,previous:r.previous/100,change:(r.current-r.previous)/100,percent:r.previous>0?(r.current-r.previous)/r.previous*100:null}))
 return {bounds,current:current/100,previous:previous/100,change:(current-previous)/100,ranking,detail:detail.sort((a,b)=>b.entry.entry_date.localeCompare(a.entry.entry_date)||b.entry.entry_number-a.entry.entry_number||a.id.localeCompare(b.id))}
}
