import type { ReportPdfData, ReportPdfRow } from '@/src/components/pdf/report-pdf'
import type { StyledXlsxRow } from './xlsx'
import { reportCsvCell } from './report-view'
import { financialCents } from './finance-report'

export function groupedFinancialReport(data: ReportPdfData): ReportPdfData {
  const groups=new Map<string,ReportPdfRow[]>()
  for(const row of data.rows){const key=`${row.__party_id||row.party}:${row.currency}`;groups.set(key,[...(groups.get(key)||[]),row])}
  const rows:ReportPdfRow[]=[]
  const totals=new Map<string,Record<string,number>>()
  for(const items of groups.values()){
    const first=items[0],subtotal:ReportPdfRow={party:`Subtotal · ${first.party}`,currency:first.currency,__rowType:'subtotal'}
    rows.push({party:`${first.party} · ${first.currency}`,__rowType:'group'},...items)
    for(const c of data.columns.filter(c=>c.format==='money')){
      const cents=items.reduce((sum,row)=>sum+financialCents(Number(row[c.key]||0)),0)
      subtotal[c.key]=cents/100
      const currency=String(first.currency),total=totals.get(currency)||{};total[c.key]=(total[c.key]||0)+cents;totals.set(currency,total)
    }
    rows.push(subtotal)
  }
  for(const[currency,total]of totals)rows.push({party:'TOTAL GENERAL',currency,__rowType:'total',...Object.fromEntries(Object.entries(total).map(([k,v])=>[k,v/100]))})
  return {...data,complete:true,rows,filters:[...data.filters,'Una sola hoja, con bloques y subtotales por tercero/moneda.']}
}
export function financialCsv(data: ReportPdfData) {
  const records:(string|number)[][]=[[data.title,data.subtitle],[data.dateRange||''],...data.filters.map(f=>[f]),...data.metrics.map(m=>[m.label,m.value]),[],data.columns.map(c=>c.label),...data.rows.map(row=>data.columns.map(c=>row[c.key]??'')),...(data.signatures||[]).map(s=>[s.label,s.name,s.role])]
  return '\uFEFF'+records.map(row=>row.map(reportCsvCell).join(',')).join('\r\n')
}
export function financialExcelRows(data: ReportPdfData, company: {legal_name?: string|null;rtn?:string|null;address?:string|null;phone?:string|null;email?:string|null}) : StyledXlsxRow[] {
  return [
    {cells:[company.legal_name||'Forwarders ERP'],kind:'title'},
    {cells:[`RTN: ${company.rtn||'—'}`,company.address||'']},
    {cells:[company.phone||'',company.email||'']},
    {cells:[data.title],kind:'title'},{cells:[data.subtitle,data.dateRange||'']},
    ...data.filters.map(f=>({cells:[f],kind:'note' as const})),
    ...data.metrics.map(m=>({cells:[m.label,m.value]})),
    {cells:data.columns.map(c=>c.label),kind:'header'},
    ...data.rows.map(row=>({cells:data.columns.map(c=>row[c.key]??''),kind:row.__rowType as StyledXlsxRow['kind']})),
    ...(data.signatures||[]).flatMap(s=>[{cells:['', '']},{cells:[s.label,s.name,s.role]},{cells:['____________________________']}]),
  ]
}
