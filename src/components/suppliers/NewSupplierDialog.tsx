'use client'
import { useRef, useState, type RefObject } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog'
import { SupplierForm } from './SupplierForm'
import { requestFormNavigation } from '@/src/components/ui/UnsavedChangesGuard'

export function NewSupplierDialog({open,onOpenChange,onCreated,returnFocusRef}:{open:boolean;onOpenChange:(open:boolean)=>void;onCreated:(id:string)=>void;returnFocusRef?:RefObject<HTMLElement|null>}) {
  const busy=useRef(false),returnFocus=useRef<HTMLElement|null>(null)
  const [saving,setSaving]=useState(false)
  function close(){if(!busy.current)requestFormNavigation(()=>onOpenChange(false))}
  return <Dialog open={open} onOpenChange={next=>{if(!next)close()}}>
    <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto bg-white p-5 dark:bg-slate-950 sm:max-w-3xl sm:p-6"
      onOpenAutoFocus={()=>{returnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null}}
      onCloseAutoFocus={event=>{event.preventDefault();const target=returnFocusRef?.current||returnFocus.current;window.setTimeout(()=>{if(target?.isConnected)target.focus()},0)}}
      onEscapeKeyDown={event=>{event.preventDefault();close()}}
      onPointerDownOutside={event=>{event.preventDefault();close()}}>
      <DialogHeader className="mb-5 pr-10"><DialogTitle className="text-xl font-bold">Nuevo proveedor</DialogTitle>
        <DialogDescription>Completa su información, contacto y condiciones de pago.</DialogDescription></DialogHeader>
      <button type="button" aria-label="Cerrar nuevo proveedor" disabled={saving} onClick={close} className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"><X size={18}/></button>
      {open&&<SupplierForm onCancel={close} onSavingChange={next=>{busy.current=next;setSaving(next)}} onCreated={id=>{onOpenChange(false);onCreated(id)}}/>}
    </DialogContent>
  </Dialog>
}
