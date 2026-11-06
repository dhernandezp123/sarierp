import test from 'node:test'
import assert from 'node:assert/strict'
import loadTs from './load-ts.mjs'
import {mountPage} from './page-harness.mjs'
import React from 'react'
import * as renderer from '@react-pdf/renderer'
import {inflateSync} from 'node:zlib'
const lib=loadTs('src/lib/client-activity-report.ts')
const generatedAt='2026-11-06T03:00:00Z'
const row=(id,extra={})=>({id,name:`Cliente ${id}`,created_date:'2026-10-01',last_quotation:null,last_operation:null,last_movement:null,inactivity_days:35,...extra})
const filter=(rows,extra={})=>lib.filterClientActivity(rows,{...lib.defaultActivityFilters,...extra})

test('búsqueda sin acentos, orden alfabético e inactividad; nulos al final',()=>{
 const rows=[row('b',{name:'Álvaro',created_date:'2020-01-01',inactivity_days:0,last_movement:'2026-11-05'}),row('a',{name:'Zeta',inactivity_days:90}),row('c',{name:'Beta',created_date:null,inactivity_days:null})]
 assert.deepEqual(filter(rows,{search:' ALVARO '}).map(r=>r.id),['b'])
 assert.deepEqual(filter(rows,{order:'name_asc'}).map(r=>r.id),['b','c','a'])
 assert.deepEqual(filter(rows,{order:'name_desc'}).map(r=>r.id),['a','c','b'])
 assert.deepEqual(filter(rows,{order:'inactive_asc'}).map(r=>r.id),['b','a','c'])
 assert.deepEqual(filter(rows,{kind:'with_movement'}).map(r=>r.id),['b'])
 assert.deepEqual(filter(rows,{inactivity:'unknown'}).map(r=>r.id),['c'])
 for(const [range,days]of [['recent',29],['month',30],['two_months',60],['quarter',90],['half_year',180],['year',365]])assert.equal(filter([row('edge',{inactivity_days:days})],{inactivity:range}).length,1)
})

test('carga completa paginada conserva cartera autorizada y rechaza errores, cambios y resultados parciales',async()=>{
 const rows=Array.from({length:205},(_,i)=>row(String(i)))
 const offsets=[]
 const data=await lib.loadClientActivity(async(offset,limit)=>{offsets.push(offset);assert.equal(limit,100);return {data:{rows:rows.slice(offset,offset+limit),total:rows.length,thresholds:[30,60,90]},error:null}})
 assert.equal(data.rows.length,205);assert.deepEqual(offsets,[0,100,200])
 await assert.rejects(lib.loadClientActivity(async()=>({data:null,error:{message:'denied'}})),/completa/)
 await assert.rejects(lib.loadClientActivity(async()=>({data:{rows:[],total:1,thresholds:[30]},error:null})),/incompleta/)
 await assert.rejects(lib.loadClientActivity(async()=>({data:{rows:[row('x'),row('x')],total:2,thresholds:[30]},error:null})),/cambió/)
 await assert.rejects(lib.loadClientActivity(async offset=>({data:{rows:[row(String(offset))],total:offset?3:2,thresholds:[30]},error:null})),/cartera cambió/)
 let current=true
 await assert.rejects(lib.loadClientActivity(async()=>{current=false;return {data:{rows:[],total:0,thresholds:[]},error:null}},()=>current),/cancelada/)
})

