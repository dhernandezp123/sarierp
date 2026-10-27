'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog'
import { InvoiceFiscalOptions, blankFiscalOptions, fiscalOptionsPayload, type InvoiceFiscalOptionsValue } from './InvoiceFiscalOptions'
import { primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

export function ConvertProforma({ id, currency, convertedInvoiceId, initialOptions }: { id: string; currency: string; convertedInvoiceId?: string | null; initialOptions?: Partial<InvoiceFiscalOptionsValue> }) {
  const router = useRouter()
  const [open,setOpen] = useState(false)
  const [options,setOptions] = useState(() => ({ ...blankFiscalOptions(), ...initialOptions }))
  const [saving,setSaving] = useState(false)
  const busy=useRef(false)
  async function convert() {
    if(busy.current)return
    busy.current=true;setSaving(true)
    try {
      const {data,error}=await supabase.rpc('convert_proforma_to_invoice',{p_proforma_id:id,p_invoice:fiscalOptionsPayload(options)})
      if(error || !data){toast.error(error?.message || 'No se pudo convertir la proforma');return}
      toast.success('Factura creada y vinculada a la proforma');router.push(`/invoicing/${data}`)
    }catch{toast.error('No se pudo confirmar la conversión. Reintenta; no se duplicará la factura.')}
    finally{busy.current=false;setSaving(false)}
  }
  if(convertedInvoiceId)return <a className={secondaryButtonClass} href={`/invoicing/${convertedInvoiceId}`}>Ver factura final</a>
  return <><button type="button" className={secondaryButtonClass} onClick={()=>setOpen(true)}>Convertir a factura final</button>
    <Dialog open={open} onOpenChange={next=>{if(!saving)setOpen(next)}}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Factura final desde proforma</DialogTitle><DialogDescription>Se conservará la proforma y se utilizará el CAI vigente de la oficina asignada al cliente. Los anticipos se trasladan una sola vez.</DialogDescription></DialogHeader>
      <InvoiceFiscalOptions value={options} onChange={setOptions} currency={currency} disabled={saving}/>
      <div className="flex gap-2"><button type="button" disabled={saving} className={secondaryButtonClass} onClick={()=>setOpen(false)}>Cancelar</button><button type="button" disabled={saving} className={primaryButtonClass} onClick={()=>void convert()}>{saving?'Creando factura…':'Confirmar factura final'}</button></div>
    </DialogContent></Dialog></>
}
