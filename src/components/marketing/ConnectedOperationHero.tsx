import Image from 'next/image'
import {
  ArrowDown,
  ArrowRight,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Route,
} from 'lucide-react'
import { connectedOperationStages } from './landing-content'
import styles from './landing.module.css'

const stageIcons = [FileText, CircleDollarSign, Route, FileCheck2]

export function ConnectedOperationHero() {
  return (
    <section id="contenido" tabIndex={-1} className={`${styles.hero} relative overflow-hidden border-b border-slate-200`}>
      <div aria-hidden="true" className={styles.heroGrid} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[0.78fr_1.22fr] lg:gap-8 lg:py-24 xl:grid-cols-[0.88fr_1.12fr] xl:gap-14">
        <div className="relative z-10">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">
            <span className="h-1.5 w-6 rounded-full bg-[#EF8E01]" aria-hidden="true" />
            Plataforma operativa para freight forwarders
          </p>
          <h1 className="mt-5 max-w-2xl font-display text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.045em] text-[#07111F] sm:text-[3.6rem] lg:text-[3rem] xl:text-[4rem]">
            De la cotización a la rentabilidad.
            <span className="mt-2 block text-[#0038BD]">Una sola operación conectada.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            Forwarders.app conecta ventas, pricing, operaciones, documentos y finanzas en una plataforma creada para freight forwarders y NVOCCs.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <a href="#demo" className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[#0038BD] px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-[#002a90] sm:w-auto">
              Ver una demo con mi flujo <ArrowRight size={17} aria-hidden="true" />
            </a>
            <a href="#producto" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white/90 px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#0038BD] hover:text-[#0038BD] sm:w-auto">
              Explorar el producto <ArrowDown size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="mt-6 text-xs font-semibold leading-6 text-slate-600">
            FCL / LCL <span aria-hidden="true" className="mx-2 text-slate-400">·</span> Aéreo <span aria-hidden="true" className="mx-2 text-slate-400">·</span> Terrestre <span aria-hidden="true" className="mx-2 text-slate-400">·</span> Courier
          </p>
        </div>

        <div className={`${styles.heroPreview} relative min-w-0`}>
          <div aria-hidden="true" className={styles.heroGlow} />
          <div className="relative overflow-hidden rounded-[1.65rem] border border-slate-200/90 bg-white p-2 shadow-[0_30px_80px_-35px_rgba(15,41,94,0.42)] sm:p-3">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#07111F]">
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#16A36A]/30" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#16A36A]" />
                </span>
                Operación conectada
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Datos demo</span>
            </div>

            <ol aria-label="Recorrido resumido de una operación" className={`${styles.stageTrack} grid grid-cols-2 gap-2 border-y border-slate-200 bg-slate-50/90 p-3 sm:grid-cols-4 sm:gap-0 sm:px-4`}>
              {connectedOperationStages.map((stage, index) => {
                const Icon = stageIcons[index]
                return (
                  <li key={stage.id} className="relative flex min-w-0 items-center gap-2.5 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200 sm:rounded-none sm:bg-transparent sm:p-2 sm:shadow-none sm:ring-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${index === 3 ? 'bg-[#07111F] text-white' : 'bg-blue-50 text-[#0038BD]'}`}>
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-[9px] font-semibold text-slate-400">{stage.shortLabel}</span>
                      <span className="block truncate text-[11px] font-bold text-[#07111F]">{stage.label}</span>
                    </span>
                  </li>
                )
              })}
            </ol>

            <a href="#producto" aria-label="Explorar las capturas reales del producto" className="group block overflow-hidden rounded-b-[1.1rem] bg-[#F5F8FC]">
              <div className="relative overflow-hidden">
                <Image
                  src="/product/cotizacion-rentabilidad.webp"
                  alt="Cotización de demostración con costo, venta y margen visibles en Forwarders ERP"
                  width={1920}
                  height={1080}
                  sizes="(max-width: 1024px) 100vw, 690px"
                  preload
                  className="aspect-video h-auto w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.015]"
                />
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#07111F]/20 to-transparent" />
              </div>
              <span className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 sm:px-5">
                Sigue la misma operación de principio a fin
                <ArrowRight size={16} className="shrink-0 text-[#0038BD] transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </a>
          </div>

          <div className={`${styles.floatingSignal} absolute -bottom-5 left-3 hidden items-center gap-3 rounded-2xl border border-white/80 bg-[#07111F] px-4 py-3 text-white shadow-xl sm:flex lg:-left-6`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EF8E01]/15 text-[#FFB44B]"><CircleDollarSign size={18} aria-hidden="true" /></span>
            <span><span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Control comercial</span><span className="mt-0.5 block text-xs font-bold">Margen visible antes de aprobar</span></span>
          </div>
        </div>
      </div>
    </section>
  )
}
