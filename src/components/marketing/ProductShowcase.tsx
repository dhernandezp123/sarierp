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
      <Tabs value={activeId} onValueChange={setActiveId} className="gap-0">
        <div className="grid overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_30px_80px_-45px_rgba(15,41,94,0.45)] lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="min-w-0 bg-[#09172B] p-4 text-white sm:p-6 lg:p-7">
            <div className="px-1">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#FFB44B]">Product tour</p>
              <p className="mt-3 text-lg font-semibold tracking-tight">Explora cada punto de control.</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">Selecciona una vista para seguir el trabajo de tu equipo.</p>
            </div>
            <div className="mt-5 overflow-x-auto pb-1 lg:overflow-visible">
              <TabsList aria-label="Vistas del producto" className="flex h-auto w-max flex-row gap-2 border-0 bg-transparent p-0 lg:w-full lg:flex-col">
                {productViews.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <TabsTrigger key={item.id} value={item.id} className="group h-auto min-w-44 justify-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-left text-slate-300 hover:bg-white/[0.08] data-[state=active]:border-white data-[state=active]:bg-white data-[state=active]:text-[#07111F] focus-visible:ring-2 focus-visible:ring-[#FFB44B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09172B] lg:w-full">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#FFB44B] group-data-[state=active]:bg-blue-50 group-data-[state=active]:text-[#0038BD]">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500 group-data-[state=active]:text-[#0038BD]">Vista {String(index + 1).padStart(2, '0')}</span>
                        <span className="mt-0.5 block truncate text-xs font-bold">{item.label}</span>
                      </span>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </div>
            <a href="#demo" className="mt-6 hidden min-h-11 items-center gap-2 border-t border-white/10 px-1 pt-5 text-xs font-bold text-[#FFB44B] underline-offset-4 hover:underline lg:flex">
              Ver este flujo con mi equipo <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>

          <div className="min-w-0 bg-white">
            {productViews.map((item, index) => (
              <TabsContent key={item.id} value={item.id} className="m-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0038BD]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#16A36A]" />Captura real · Datos de demostración</span>
                  <DialogTrigger asChild><button type="button" onClick={(event) => { triggerRef.current = event.currentTarget }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#0038BD] hover:bg-blue-50"><ZoomIn size={15} aria-hidden="true" />Ampliar captura</button></DialogTrigger>
                </div>
                <DialogTrigger asChild>
                  <button type="button" onClick={(event) => { triggerRef.current = event.currentTarget }} aria-label={`Ampliar: ${item.title}`} className="block w-full cursor-zoom-in bg-[#F5F8FC] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0038BD]">
                    <Image src={item.image} alt={item.alt} width={1920} height={1080} sizes="(max-width: 1024px) 100vw, 900px" className="aspect-video h-auto w-full object-contain" />
                  </button>
                </DialogTrigger>
                <div className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-[0.8fr_1.2fr] sm:items-start sm:p-7 lg:p-8">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#0038BD]">{String(index + 1).padStart(2, '0')} · {item.stage}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#07111F]">{item.title}</h3>
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{item.description}</p>
                </div>
              </TabsContent>
            ))}
          </div>
        </div>
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
