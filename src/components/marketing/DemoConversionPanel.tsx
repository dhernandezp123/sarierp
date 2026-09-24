import { Mail } from 'lucide-react'
import { PLATFORM_CONTACT_EMAIL } from '@/src/lib/platform-branding'
import { LandingContact } from './LandingContact'

const demoSteps = [
  { number: '01', title: 'Entendemos tu operación', detail: 'Modalidades, equipos y puntos de control que hoy necesitas coordinar.' },
  { number: '02', title: 'Recorremos el flujo relevante', detail: 'Producto real aplicado a cotización, ejecución y cierre financiero.' },
  { number: '03', title: 'Aclaramos el alcance', detail: 'Datos iniciales, configuración y condiciones que tu empresa debe evaluar.' },
]

export function DemoConversionPanel() {
  return (
    <section id="demo" className="px-5 py-16 sm:px-8 lg:py-20">
      <div className="relative mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-3xl bg-[#09172B] p-6 sm:p-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-40 h-96 w-96 rounded-full bg-[#0038BD]/25 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">Una demo con contexto</p>
          <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-4xl">
            Ve Forwarders.app con tu operación, no con un discurso genérico.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">Cuéntanos quién eres. Revisemos cómo cotizas, coordinas tus embarques y controlas tus costos.</p>
          <ol className="mt-8 space-y-5">
            {demoSteps.map((step) => (
              <li key={step.number} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] font-mono text-[10px] font-bold text-[#FFB44B]">{step.number}</span>
                <span>
                  <span className="block text-sm font-semibold text-white">{step.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-400">{step.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-8 border-t border-white/15 pt-6">
            <p className="text-sm text-slate-300">¿Prefieres escribirnos?</p>
            <a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#FFB44B] hover:underline">
              <Mail size={16} aria-hidden="true" />{PLATFORM_CONTACT_EMAIL}
            </a>
          </div>
        </div>
        <div className="relative min-w-0"><LandingContact /></div>
      </div>
    </section>
  )
}
