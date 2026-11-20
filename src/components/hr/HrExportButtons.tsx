'use client'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { createXlsx } from '@/src/lib/xlsx'
import { hrCsv } from '@/src/lib/hr-report'
import { secondaryButtonClass } from '@/src/lib/ui-classes'

export function HrExportButtons({ rows, filename, disabled }: { rows: () => (string | number)[][]; filename: string; disabled: boolean }) {
  function download(excel: boolean) {
    try {
      const data = rows()
      const blob = excel ? new Blob([new Uint8Array(createXlsx(data, 'Recursos Humanos'))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        : new Blob([hrCsv(data)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `${filename}.${excel ? 'xlsx' : 'csv'}`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { toast.error('No se pudo exportar el reporte completo. Reintenta la carga.') }
  }
  return <div className="flex flex-wrap gap-2">
    <button type="button" className={`${secondaryButtonClass} inline-flex items-center gap-2`} disabled={disabled} onClick={() => download(true)}><Download size={16} aria-hidden="true" />Excel</button>
    <button type="button" className={secondaryButtonClass} disabled={disabled} onClick={() => download(false)}>CSV</button>
  </div>
}
