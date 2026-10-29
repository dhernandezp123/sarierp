import type { ReportPdfData } from '@/src/components/pdf/report-pdf'
import { formatDate, formatMoney, parseDateValue } from './format'

export type FinanceSide = 'receivable' | 'payable'
export type FinanceStatus = 'Todos' | 'Pendientes' | 'Vencidos' | 'Pagados'
export type FinanceDocument = {
  id: string; root_id: string; party_id: string; party_name: string; currency: string
  document_type: string; document_number: string; created_on: string; issue_date: string
  due_date: string | null; original_amount: number; credit_adjustment: number
  paid_amount: number; withholding_amount: number; balance: number
  days_overdue: number; status: string; reconstructed: boolean; needs_review: boolean
}
export type FinanceMovement = {
  id: string; party_id: string; party_name: string; currency: string; movement_date: string
  kind: string; reference: string; description: string; debit: number; credit: number; reconstructed: boolean
}
export type FinanceFilters = {
  parties?:string[];partyNames?:string[];statuses?:Exclude<FinanceStatus,'Todos'>[];documentTypes?:string[]
  party: string; currency: string; status: FinanceStatus; cutoff: string; from: string; to: string
  dateField: 'issue_date' | 'created_on' | 'due_date'; includeDebit: boolean
}
export const agingColumns = [
  { key: 'current', label: 'Actual / no vencido' }, { key: 'd30', label: 'Mora 1–30' },
  { key: 'd60', label: 'Mora 31–60' }, { key: 'd90', label: 'Mora 61–90' },
  { key: 'older', label: 'Mora +90' },
] as const
export type AgingKey = typeof agingColumns[number]['key']

