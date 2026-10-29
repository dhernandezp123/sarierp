import type { AccountKind } from './accounting'
import type { ReportPdfData } from '@/src/components/pdf/report-pdf'
import { formatDate,formatMoney } from './format'
export type BookLine={id:string;account_id:string;account_code:string;account_name:string;kind:AccountKind;debit:number;credit:number;description:string;entry_id:string;entry_number:number;entry_date:string;entry_description:string;source_type:string}
export type BookType='journal'|'ledger'|'trial'|'balance'|'income'
export const bookLabels:Record<BookType,string>={journal:'Libro diario consolidado',ledger:'Libro mayor por cuenta',trial:'Balance de comprobación',balance:'Balance general',income:'Estado de resultados'}
export function accountingBook(lines:BookLine[],type:BookType,from:string,to:string,accountId=''):ReportPdfData {
 if(!from||!to||from>to)throw new Error('Selecciona un período válido.')
 if(type==='ledger'&&!accountId)throw new Error('Selecciona una cuenta para el libro mayor.')
 const ordered=lines.filter(l=>l.entry_date<=to).sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.entry_number-b.entry_number||a.id.localeCompare(b.id))
 const cents=(n:number)=>{if(!Number.isFinite(Number(n)))throw new Error('Importe contable inválido.');return Math.round(Number(n)*100)}
 const totals=new Map<string,{code:string;name:string;kind:AccountKind;opening:number;debit:number;credit:number;closing:number}>()
 for(const line of ordered){
  const a=totals.get(line.account_id)||{code:line.account_code,name:line.account_name,kind:line.kind,opening:0,debit:0,credit:0,closing:0}
  const debit=cents(line.debit),credit=cents(line.credit);a.closing+=debit-credit
  if(line.entry_date<from)a.opening+=debit-credit;else{a.debit+=debit;a.credit+=credit}totals.set(line.account_id,a)
 }
 const report:ReportPdfData={title:bookLabels[type],subtitle:'Contabilidad · HNL',dateRange:type==='balance'?`Al ${formatDate(to)}`:`${formatDate(from)} — ${formatDate(to)}`,generatedAt:formatDate(new Date()),filters:['Solo partidas contabilizadas; los saldos iniciales no cargados no forman parte de este reporte.'],metrics:[],columns:[],rows:[]}
 const metric=(label:string,value:number)=>({label,value:formatMoney(value/100,'HNL')})
 if(type==='journal'||type==='ledger'){
  const account=totals.get(accountId),opening=type==='ledger'?account?.opening||0:0
  let balance=opening,debit=0,credit=0
  report.columns=[{key:'date',label:'Fecha',width:'11%'},{key:'entry',label:'Asiento',width:'8%'},{key:'account',label:'Cuenta',width:'24%'},{key:'description',label:'Comentario / origen',width:'29%'},{key:'debit',label:'Debe HNL',align:'right'},{key:'credit',label:'Haber HNL',align:'right'}]
  if(type==='ledger')report.columns.push({key:'balance',label:'Saldo D−H',align:'right'})
  for(const l of ordered.filter(l=>l.entry_date>=from&&(type!=='ledger'||l.account_id===accountId))){
   debit+=cents(l.debit);credit+=cents(l.credit);balance+=cents(l.debit)-cents(l.credit)
   report.rows.push({date:formatDate(l.entry_date),entry:l.entry_number,account:`${l.account_code} · ${l.account_name}`,description:`${l.description||l.entry_description} · ${l.source_type}`,debit:Number(l.debit),credit:Number(l.credit),balance:balance/100})
  }
  report.metrics=[...(type==='ledger'?[metric('Saldo inicial D−H',opening)]:[]),metric('Debe',debit),metric('Haber',credit),metric(type==='ledger'?'Saldo final D−H':'Diferencia',type==='ledger'?balance:debit-credit)]
  if(type==='ledger')report.filters.push(account?`${account.code} · ${account.name}`:'Cuenta sin movimientos','Saldo positivo: deudor. Saldo negativo: acreedor.')
  return report
 }
 const accounts=[...totals.values()].sort((a,b)=>a.code.localeCompare(b.code))
 if(type==='trial'){
  report.columns=[{key:'code',label:'Código'},{key:'name',label:'Cuenta',width:'30%'},{key:'opening',label:'Inicial D−H',align:'right'},{key:'debit',label:'Debe',align:'right'},{key:'credit',label:'Haber',align:'right'},{key:'closing',label:'Final D−H',align:'right'}]
  report.rows=accounts.map(a=>({code:a.code,name:a.name,opening:a.opening/100,debit:a.debit/100,credit:a.credit/100,closing:a.closing/100}))
  const debit=accounts.reduce((s,a)=>s+a.debit,0),credit=accounts.reduce((s,a)=>s+a.credit,0)
  report.metrics=[metric('Debe del período',debit),metric('Haber del período',credit),metric('Diferencia',debit-credit)]
  return report
 }
 report.columns=[{key:'kind',label:'Grupo'},{key:'code',label:'Código'},{key:'name',label:'Cuenta',width:'40%'},{key:'balance',label:'HNL',align:'right'}]
 if(type==='income'){
  const result=accounts.filter(a=>['Ingreso','Costo','Gasto'].includes(a.kind));let income=0,cost=0,expense=0
  report.rows=result.map(a=>{const balance=a.kind==='Ingreso'?a.credit-a.debit:a.debit-a.credit;if(a.kind==='Ingreso')income+=balance;else if(a.kind==='Costo')cost+=balance;else expense+=balance;return{kind:a.kind,code:a.code,name:a.name,balance:balance/100}})
  report.metrics=[metric('Ingresos',income),metric('Costos',cost),metric('Gastos',expense),metric('Resultado del período',income-cost-expense)]
 }else{
  let assets=0,liabilities=0,equity=0,result=0
  for(const a of accounts){if(a.kind==='Ingreso'||a.kind==='Costo'||a.kind==='Gasto'){result-=a.closing;continue}
   if(a.kind==='Orden'||a.kind==='Resultado')continue
   const balance=a.kind==='Activo'?a.closing:-a.closing
   if(a.kind==='Activo')assets+=balance;else if(a.kind==='Pasivo')liabilities+=balance;else equity+=balance
   report.rows.push({kind:a.kind,code:a.code,name:a.name,balance:balance/100})
  }
  report.rows.push({kind:'Patrimonio',code:'',name:'Resultado acumulado registrado pendiente de cierre',balance:result/100})
  report.metrics=[metric('Activo',assets),metric('Pasivo',liabilities),metric('Patrimonio y resultado',equity+result),metric('Diferencia',assets-liabilities-equity-result)]
 }
 return report
}
