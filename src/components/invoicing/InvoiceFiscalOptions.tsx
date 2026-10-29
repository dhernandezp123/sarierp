'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { fieldClass, fieldLabelClass } from '@/src/lib/ui-classes'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { referenceCurrencies, type FiscalMode } from '@/src/lib/invoice-fiscal'

export type InvoiceFiscalOptionsValue = {
  mode: FiscalMode
  referenceEnabled: boolean; referenceCurrency: string; referenceRate: string; referenceOperation: 'multiply' | 'divide'
  conversionEnabled: boolean; conversionRate: string; conversionOperation: 'multiply' | 'divide'
  order: string; registry: string; sag: string
  documents: { name: string; path: string }[]
}
export const blankFiscalOptions = (): InvoiceFiscalOptionsValue => ({ mode: 'Mixta', referenceEnabled: false, referenceCurrency: 'USD',
  referenceRate: '', referenceOperation: 'divide', conversionEnabled: false, conversionRate: '', conversionOperation: 'multiply',
  order: '', registry: '', sag: '', documents: [] })

export function fiscalOptionsPayload(value: InvoiceFiscalOptionsValue, sourceCurrency?: string) {
  return { fiscal_mode: value.mode, es_exonerado: value.mode === 'Exonerada', orden_compra_exenta: value.order || null,
    no_constancia_exonerado: value.registry || null, no_registro_sag: value.sag || null, exoneration_documents: value.documents,
    reference_equivalence: value.referenceEnabled ? { currency: value.referenceCurrency, rate: Number(value.referenceRate), operation: value.referenceOperation } : null,
    conversion: value.conversionEnabled ? { source_currency: sourceCurrency, rate: Number(value.conversionRate), operation: value.conversionOperation } : null,
  }
}

export function InvoiceFiscalOptions({ value, onChange, currency, sourceCurrency, disabled = false }: {
  value: InvoiceFiscalOptionsValue; onChange: (value: InvoiceFiscalOptionsValue) => void; currency: string; sourceCurrency?: string; disabled?: boolean
}) {
  const { profile } = useUser()
  const id = useId()
  const [uploading, setUploading] = useState(false)
  const latest = useRef(value)
  const tenant = useRef(profile?.tenant_id)
  useEffect(() => { latest.current = value }, [value])
  useEffect(() => { tenant.current = profile?.tenant_id; return () => { tenant.current = undefined } }, [profile?.tenant_id])
  const set = <K extends keyof InvoiceFiscalOptionsValue>(key: K, field: InvoiceFiscalOptionsValue[K]) => onChange({ ...value, [key]: field })
  async function upload(file: File | undefined) {
    const owner = profile?.tenant_id
    if (!file || !owner || uploading || disabled) return
    if (!['application/pdf','image/jpeg','image/png'].includes(file.type) || file.size>10*1024*1024 || value.documents.length>=10) {
      toast.error('Adjunta hasta 10 archivos PDF/JPG/PNG de máximo 10 MB.'); return
    }
    setUploading(true)
    try {
      const path=`${owner}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
      const { error } = await supabase.storage.from('fiscal-support').upload(path,file,{ contentType:file.type, upsert:false })
      if (error) throw error
      if (tenant.current===owner) onChange({ ...latest.current, documents:[...latest.current.documents,{ name:file.name,path }] })
    } catch { toast.error('No se pudo adjuntar el respaldo. Reintenta la carga.') }
    finally { setUploading(false) }
  }
  return <fieldset disabled={disabled} className="w-full max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/30">
    <legend className="font-semibold">Tratamiento fiscal y monedas</legend>
    <label htmlFor={`${id}-mode`} className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Tipo fiscal</span><CompactSelect id={`${id}-mode`} aria-label="Tipo fiscal" disabled={disabled} value={value.mode} onValueChange={next=>set('mode',next as FiscalMode)}
      options={['Mixta','Gravada','Exenta','Exonerada'].map(mode=>({value:mode,label:mode==='Mixta'?'Según las líneas / Mixta':mode}))}/></label>
    <details open={value.mode==='Exonerada' || !!value.order}><summary className="cursor-pointer text-sm font-medium">Respaldo de exoneración</summary>
      <p className="my-2 text-xs text-slate-500">En proforma puedes preparar estos datos. Para emitir con exoneración adjunta la OCE y el registro aplicable.</p>
      <div className="grid gap-3 md:grid-cols-3">{([['order','N.º Orden de Compra Exenta'],['registry','N.º Constancia de registro de exonerados'],['sag','N.º Registro SAG']] as const).map(([key,label])=><label key={key} className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>{label}</span><input className={fieldClass} maxLength={120} value={value[key]} onChange={e=>set(key,e.target.value)} /></label>)}</div>
      <label className="flex min-w-0 flex-col gap-1.5 mt-3 text-sm"><span className={fieldLabelClass}>Adjuntar respaldo PDF/JPG/PNG</span><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={uploading || disabled} onChange={e=>{void upload(e.target.files?.[0]);e.target.value=''}} className="block w-full" /></label>
      {uploading && <p role="status">Subiendo respaldo…</p>}
      {value.documents.map(doc=><div key={doc.path} className="flex items-center gap-2 text-sm"><span>{doc.name}</span><button type="button" disabled={uploading} className="text-red-600" onClick={()=>set('documents',value.documents.filter(d=>d.path!==doc.path))}>Quitar del documento</button></div>)}
    </details>
    {sourceCurrency && sourceCurrency!==currency && <div className="space-y-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-950">
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={value.conversionEnabled} onChange={e=>set('conversionEnabled',e.target.checked)} />Convertir precios de {sourceCurrency} a {currency} al emitir; conservar cotización original</label>
      {value.conversionEnabled && <div className="grid gap-2 sm:grid-cols-2"><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Tasa</span><input aria-label="Tasa de conversión" type="number" min="0.000001" step="0.000001" className={fieldClass} value={value.conversionRate} onChange={e=>set('conversionRate',e.target.value)} /></label><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Operación</span><CompactSelect aria-label="Operación de conversión" disabled={disabled} value={value.conversionOperation} onValueChange={next=>set('conversionOperation',next as 'multiply'|'divide')} options={[{value:'multiply',label:'Multiplicar'},{value:'divide',label:'Dividir'}]}/></label></div>}
    </div>}
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={value.referenceEnabled} onChange={e=>onChange({ ...value, referenceEnabled:e.target.checked, referenceCurrency:value.referenceCurrency===currency ? (currency==='USD' ? 'HNL' : 'USD') : value.referenceCurrency })} />Mostrar equivalencia informativa en el PDF</label>
    {value.referenceEnabled && <div className="grid gap-3 sm:grid-cols-3"><label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Moneda de referencia</span><CompactSelect aria-label="Moneda de referencia" disabled={disabled} value={value.referenceCurrency} onValueChange={next=>set('referenceCurrency',next)} options={referenceCurrencies.filter(c=>c!==currency).map(c=>({value:c,label:c}))}/></label>
      <label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Tasa</span><input aria-label="Tasa de equivalencia" type="number" min="0.000001" step="0.000001" className={fieldClass} value={value.referenceRate} onChange={e=>set('referenceRate',e.target.value)} /></label>
      <label className="flex min-w-0 flex-col gap-1.5"><span className={fieldLabelClass}>Operación</span><CompactSelect aria-label="Operación de equivalencia" disabled={disabled} value={value.referenceOperation} onValueChange={next=>set('referenceOperation',next as 'multiply'|'divide')} options={[{value:'multiply',label:'Multiplicar'},{value:'divide',label:'Dividir'}]}/></label>
    </div>}
  </fieldset>
}
