'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'
import { SupplierPayableDetail } from './SupplierPayableDetail'

type Props = { id: string; onClose: () => void }
export function SupplierPayableDialog({ id, onClose }: Props) {
 const [busy, setBusy] = useState(false)
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
  <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl" showCloseButton={!busy}
   onCloseAutoFocus={event => { const trigger=Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-payable-id]')).find(button=>button.dataset.payableId===id); if(trigger){event.preventDefault();setTimeout(()=>{if(trigger.isConnected)trigger.focus()},0)} }}
   onEscapeKeyDown={event => { if (busy) event.preventDefault() }}
   onInteractOutside={event => { if (busy) event.preventDefault() }}>
   <DialogHeader className="pr-8"><DialogTitle>Saldo y pagos</DialogTitle>
    <DialogDescription>Consulta el saldo, los pagos y las notas de esta compra.</DialogDescription></DialogHeader>
   <SupplierPayableDetail id={id} embedded onBusyChange={setBusy}/>
  </DialogContent>
 </Dialog>
}
