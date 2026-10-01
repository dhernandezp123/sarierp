'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import { ArrowUpRight, Minus, Plus, X, ZoomIn } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/src/components/ui/dialog'
import { productViews } from './landing-content'

export function ProductShowcase() {
  const [activeId, setActiveId] = useState(productViews[0].id)
  const [zoomed, setZoomed] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const view = productViews.find((item) => item.id === activeId) ?? productViews[0]

  return (
    <Dialog onOpenChange={() => setZoomed(false)}>
      <Tabs value={activeId} onValueChange={setActiveId} className="gap-5">
        <div className="overflow-x-auto p-1">
          <TabsList aria-label="Vistas del producto" className="w-max gap-1.5 border-0 bg-transparent p-0">
            {productViews.map((item) => {
              const Icon = item.icon
              return (
                <TabsTrigger key={item.id} value={item.id} className="h-11 gap-2 rounded-full border border-slate-200 bg-white px-4 text-slate-600 hover:bg-slate-100 data-[state=active]:border-[#0038BD] data-[state=active]:bg-[#0038BD] data-[state=active]:text-white focus-visible:ring-2 focus-visible:ring-[#0038BD] focus-visible:ring-offset-2">
                  <Icon size={16} aria-hidden="true" />{item.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>
        {productViews.map((item) => (
          <TabsContent key={item.id} value={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 focus-visible:ring-2 focus-visible:ring-[#0038BD]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#0038BD]" />Captura real · Datos de demostración</span>
              <DialogTrigger asChild><button type="button" onClick={(event) => { triggerRef.current = event.currentTarget }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#0038BD] hover:bg-blue-50"><ZoomIn size={15} aria-hidden="true" />Ampliar captura</button></DialogTrigger>
            </div>
            <DialogTrigger asChild>
              <button type="button" onClick={(event) => { triggerRef.current = event.currentTarget }} aria-label={`Ampliar: ${item.title}`} className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0038BD]">
                <Image src={item.image} alt={item.alt} width={1920} height={1080} sizes="(max-width: 1280px) 100vw, 1200px" className="aspect-video h-auto w-full object-contain" />
              </button>
            </DialogTrigger>
            <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-[0.8fr_1.2fr] sm:items-center sm:p-7">
              <h3 className="text-lg font-semibold tracking-tight text-[#07111F]">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
      <DialogContent aria-modal="true" showCloseButton={false} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus() }} className="flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-6xl flex-col gap-0 overflow-hidden bg-white p-0 text-[#07111F] sm:max-w-6xl motion-reduce:animate-none motion-reduce:transition-none">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
          <div>
            <DialogTitle className="text-base font-semibold leading-6">{view.title}</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5 text-slate-600">Datos de demostración. Amplía para leer los detalles y desplázate por la captura.</DialogDescription>
          </div>
          <DialogClose asChild><button type="button" aria-label="Cerrar captura" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"><X size={20} /></button></DialogClose>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2">
          <button type="button" onClick={() => setZoomed(!zoomed)} aria-pressed={zoomed} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#0038BD] hover:bg-blue-50">{zoomed ? <Minus size={16} /> : <Plus size={16} />}{zoomed ? 'Ajustar a pantalla' : 'Ver al 100%'}</button>
          <a href={view.image} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-slate-600 underline underline-offset-4">Abrir imagen <ArrowUpRight size={14} /><span className="sr-only"> en una pestaña nueva</span></a>
        </div>
        <div tabIndex={0} role="region" aria-label="Captura ampliada; utiliza las flechas para desplazarte" className="min-h-0 overflow-auto overscroll-contain bg-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0038BD]">
          <Image src={view.image} alt={view.alt} width={1920} height={1080} unoptimized className={zoomed ? 'h-auto w-[1920px] max-w-none' : 'h-auto w-full'} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