export function financialCents(value: number | string) {
  const amount = Number(value)
  if (value === '' || !Number.isFinite(amount) || Math.abs(amount) > 999999999999) throw new Error('Hay un importe financiero inválido.')
  return Math.round(amount * 100)
}
export function validateFinanceDates(cutoff: string, from = '', to = '') {
  for (const date of [cutoff, from, to].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parseDateValue(date)) throw new Error('Revisa las fechas del reporte.')
  if (!cutoff || (from && to && from > to)) throw new Error('Selecciona una fecha de corte y un período válido.')
}
export function agingBucket(days: number): AgingKey {
  if (!Number.isInteger(days) || days < 0) throw new Error('Días vencidos inválidos.')
  return days === 0 ? 'current' : days <= 30 ? 'd30' : days <= 60 ? 'd60' : days <= 90 ? 'd90' : 'older'
}
export function filterFinanceDocuments(documents: FinanceDocument[], filters: FinanceFilters) {
  validateFinanceDates(filters.cutoff, filters.from, filters.to)
  return documents.filter(d => {
    if (filters.parties ? filters.parties.length&&!filters.parties.includes(d.party_id) : filters.party&&d.party_id!==filters.party) return false
    if (filters.documentTypes?.length&&!filters.documentTypes.includes(d.document_type))return false
    if (filters.currency !== 'Todos' && d.currency !== filters.currency) return false
    if (!filters.includeDebit && d.document_type === 'Nota de Débito') return false
    const date = d[filters.dateField]
    if ((filters.from || filters.to) && !date) return false
    if ((filters.from && date! < filters.from) || (filters.to && date! > filters.to)) return false
    const balance = financialCents(d.balance)
    const statuses=filters.statuses??(filters.status==='Todos'?[]:[filters.status])
    if(statuses.length&&!statuses.some(status=>status==='Pendientes'?balance>0:status==='Vencidos'?balance>0&&d.days_overdue>0:balance===0&&!d.needs_review))return false
    return true
  }).sort((a,b) => a.party_name.localeCompare(b.party_name, 'es') || a.party_id.localeCompare(b.party_id)
    || a.currency.localeCompare(b.currency) || a.issue_date.localeCompare(b.issue_date) || a.id.localeCompare(b.id))
}
export function financeAging(documents: FinanceDocument[]) {
  const groups = new Map<string, { id: string; party: string; currency: string; current: number; d30: number; d60: number; d90: number; older: number; unclassified: number; total: number }>()
  for (const d of documents) {
    if (d.needs_review) throw new Error('Hay documentos por revisar; corrige sus importes antes de totalizar la cartera.')
    const cents = financialCents(d.balance)
    if (cents <= 0) continue
    const key = `${d.party_id}:${d.currency}`
    const row = groups.get(key) || { id:key, party:d.party_name, currency:d.currency, current:0, d30:0, d60:0, d90:0, older:0, unclassified:0, total:0 }
    // Missing credit terms must not silently appear as current/non-overdue debt.
    if (!d.due_date) row.unclassified += cents
    else row[agingBucket(d.days_overdue)] += cents
    row.total += cents; groups.set(key,row)
  }
  return [...groups.values()].map(r => ({ ...r, ...Object.fromEntries(['current','d30','d60','d90','older','unclassified','total'].map(k=>[k,r[k as AgingKey | 'unclassified' | 'total']/100])) }))
}
export function financeStatement(movements: FinanceMovement[], from: string, to: string, kinds: string[] = []) {
  validateFinanceDates(to, from, to)
  const groups = new Map<string, { id:string; party:string; currency:string; opening:number; debit:number; credit:number; closing:number }>()
  const rows: (FinanceMovement & { balance:number })[] = []
  for (const m of [...movements].filter(m=>m.movement_date <= to).sort((a,b)=>a.movement_date.localeCompare(b.movement_date)||a.id.localeCompare(b.id))) {
    const key=`${m.party_id}:${m.currency}`
    const r=groups.get(key)||{id:key,party:m.party_name,currency:m.currency,opening:0,debit:0,credit:0,closing:0}
    const debit=financialCents(m.debit),credit=financialCents(m.credit)
    r.closing+=debit-credit
    if(m.movement_date<from)r.opening=r.closing
    else {r.debit+=debit;r.credit+=credit;if(!kinds.length||kinds.includes(m.kind))rows.push({...m,balance:r.closing/100})}
    groups.set(key,r)
  }
  return { rows, groups:[...groups.values()].map(r=>({...r,opening:r.opening/100,debit:r.debit/100,credit:r.credit/100,closing:r.closing/100})) }
}
export function financeDocumentReport(documents: FinanceDocument[], filters: FinanceFilters, side: FinanceSide, aging = false): ReportPdfData {
  const rows=filterFinanceDocuments(documents,filters)
  const title=aging?'Antigüedad de saldos':side==='receivable'?'Estado de cuenta por cobrar':'Estado de cuenta de proveedores'
  const columns=aging?[{key:'party',label:side==='receivable'?'Cliente':'Proveedor',width:'24%'},{key:'currency',label:'Moneda'},...agingColumns.map(c=>({...c,align:'right' as const})),{key:'unclassified',label:'Sin vencimiento',align:'right' as const},{key:'total',label:'Total',align:'right' as const}]:[
    {key:'party',label:side==='receivable'?'Cliente':'Proveedor',width:'18%'},{key:'currency',label:'Moneda'},
    {key:'document',label:'Documento',width:'18%'},{key:'created',label:'Creación'},{key:'issue',label:'Emisión'},
    {key:'due',label:'Vencimiento'},{key:'days',label:'Días vencidos'},{key:'status',label:'Estado'},
    {key:'original',label:'Total',align:'right' as const},{key:'credit',label:'NC aplicada',align:'right' as const},
    {key:'paid',label:'Pagado',align:'right' as const},...(side==='payable'?[{key:'withheld',label:'Retenido',align:'right' as const}]:[]),{key:'balance',label:'Por pagar',align:'right' as const},
  ]
  const totals=new Map<string,number>()
  for(const row of rows)totals.set(row.currency,(totals.get(row.currency)||0)+financialCents(row.balance))
  const formattedColumns=columns.map(c=>({...c,...(['current','d30','d60','d90','older','unclassified','total','original','credit','paid','withheld','balance'].includes(c.key)?{format:'money' as const}:c.key==='days'?{format:'integer' as const}:{})}))
  return {complete:true,title,subtitle:filters.parties?.length?filters.partyNames?.join(' · ')||'Terceros seleccionados':filters.party?rows[0]?.party_name||'Tercero seleccionado':'Listado general',dateRange:`Al ${formatDate(filters.cutoff)}`,generatedAt:formatDate(new Date()),
    filters:[`Estado: ${filters.statuses?(filters.statuses.join(', ')||'Todos'):filters.status}`,`Moneda: ${filters.currency}`,filters.documentTypes?`Tipos de documento: ${filters.documentTypes.join(', ')||'Todos los disponibles'}`:filters.includeDebit?'Facturas y notas de débito':'Solo facturas; subtotal de los documentos seleccionados',
      ...(filters.parties?.length?[`Terceros: ${filters.partyNames?.join(', ')||'Selección aplicada'}`]:[]),
      'Mora calculada desde vencimiento; Actual = saldo no vencido.',
      ...(filters.from||filters.to?[`Documentos por ${filters.dateField==='due_date'?'vencimiento':filters.dateField==='created_on'?'creación':'emisión'}: ${formatDate(filters.from)} — ${formatDate(filters.to)}. Cartera parcial.`]:[]),
      ...(rows.some(d=>d.reconstructed)?['Contiene datos anteriores reconstruidos; revisar la cobertura histórica indicada.']:[]),
      ...(rows.some(d=>d.needs_review)?['Hay documentos por revisar; sus saldos requieren conciliación.']:[]),
      'Las NC reducen el saldo y no son efectivo recibido. Las ND se presentan una sola vez.'],
    metrics:[...totals].map(([currency,cents])=>({label:`Saldo ${currency}`,value:formatMoney(cents/100,currency)})),columns:formattedColumns,
    rows:aging?financeAging(rows):rows.map(d=>({__party_id:d.party_id,party:d.party_name,currency:d.currency,document:d.document_number,created:formatDate(d.created_on),issue:formatDate(d.issue_date),due:formatDate(d.due_date),days:d.days_overdue,status:d.needs_review?'Por revisar':d.status,original:Number(d.original_amount),credit:Number(d.credit_adjustment),paid:Number(d.paid_amount),withheld:Number(d.withholding_amount),balance:Number(d.balance)})),
  }
}

