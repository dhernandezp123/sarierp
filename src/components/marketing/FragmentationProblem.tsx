import { ArrowRight, FileSpreadsheet, FolderOpen, Mail, MessageCircle, Workflow } from 'lucide-react'
import styles from './landing.module.css'

const fragmentedTools = [
  { name: 'Excel', detail: 'Tarifas y costos', icon: FileSpreadsheet },
  { name: 'Correo', detail: 'Bookings y documentos', icon: Mail },
  { name: 'WhatsApp', detail: 'Aprobaciones y seguimiento', icon: MessageCircle },
  { name: 'Carpetas', detail: 'Versiones separadas', icon: FolderOpen },
]

export function FragmentationProblem() {
  return (
    <section className="relative overflow-hidden bg-[#07111F] px-5 py-16 text-white sm:px-8 lg:py-24">
      <div aria-hidden="true" className={styles.problemGlow} />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">El problema no es mover la carga</p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl">
            Tu embarque es un solo proceso. Tus herramientas no deberían dividirlo.
          </h2>
          <p className="mt-5 text-base leading-8 text-slate-300">
            Una tarifa vive en Excel. La aprobación llega por WhatsApp. El booking queda en el correo. Los documentos terminan en otra carpeta y el margen real aparece cuando ya es tarde.
          </p>
          <a href="#workflow" className="mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#FFB44B] underline-offset-4 hover:underline">
            Ver cómo se conecta la operación <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="grid gap-3 sm:grid-cols-2">
            {fragmentedTools.map(({ name, detail, icon: Icon }) => (
              <div key={name} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-white"><Icon size={16} className="text-[#FFB44B]" aria-hidden="true" />{name}</div>
                <p className="mt-3 text-xs leading-5 text-slate-400">{detail}</p>
              </div>
            ))}
          </div>

          <div aria-hidden="true" className="flex justify-center text-[#FFB44B] sm:px-1">
            <ArrowRight className="rotate-90 sm:rotate-0" size={24} />
          </div>

          <div className="relative overflow-hidden rounded-[1.5rem] border border-blue-400/30 bg-[#0D2D68] p-6 shadow-2xl shadow-black/25">
            <div aria-hidden="true" className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#155EEF]/50 blur-3xl" />
            <div className="relative">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[#FFB44B]"><Workflow size={22} aria-hidden="true" /></span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-blue-200">Con Forwarders.app</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">Una operación conectada</h3>
              <ul className="mt-5 space-y-3 text-sm text-slate-200">
                <li className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span>Datos comerciales</span><span className="font-mono text-xs text-blue-200">01</span></li>
                <li className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span>Expediente operativo</span><span className="font-mono text-xs text-blue-200">02</span></li>
                <li className="flex items-center justify-between gap-4"><span>Resultado financiero</span><span className="font-mono text-xs text-blue-200">03</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
