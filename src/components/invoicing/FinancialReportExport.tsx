'use client'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ReportPdf, type ReportPdfData } from '@/src/components/pdf/report-pdf'
import { supabase } from '@/src/lib/supabase/client'
import { loadCurrentCompanySettings } from '@/src/lib/company-settings'
import { createXlsx } from '@/src/lib/xlsx'
import { secondaryButtonClass } from '@/src/lib/ui-classes'

export async function downloadFinancialReport(data: ReportPdfData, filename: string, format: 'pdf'|'xlsx') {
  let blob: Blob
  if (format==='pdf') {
    const { data: company,error } = await loadCurrentCompanySettings(supabase)
    if (error) throw new Error('No se pudo cargar el encabezado de la empresa.')
    const { pdf }=await import('@react-pdf/renderer')
    blob=await pdf(<ReportPdf data={data} company={company || undefined}/>).toBlob()
  } else {
    const bytes=createXlsx([[data.title],[data.subtitle],[data.dateRange || ''],...data.filters.map(f=>[f]),
      ...data.metrics.map(m=>[m.label,m.value]),data.columns.map(c=>c.label),...data.rows.map(row=>data.columns.map(c=>row[c.key] ?? ''))],data.title)
    blob=new Blob([bytes.buffer as ArrayBuffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  }
  const url=URL.createObjectURL(blob), link=document.createElement('a')
  link.href=url; link.download=`${filename}.${format}`; document.body.appendChild(link); link.click(); link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),60000)
}
export function FinancialReportExport({data,filename,disabled=false}:{data:ReportPdfData;filename:string;disabled?:boolean}) {
  const lock=useRef(false),[busy,setBusy]=useState(false)
  async function run(format:'pdf'|'xlsx') {
    if(lock.current || disabled)return
    lock.current=true;setBusy(true)
    try { await downloadFinancialReport(data,filename,format) }
    catch(error) { toast.error(error instanceof Error?error.message:'No se pudo exportar.') }
    finally { lock.current=false;setBusy(false) }
  }
  return <div className="flex gap-2"><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('pdf')}>PDF</button><button type="button" className={secondaryButtonClass} disabled={disabled||busy} onClick={()=>void run('xlsx')}>Excel</button></div>
}