export function financeMovementReport(movements: FinanceMovement[], filters: FinanceFilters, side: FinanceSide, kinds: string[] = []): ReportPdfData {
  const selected=movements.filter(m=>(filters.parties?(!filters.parties.length||filters.parties.includes(m.party_id)):(!filters.party||m.party_id===filters.party))&&(filters.currency==='Todos'||m.currency===filters.currency))
  const statement=financeStatement(selected,filters.from||'0001-01-01',filters.cutoff,kinds)
  const rows=statement.rows.filter(m=>filters.includeDebit||m.kind!=='Nota de Débito')
  const totals=new Map<string,{opening:number;debit:number;credit:number;closing:number}>()
  for(const group of statement.groups){const sum=totals.get(group.currency)||{opening:0,debit:0,credit:0,closing:0};for(const key of ['opening','debit','credit','closing'] as const)sum[key]+=financialCents(group[key]);totals.set(group.currency,sum)}
  const detailFilters=[...(kinds.length?[`Tipos visibles: ${kinds.join(', ')}. Los saldos incluyen todos los tipos.`]:[]),...(!filters.includeDebit?['Notas de débito ocultas en el detalle.']:[])]
  return {complete:true,title:side==='receivable'?'Estado de cuenta del cliente':'Estado de cuenta del proveedor',subtitle:'Auxiliar consolidado de movimientos',dateRange:`${filters.from?formatDate(filters.from):'Inicio del historial'} al ${formatDate(filters.cutoff)}`,generatedAt:formatDate(new Date()),
    filters:['El saldo incluye todos los movimientos; los filtros por tipo solo ocultan detalle.',...detailFilters,...(filters.parties?.length?[`Terceros: ${filters.partyNames?.join(', ')||'Selección aplicada'}`]:[]),...(side==='receivable'?['El estado incluye los recibos completos, una vez, y los anticipos. Los anticipos sin aplicar no liquidan facturas: Por pagar se consulta en Documentos y el remanente en Cobranza.']:['Los abonos incluyen pagos y retenciones; las retenciones no son salida bancaria.']),...(selected.some(m=>m.reconstructed)?['Incluye apertura reconstruida a partir de los registros disponibles.']:[])],
    metrics:[...totals].flatMap(([currency,g])=>[{label:`Apertura ${currency}`,value:formatMoney(g.opening/100,currency)},{label:`Cargos ${currency}`,value:formatMoney(g.debit/100,currency)},{label:`Abonos ${currency}`,value:formatMoney(g.credit/100,currency)},{label:`Saldo ${currency}`,value:formatMoney(g.closing/100,currency)}]),
    columns:[{key:'party',label:side==='receivable'?'Cliente':'Proveedor'},{key:'currency',label:'Moneda'},{key:'date',label:'Fecha'},{key:'kind',label:'Tipo'},{key:'reference',label:'Referencia'},{key:'description',label:'Descripción'},{key:'debit',label:'Cargo',align:'right',format:'money'},{key:'credit',label:'Abono',align:'right',format:'money'},{key:'balance',label:'Saldo',align:'right',format:'money'}],
    rows:rows.map(m=>({__party_id:m.party_id,party:m.party_name,currency:m.currency,date:formatDate(m.movement_date),kind:m.kind,reference:m.reference,description:m.description,debit:Number(m.debit),credit:Number(m.credit),balance:m.balance})),
  }
}
