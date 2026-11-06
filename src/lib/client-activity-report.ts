import {calendarDaysUntil,formatDate,parseDateValue} from './format'
import type {ReportPdfData} from '@/src/components/pdf/report-pdf'

export type ClientActivityRow={id:string;name:string;created_date:string|null;last_quotation:string|null;last_operation:string|null;last_movement:string|null;inactivity_days:number|null}
export const activityOrders={inactive_desc:'Mayor inactividad',inactive_asc:'Menor inactividad',name_asc:'Nombre: A–Z',name_desc:'Nombre: Z–A',oldest:'Mayor antigüedad',newest:'Menor antigüedad'} as const
export const activityRanges={all:'Todos',recent:'0–29 días',month:'30–59 días',two_months:'60–89 días',quarter:'90–179 días',half_year:'180–364 días',year:'365 días o más',unknown:'Sin fecha base'} as const
export const activityKinds={all:'Todos',no_quotes:'Sin cotizaciones',no_movement:'Sin movimiento efectivo',with_movement:'Con movimiento efectivo'} as const
export type ActivityFilters={search:string;inactivity:keyof typeof activityRanges;age:keyof typeof activityRanges;kind:keyof typeof activityKinds;order:keyof typeof activityOrders}
export const defaultActivityFilters:ActivityFilters={search:'',inactivity:'all',age:'all',kind:'all',order:'inactive_desc'}
export function activityToday(generatedAt:string){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tegucigalpa',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(generatedAt)).map(p=>[p.type,p.value]))
 return `${parts.year}-${parts.month}-${parts.day}`
}
export function clientAgeDays(row:ClientActivityRow,today:string){
 const base=parseDateValue(row.created_date)
 const days=base?calendarDaysUntil(today,base):null
 return days===null?null:Math.max(0,days)
}
function inRange(days:number|null,range:keyof typeof activityRanges){
 if(range==='all')return true
 if(range==='unknown')return days===null
 if(days===null)return false
 const [min,max]=({recent:[0,29],month:[30,59],two_months:[60,89],quarter:[90,179],half_year:[180,364],year:[365,Infinity]} as const)[range]
 return days>=min&&days<=max
}
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim()
export function filterClientActivity(rows:ClientActivityRow[],filters:ActivityFilters,today:string){
 const query=normalize(filters.search),collator=new Intl.Collator('es',{sensitivity:'base',numeric:true})
 const nullable=(a:number|null,b:number|null,direction:number)=>a===null?(b===null?0:1):b===null?-1:(a-b)*direction
 return rows.filter(row=>(!query||normalize(row.name).includes(query))&&inRange(row.inactivity_days,filters.inactivity)&&inRange(clientAgeDays(row,today),filters.age)&&
  (filters.kind==='all'||filters.kind==='no_quotes'&&!row.last_quotation||filters.kind==='no_movement'&&!row.last_movement||filters.kind==='with_movement'&&!!row.last_movement))
 .sort((a,b)=>{
  let result=0
  if(filters.order==='name_asc'||filters.order==='name_desc')result=collator.compare(a.name,b.name)*(filters.order==='name_asc'?1:-1)
  else if(filters.order==='oldest'||filters.order==='newest')result=nullable(clientAgeDays(a,today),clientAgeDays(b,today),filters.order==='oldest'?-1:1)
  else result=nullable(a.inactivity_days,b.inactivity_days,filters.order==='inactive_desc'?-1:1)
  return result||collator.compare(a.name,b.name)||a.id.localeCompare(b.id)
 })
}

// Read every authorized RPC page before filtering or exporting; never export a partial result.
export async function loadClientActivity(fetchPage:(offset:number,limit:number)=>Promise<{data:unknown;error:unknown}>,isCurrent:()=>boolean=()=>true){
 const rows:ClientActivityRow[]=[],ids=new Set<string>();let total:number|null=null,thresholds:number[]=[]
 while(total===null||rows.length<total){
  if(!isCurrent())throw new Error('Consulta cancelada.')
  const {data,error}=await fetchPage(rows.length,100)
  if(!isCurrent())throw new Error('Consulta cancelada.')
  const page=data as {rows?:ClientActivityRow[];total?:number;thresholds?:number[]}|null
  if(error||!page||!Array.isArray(page.rows)||typeof page.total!=='number'||!Number.isSafeInteger(page.total)||page.total<0||!Array.isArray(page.thresholds)||!page.thresholds.every(v=>Number.isSafeInteger(v)&&v>=0))throw new Error('No se pudo consultar la actividad completa de clientes.')
  if(total!==null&&total!==page.total)throw new Error('La cartera cambió durante la consulta. Actualiza para volver a cargarla.')
  total=page.total;thresholds=page.thresholds
  if(total>50000)throw new Error('La cartera supera el límite del reporte. Contacta al administrador.')
  if(!page.rows.length&&rows.length<total)throw new Error('La consulta quedó incompleta. Actualiza para volver a cargarla.')
  for(const row of page.rows){
   if(!row||typeof row.id!=='string'||typeof row.name!=='string'||ids.has(row.id)||!['created_date','last_quotation','last_operation','last_movement'].every(key=>row[key as keyof ClientActivityRow]===null||typeof row[key as keyof ClientActivityRow]==='string')||!(row.inactivity_days===null||Number.isSafeInteger(row.inactivity_days)&&row.inactivity_days>=0))throw new Error('La actividad cambió o contiene datos incompletos. Actualiza para volver a cargarla.')
   ids.add(row.id);rows.push(row)
  }
  if(rows.length>total)throw new Error('La consulta contiene un total inconsistente.')
 }
 return {rows,thresholds}
}
export function clientActivityReport(rows:ClientActivityRow[],filters:ActivityFilters,generatedAt:string):ReportPdfData{
 const today=activityToday(generatedAt)
 return {title:'Actividad de clientes',subtitle:'Seguimiento comercial · Uso interno',complete:true,generatedAt,
  filters:[`Nombre: ${filters.search.trim()||'Todos'}`,`Inactividad: ${activityRanges[filters.inactivity]}`,`Antigüedad: ${activityRanges[filters.age]}`,`Actividad: ${activityKinds[filters.kind]}`,`Orden: ${activityOrders[filters.order]}`,'Antigüedad desde el registro. Inactividad sin cotizar ni movimiento efectivo; editar el perfil no reinicia el contador.'],
  metrics:[{label:'Clientes filtrados',value:String(rows.length)}],
  columns:[{key:'name',label:'Cliente',width:'22%'},{key:'registered',label:'Registro',width:'11%'},{key:'age',label:'Antigüedad (días)',width:'10%'},{key:'quotation',label:'Última cotización',width:'14%'},{key:'operation',label:'Última operación registrada',width:'15%'},{key:'movement',label:'Último movimiento efectivo',width:'17%'},{key:'inactive',label:'Inactividad (días)',width:'11%'}],
  rows:rows.map(row=>({name:row.name,registered:formatDate(row.created_date,'Sin fecha'),age:clientAgeDays(row,today)??'Sin fecha base',quotation:formatDate(row.last_quotation,'Sin cotizaciones'),operation:formatDate(row.last_operation,'Sin operaciones'),movement:formatDate(row.last_movement,'Sin movimiento'),inactive:row.inactivity_days??'Sin fecha base'}))}
}
