'use client'
import {useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {Activity,Search} from 'lucide-react'
import {useUser} from '@/src/hooks/useUser'
import {supabase} from '@/src/lib/supabase/client'
import {FinancePageHeader} from '@/src/components/invoicing/FinanceWorkspace'
import {FinancialReportExport} from '@/src/components/invoicing/FinancialReportExport'
import {Pagination} from '@/src/components/ui/Pagination'
import {FormField} from '@/src/components/ui/form-field'
import {formatDate,formatDateTime} from '@/src/lib/format'
import {cardClass,fieldClass as inputClass,secondaryButtonClass} from '@/src/lib/ui-classes'
import {activityKinds,activityOrders,activityRanges,activityToday,clientActivityReport,clientAgeDays,defaultActivityFilters,filterClientActivity,loadClientActivity,type ActivityFilters,type ClientActivityRow} from '@/src/lib/client-activity-report'

export default function ClientActivityPage(){
 const {user,profile,loading}=useUser()
 if(loading)return <p role="status">Consultando usuario…</p>
 if(!user||!profile||profile.status!=='Aprobado'||!profile.is_active||!['Admin','Ventas','Contabilidad','Finanzas'].includes(profile.rol))return <p role="alert">No tienes permiso para consultar este reporte.</p>
 return <ActivityTable key={`${user.id}:${profile.tenant_id}:${profile.rol}:${profile.status}:${profile.is_active}`}/>
}
export function ActivityTable(){
 const [state,setState]=useState<{rows:ClientActivityRow[];thresholds:number[];generatedAt:string}|null>(null)
 const [error,setError]=useState(''),[page,setPage]=useState(1),[size,setSize]=useState(25),[refresh,setRefresh]=useState(0)
 const [filters,setFilters]=useState<ActivityFilters>({...defaultActivityFilters})
 useEffect(()=>{
  let active=true
  void loadClientActivity(async(offset,limit)=>await supabase.rpc('get_client_activity',{p_offset:offset,p_limit:limit}),()=>active)
   .then(data=>{if(active){setState({...data,generatedAt:new Date().toISOString()});setError('')}})
   .catch(cause=>{if(active){setError(cause instanceof Error?cause.message:'No se pudo consultar la actividad de clientes.');setState(null)}})
  return()=>{active=false}
 },[refresh])
 const today=state?activityToday(state.generatedAt):''
 const rows=useMemo(()=>state?filterClientActivity(state.rows,filters,today):[],[state,filters,today])
 const report=useMemo(()=>state?clientActivityReport(rows,filters,state.generatedAt):null,[state,rows,filters])
 function change<K extends keyof ActivityFilters>(key:K,value:ActivityFilters[K]){setFilters(current=>({...current,[key]:value}));setPage(1)}
 function reload(){setState(null);setError('');setPage(1);setRefresh(v=>v+1)}
 return <div className="space-y-6">
  <FinancePageHeader eyebrow="Clientes · Seguimiento comercial" title="Actividad de clientes" description="Consulta cuándo cotizó o movió cada cliente y exporta el resultado con tus filtros." icon={Activity} actions={<><Link className={secondaryButtonClass} href="/clientes">Volver a clientes</Link>{report&&<FinancialReportExport key={refresh} data={report} filename="actividad-clientes" disabled={!rows.length}/>}</>}/>
  <section className={`${cardClass} space-y-4`} aria-label="Filtros de actividad">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4"/>Buscar y filtrar</h2><div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} onClick={()=>{setFilters({...defaultActivityFilters});setPage(1)}}>Restablecer filtros</button><button type="button" className={secondaryButtonClass} onClick={reload}>Actualizar</button></div></div>
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <FormField label="Nombre del cliente"><input type="search" className={inputClass} placeholder="Buscar por nombre…" value={filters.search} onChange={e=>change('search',e.target.value)}/></FormField>
    <FormField label="Ordenar por"><select className={inputClass} value={filters.order} onChange={e=>change('order',e.target.value as ActivityFilters['order'])}>{Object.entries(activityOrders).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
    <FormField label="Tipo de actividad"><select className={inputClass} value={filters.kind} onChange={e=>change('kind',e.target.value as ActivityFilters['kind'])}>{Object.entries(activityKinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
    <FormField label="Tiempo sin actividad"><select className={inputClass} value={filters.inactivity} onChange={e=>change('inactivity',e.target.value as ActivityFilters['inactivity'])}>{Object.entries(activityRanges).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
    <FormField label="Antigüedad desde el registro"><select className={inputClass} value={filters.age} onChange={e=>change('age',e.target.value as ActivityFilters['age'])}>{Object.entries(activityRanges).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></FormField>
   </div>
   <p className="text-xs leading-relaxed text-slate-500">Antigüedad: días desde el registro del cliente. Inactividad: días sin cotización ni movimiento efectivo; para clientes nuevos se toma su fecha de registro. Editar un perfil no reinicia el contador. Umbrales de alerta: {state?.thresholds.join(' / ')||'30 / 60 / 90'} días.</p>
  </section>
  <section className={`${cardClass} space-y-4`} aria-label="Resultados de actividad">
   {error?<div role="alert" className="space-y-3 text-red-600"><p>{error}</p><button type="button" className={secondaryButtonClass} onClick={reload}>Reintentar</button></div>:!state?<p role="status">Consultando la cartera completa…</p>:<>
    <div className="flex flex-wrap justify-between gap-3 text-xs text-slate-500"><p role="status">{rows.length} de {state.rows.length} clientes · Consultado el {formatDateTime(state.generatedAt)}</p><p>La exportación incluye todos los resultados filtrados en el orden seleccionado.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm"><thead><tr>{['Cliente','Registro','Antigüedad','Última cotización','Última operación registrada','Último movimiento efectivo','Inactividad'].map(t=><th key={t} scope="col" className="p-3 text-left">{t}</th>)}</tr></thead><tbody>{rows.slice((page-1)*size,page*size).map(row=><tr key={row.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800"><td className="p-3 font-medium">{row.name}</td><td className="p-3 whitespace-nowrap">{formatDate(row.created_date,'Sin fecha')}</td><td className="p-3">{clientAgeDays(row,today)===null?'Sin fecha base':`${clientAgeDays(row,today)} días`}</td><td className="p-3 whitespace-nowrap">{formatDate(row.last_quotation,'Sin cotizaciones')}</td><td className="p-3 whitespace-nowrap">{formatDate(row.last_operation,'Sin operaciones')}</td><td className="p-3 whitespace-nowrap">{formatDate(row.last_movement,'Sin movimiento registrado')}</td><td className="p-3"><span className={row.inactivity_days!==null&&state.thresholds.some(t=>row.inactivity_days!>=t)?'font-semibold text-amber-700 dark:text-amber-300':''}>{row.inactivity_days===null?'Sin fecha base':`${row.inactivity_days} días`}</span></td></tr>)}</tbody></table></div>
    {!rows.length&&<p className="py-6 text-center text-sm text-slate-500">{state.rows.length?'Sin clientes que coincidan con los filtros seleccionados.':'Sin clientes disponibles para tu usuario.'}</p>}
    {!!rows.length&&<Pagination page={page} pageSize={size} total={rows.length} onPageChange={setPage} onPageSizeChange={value=>{setSize(value);setPage(1)}}/>}
   </>}
   <p className="text-xs leading-relaxed text-slate-500">Movimiento efectivo: salida real de booking vigente o recepción de paquete Miami. No se usan fechas de salida estimadas ni modificaciones generales. Ventas consulta únicamente su cartera asignada. Reporte para uso interno.</p>
  </section>
 </div>
}
