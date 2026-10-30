'use client'

import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactElement } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { toast } from 'sonner'

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'onClick'> & { document: ReactElement<DocumentProps> }
/** Reserve a new tab during the gesture; generate only when requested. */
export function PdfPrintButton({document:pdfDocument,disabled,children,...props}:Props) {
 const [loading,setLoading]=useState(false),busy=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function open(){
  if(disabled||busy.current)return
  busy.current=true
  let tab:Window|null=null,release=()=>{}
  try{
   tab=window.open('about:blank','_blank')
   if(!tab){toast.error('El navegador bloqueó la pestaña. Permite las ventanas emergentes o usa Descargar PDF.');return}
   tab.opener=null
   setLoading(true)
   const blob=await pdf(pdfDocument).toBlob()
   if(!mounted.current||tab.closed){tab.close();return}
   const url=URL.createObjectURL(blob),preview=tab
   // Keep the URL usable if the dialog is closed while the PDF tab stays open.
   let released=false
   release=()=>{if(released)return;released=true;URL.revokeObjectURL(url);window.clearInterval(monitor);window.clearTimeout(expiry)}
   const monitor=window.setInterval(()=>{if(preview.closed)release()},1000)
   const expiry=window.setTimeout(release,30*60*1000)
   preview.addEventListener('load',()=>{if(preview.closed)return;try{preview.focus();preview.print()}catch{/* Native PDF viewer also exposes its print control. */}},{once:true})
   preview.location.replace(url)
  }catch(error){release();tab?.close();if(mounted.current)toast.error('No se pudo abrir el PDF para imprimir. Intenta nuevamente.',{description:error instanceof Error?error.message:undefined})}
  finally{busy.current=false;if(mounted.current)setLoading(false)}
 }
 return <button {...props} type="button" disabled={disabled||loading} aria-busy={loading||undefined} onClick={open}>{loading?'Preparando PDF…':children}</button>
}
