'use client'
import { useEffect, useRef, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import type { CompanyBranding } from '@/src/lib/company-branding'
import { toast } from 'sonner'
import { ReportPdf, type ReportPdfData } from '@/src/components/pdf/report-pdf'
import { supabase } from '@/src/lib/supabase/client'
import { loadCurrentCompanySettings } from '@/src/lib/company-settings'
import { createStyledXlsx } from '@/src/lib/xlsx'
import { financialCsv, financialExcelRows } from '@/src/lib/financial-export'
import { secondaryButtonClass } from '@/src/lib/ui-classes'
import {FileText,FileSpreadsheet,Table2,Printer,LoaderCircle} from 'lucide-react'

export async function downloadFinancialReport(data: ReportPdfData, filename: string, format: 'pdf'|'xlsx'|'csv', options:{company?:CompanyBranding;isCurrent?:()=>boolean}={}) {
  let blob: Blob
  if (format==='pdf') {
    const { data: company,error } = options.company?{data:options.company,error:null}:await loadCurrentCompanySettings(supabase)
    if (error) throw new Error('No se pudo cargar el encabezado de la empresa.')
    const { pdf }=await import('@react-pdf/renderer')
    blob=await pdf(<ReportPdf data={{...data,complete:true}} company={company || undefined}/>).toBlob()
  } else if(format==='csv') {
    blob=new Blob([financialCsv(data)],{type:'text/csv;charset=utf-8;'})
  } else {
    const { data:company,error }=options.company?{data:options.company,error:null}:await loadCurrentCompanySettings(supabase)
    if(error)throw new Error('No se pudo cargar el encabezado de la empresa.')
    const color=/sari/i.test(company?.legal_name||company?.trade_name||'')?'#B3282D':company?.primary_color||'#B3282D'
    const bytes=createStyledXlsx(financialExcelRows(data,company||{}),data.title,color,data.columns.flatMap((c,i)=>c.format==='integer'?[i]:[]))
    blob=new Blob([bytes.buffer as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  }
  if(options.isCurrent&&!options.isCurrent())return
  const url=URL.createObjectURL(blob), link=document.createElement('a')
  link.href=url; link.download=`${filename}.${format}`; document.body.appendChild(link); link.click(); link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export function FinancialReportExport({data,filename,disabled=false,company,compact=false}:{data:ReportPdfData;filename:string;disabled?:boolean;company?:CompanyBranding;compact?:boolean}) {
  const lock=useRef(false),[busy,setBusy]=useState(false)
  const menu=useRef<HTMLDetailsElement>(null)
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`,owner=useRef(context)
  useEffect(()=>{owner.current=context;return()=>{owner.current=''}},[context])
  useEffect(()=>{
    if(!compact)return
    function outside(event:PointerEvent){if(event.target instanceof Node&&!menu.current?.contains(event.target)&&menu.current)menu.current.open=false}
    function escape(event:KeyboardEvent){if(event.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[compact])
  async function run(format:'pdf'|'xlsx'|'csv') {
    if(lock.current || disabled)return
    if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}
    lock.current=true;setBusy(true)
    try { await downloadFinancialReport(data,filename,format,{company,isCurrent:()=>owner.current===context}) }
    catch(error) { toast.error(error instanceof Error?error.message:'No se pudo exportar.') }
    finally { lock.current=false;setBusy(false) }
  }
  if(compact)return <details ref={menu} className="relative">
    <summary aria-label="Exportar reporte" title="Exportar reporte" aria-disabled={disabled||busy} onClick={event=>{if(disabled||busy)event.preventDefault()}} className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 [&::-webkit-details-marker]:hidden">{busy?<LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin"/>:<Printer aria-hidden="true" className="h-4 w-4"/>}</summary>
    <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900" aria-label="Formatos de exportación">
      <p className="px-2.5 py-2 text-[11px] font-semibold text-slate-500">Exportar reporte</p>
      {([{format:'pdf',label:'Documento PDF',Icon:FileText},{format:'xlsx',label:'Hoja Excel',Icon:FileSpreadsheet},{format:'csv',label:'Archivo CSV',Icon:Table2}] as const).map(({format,label,Icon})=><button key={format} type="button" disabled={disabled||busy} onClick={()=>void run(format)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"><Icon aria-hidden="true" className="h-4 w-4"/>{label}</button>)}
    </div>
  </details>
  return <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('pdf')}>PDF</button><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('xlsx')}>Excel</button><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('csv')}>CSV</button></div>
}
