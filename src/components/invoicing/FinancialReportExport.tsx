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
export function FinancialReportExport({data,filename,disabled=false,company}:{data:ReportPdfData;filename:string;disabled?:boolean;company?:CompanyBranding}) {
  const lock=useRef(false),[busy,setBusy]=useState(false)
  const {user,profile}=useUser(),context=`${user?.id}:${profile?.tenant_id}`,owner=useRef(context)
  useEffect(()=>{owner.current=context;return()=>{owner.current=''}},[context])
  async function run(format:'pdf'|'xlsx'|'csv') {
    if(lock.current || disabled)return
    lock.current=true;setBusy(true)
    try { await downloadFinancialReport(data,filename,format,{company,isCurrent:()=>owner.current===context}) }
    catch(error) { toast.error(error instanceof Error?error.message:'No se pudo exportar.') }
    finally { lock.current=false;setBusy(false) }
  }
  return <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('pdf')}>PDF</button><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('xlsx')}>Excel</button><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('csv')}>CSV</button></div>
}