function workspace(api){return mountPage('src/app/(protected)/clientes/activity/page.tsx',{
 '@/src/lib/supabase/client':{supabase:api},
 '@/src/components/invoicing/FinancialReportExport':{FinancialReportExport:'Export'},
 '@/src/components/invoicing/FinanceWorkspace':{FinancePageHeader:({actions})=>actions},
},{exported:'ActivityTable',expand:type=>type.name==='FinancePageHeader'})}
test('pantalla exporta todo el filtro más allá de la página visible, reinicia paginación y bloquea exportar en error',async()=>{
 let fail=false
 const rows=Array.from({length:125},(_,i)=>row(String(i),{name:`Cliente ${i}`,inactivity_days:i}))
 const app=workspace({rpc:async(name,{p_offset,p_limit})=>{assert.equal(name,'get_client_activity');return fail?{error:{message:'offline'},data:null}:{error:null,data:{rows:rows.slice(p_offset,p_offset+p_limit),total:rows.length,thresholds:[30,60,90]}}}})
 try{
  await app.ready();await app.tick();app.render()
  assert.equal(app.find(n=>n.type==='Export').props.data.rows.length,125)
  assert.equal(app.find(n=>n.type==='Pagination').props.total,125)
  app.find(n=>n.type==='Pagination').props.onPageChange(3);app.render()
  app.find(n=>n.type==='input'&&n.props.type==='search').props.onChange({target:{value:'Cliente 12'}});app.render()
  assert.equal(app.find(n=>n.type==='Pagination').props.page,1)
  assert.equal(app.find(n=>n.type==='Export').props.data.rows.length,6)
  assert.match(app.find(n=>n.type==='Export').props.data.filters.join('\n'),/Cliente 12/)
  app.find(n=>n.props?.['aria-label']==='Restablecer filtros').props.onClick();app.render();assert.equal(app.find(n=>n.type==='Export').props.data.rows.length,125)
  fail=true;app.find(n=>n.props?.['aria-label']==='Actualizar').props.onClick();app.render();assert.equal(app.find(n=>n.type==='Export'),undefined)
  await app.tick();app.render();assert.match(app.text(),/No se pudo consultar/)
  fail=false;app.button('Reintentar').props.onClick();app.render();await app.tick();app.render();assert.equal(app.find(n=>n.type==='Export').props.data.rows.length,125)
 }finally{app.cleanup()}
})

test('reporte comparte filtro y orden con la tabla y Excel conserva filtros, fechas y todas las filas',()=>{
 const rows=filter(Array.from({length:101},(_,i)=>row(String(i),{name:`CLIENTE${String(i).padStart(3,'0')}`})),{order:'name_desc'})
 const data=lib.clientActivityReport(rows,{...lib.defaultActivityFilters,order:'name_desc'},generatedAt)
 assert.equal(data.rows.length,101);assert.equal(data.rows[0].name,'CLIENTE100');assert.equal(data.rows[100].name,'CLIENTE000')
 assert.equal(data.rows[0].registered,'01/10/2026');assert.match(data.filters.join('\n'),/Z–A/)
 const {financialExcelRows}=loadTs('src/lib/financial-export.ts'),{createStyledXlsx}=loadTs('src/lib/xlsx.ts')
 const xml=new TextDecoder().decode(createStyledXlsx(financialExcelRows(data,{}),data.title))
 assert.match(xml,/CLIENTE100/);assert.match(xml,/CLIENTE000/);assert.doesNotMatch(xml,/Antigüedad/);assert.equal(data.columns.length,6);assert.equal(data.rows[0].age,undefined)
})

test('PDF real pagina y contiene la última fila del resultado completo',async()=>{
 const rows=filter(Array.from({length:101},(_,i)=>row(String(i),{name:`ACTIVITY${String(i).padStart(3,'0')}`})),{order:'name_asc'})
 const data=lib.clientActivityReport(rows,{...lib.defaultActivityFilters,order:'name_asc'},generatedAt)
 const {ReportPdf}=loadTs('src/components/pdf/report-pdf.tsx',{'@react-pdf/renderer':renderer})
 const buffer=await renderer.renderToBuffer(React.createElement(ReportPdf,{data,company:{legal_name:'Empresa de prueba',trade_name:'Empresa de prueba'}}))
 assert.equal(buffer.subarray(0,4).toString(),'%PDF');assert.ok((buffer.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>1)
 const streams=[...buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(([,stream])=>{try{return inflateSync(Buffer.from(stream,'latin1')).toString('latin1')}catch{return ''}}).join('\n')
 const text=[...streams.matchAll(/<([a-f0-9]+)>/gi)].map(([,hex])=>Buffer.from(hex,'hex').toString('latin1')).join('')
 assert.match(text,/ACTIVITY100/);assert.match(text,/A.Z/)
})
