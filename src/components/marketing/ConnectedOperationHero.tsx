import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import styles from './landing.module.css'

const stages = [
  { label: 'Cotización', href: '#vista-cotizacion' },
  { label: 'Pricing', href: '#etapa-pricing' },
  { label: 'Operación', href: '#vista-booking' },
  { label: 'Rentabilidad', href: '#margen' },
]

export function ConnectedOperationHero() {
  return (
    <section id="contenido" tabIndex={-1} className={`${styles.hero} relative overflow-hidden border-b border-slate-200`}>
      <div aria-hidden="true" className={styles.heroGrid} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-4 py-6 min-[360px]:gap-8 min-[360px]:px-5 min-[360px]:py-9 sm:px-8 sm:py-14 lg:grid-cols-2 lg:gap-12 lg:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#0038BD]">ERP para agencias de carga y NVOCCs</p>
          <h1 className="mt-4 max-w-xl font-display text-[1.95rem] min-[360px]:text-[2.4rem] font-semibold leading-[1.06] tracking-tight text-[#07111F] sm:text-5xl xl:text-6xl">
            Cotiza con margen y comprueba <span className="text-[#0038BD]">cuánto dejó cada embarque.</span>
          </h1>
          <p className="mt-5 max-w-lg leading-7 text-slate-700">Reúne la tarifa del agente, el booking y los costos finales en el expediente de cada embarque.</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="#demo" className="inline-flex min-h-11 items-center rounded-full bg-[#0038BD] px-5 text-sm font-bold text-white hover:bg-[#002a90]">Solicitar demo</a>
            <a href="#producto" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0038BD] hover:underline">Explorar el producto <ArrowRight size={16} /></a>
          </div>
        </div>
        <div className="relative min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl shadow-blue-950/10 sm:p-6">
          <figure>
            <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#07111F]">
              Cotización DEMO-Q-ATLAS-003 <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Datos demo</span>
            </figcaption>
            <picture>
              <source media="(max-width: 639px)" srcSet="/product/resumen-cotizacion-movil.webp" width={440} height={200} />
              <Image src="/product/resumen-cotizacion-demo.webp" width={660} height={100} sizes="(max-width: 640px) 90vw, 560px" loading="eager" fetchPriority="high" className="h-auto w-full rounded-lg border border-slate-200" alt="Detalle de la cotización. Venta USD 4,950.00, costo USD 3,650.00 y margen USD 1,300.00." />
            </picture>
            <a href="#vista-cotizacion" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0038BD] hover:underline">Ver el expediente completo <ArrowRight size={15} /></a>
          </figure>
          <nav aria-label="Explorar el embarque por etapa" className="mt-2 flex flex-wrap gap-x-4 border-t border-slate-200 pt-2">
            {stages.map(stage => <a key={stage.href} href={stage.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-[#0038BD]">{stage.label}</a>)}
          </nav>
        </div>
      </div>
    </section>
  )
}
