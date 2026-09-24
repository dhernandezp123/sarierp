import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, ClipboardCheck, Mail, Route, Smartphone, Users } from 'lucide-react'
import { PLATFORM_ATTRIBUTION, PLATFORM_CONTACT_EMAIL, PLATFORM_MARKETING_NAME, PLATFORM_ORIGIN } from '@/src/lib/platform-branding'
import { ConnectedOperationHero } from './ConnectedOperationHero'
import { ConnectedWorkflow } from './ConnectedWorkflow'
import { FragmentationProblem } from './FragmentationProblem'
import { LandingHeader } from './LandingHeader'
import { LandingContact } from './LandingContact'
import { ProductEvidence } from './ProductEvidence'
import { ProductShowcase } from './ProductShowcase'
import { landingNavigation, landingQuestions } from './landing-content'
import styles from './landing.module.css'

const teams = [
  { name: 'Ventas y Pricing', question: '¿Qué podemos ofrecer y con qué margen?', detail: 'Clientes, tarifas y alternativas comerciales conectadas.', tags: ['Comparativo de agentes', 'Cotización en PDF'], handoff: 'Entrega una opción comercial con contexto.', icon: Users },
  { name: 'Operaciones', question: '¿Qué necesita el siguiente embarque?', detail: 'Instrucciones, bookings y documentos en el expediente operativo.', tags: ['Booking y BL', 'Bodega Miami'], handoff: 'Entrega costos y documentos de la operación.', icon: Route },
  { name: 'Finanzas y Dirección', question: '¿Cuál fue el resultado disponible?', detail: 'Costos registrados, facturación y rentabilidad para tomar decisiones.', tags: ['Control de costos', 'Reportes'], handoff: 'Convierte el cierre en visibilidad de negocio.', icon: ClipboardCheck },
]

const demoSteps = [
  { number: '01', title: 'Entendemos tu operación', detail: 'Modalidades, equipos y puntos de control que hoy necesitas coordinar.' },
  { number: '02', title: 'Recorremos el flujo relevante', detail: 'Producto real aplicado a cotización, ejecución y cierre financiero.' },
  { number: '03', title: 'Aclaramos el alcance', detail: 'Datos iniciales, configuración y condiciones que tu empresa debe evaluar.' },
]

export function ForwardersLanding() {
  return (
    <div data-forwarders-landing className={`${styles.landing} min-h-screen bg-white text-[#07111F]`}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-5 focus:py-3 focus:text-[#0038BD] focus:shadow-lg">Saltar al contenido</a>
      <LandingHeader />
      <main>
        <ConnectedOperationHero />
        <ProductEvidence />
        <FragmentationProblem />
        <ConnectedWorkflow />

        <section id="producto" className="bg-[#F7F9FC] px-5 py-16 sm:px-8 lg:py-20">
          <span id="funcionalidades" className="block" aria-hidden="true" />
          <div className="mx-auto max-w-7xl">
            <div className="mb-9 grid gap-5 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-20">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">El software, sin mockups</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl lg:text-5xl">Míralo en operación.</h2></div>
              <p className="max-w-2xl text-base leading-7 text-slate-600">Recorre seis vistas reales del ambiente Demo. Cambia de punto de control, amplía cada captura y revisa cómo el producto acompaña a los equipos internos y al cliente.</p>
            </div>
            <ProductShowcase />
          </div>
        </section>

        <section id="equipos" className="px-5 py-16 sm:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Un expediente, distintas responsabilidades</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Cada equipo ve su trabajo. La operación conserva el hilo.</h2></div>
            <div className="mt-9 grid gap-5 md:grid-cols-3">
              {teams.map(({ name, question, detail, tags, handoff, icon: Icon }) => (
                <article key={name} className="group relative overflow-hidden rounded-2xl border border-slate-200 p-6 transition-colors hover:border-blue-200">
                  <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-slate-100 transition-colors group-hover:bg-[#0038BD]" />
                  <div className="flex items-center gap-3 text-sm font-semibold text-[#0038BD]"><Icon size={20} aria-hidden="true" />{name}</div>
                  <h3 className="mt-5 text-xl font-semibold leading-7 tracking-tight">{question}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
                  <ul className="mt-5 space-y-2">{tags.map((tag) => <li key={tag} className="flex items-center gap-2 text-xs font-medium text-slate-600"><Check size={14} className="text-[#0038BD]" aria-hidden="true" />{tag}</li>)}</ul>
                  <p className="mt-6 border-t border-slate-200 pt-4 text-xs font-semibold leading-5 text-[#07111F]">{handoff}</p>
                </article>
              ))}
            </div>
            <div id="portal" className="mt-5 flex flex-col justify-between gap-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-6 sm:flex-row sm:items-center sm:p-8">
              <div className="flex items-start gap-4"><Smartphone size={26} className="mt-1 shrink-0 text-[#0038BD]" aria-hidden="true" /><div><h3 className="text-lg font-semibold">Tu cliente también tiene su espacio.</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Un portal propio para consultar carga, movimientos y notificaciones, separado de las herramientas internas de tu equipo.</p></div></div>
              <Link href="/portal/login" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-blue-200 bg-white px-5 text-sm font-semibold text-[#0038BD] hover:bg-blue-50">Ingresar al portal <ArrowRight size={16} aria-hidden="true" /></Link>
            </div>
          </div>
        </section>

        <section id="preguntas" className="border-y border-slate-200 bg-[#F7F9FC] px-5 py-16 sm:px-8 lg:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.7fr_1fr] lg:gap-20">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Antes de empezar</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Resolvamos tus preguntas.</h2><p className="mt-4 text-base leading-7 text-slate-600">El siguiente paso es entender cómo encaja Forwarders.app en tu operación.</p><a href="#demo" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0038BD] underline-offset-4 hover:underline">Hablemos de tu caso <ArrowRight size={16} aria-hidden="true" /></a></div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {landingQuestions.map(({ question, answer }) => (
                <details key={question} name="landing-faq" className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-sm font-semibold leading-6 sm:text-base [&::-webkit-details-marker]:hidden">{question}<ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[#0038BD] transition-transform group-open:rotate-180" /></summary>
                  <p className="pb-6 pr-8 text-sm leading-7 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="px-5 py-16 sm:px-8 lg:py-20">
          <div className="relative mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-3xl bg-[#09172B] p-6 sm:p-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:p-14">
            <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-40 h-96 w-96 rounded-full bg-[#0038BD]/25 blur-3xl" />
            <div className="relative"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">Una demo con contexto</p><h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-4xl">Ve Forwarders.app con tu operación, no con un discurso genérico.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-300">Cuéntanos quién eres. Revisemos cómo cotizas, coordinas tus embarques y controlas tus costos.</p>
              <ol className="mt-8 space-y-5">{demoSteps.map((step) => <li key={step.number} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] font-mono text-[10px] font-bold text-[#FFB44B]">{step.number}</span><span><span className="block text-sm font-semibold text-white">{step.title}</span><span className="mt-1 block text-xs leading-5 text-slate-400">{step.detail}</span></span></li>)}</ol>
              <div className="mt-8 border-t border-white/15 pt-6"><p className="text-sm text-slate-300">¿Prefieres escribirnos?</p><a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#FFB44B] hover:underline"><Mail size={16} aria-hidden="true" />{PLATFORM_CONTACT_EMAIL}</a></div>
            </div>
            <div className="relative"><LandingContact /></div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-[#F7F9FC] px-5 py-9 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div><p className="font-bold tracking-tight">{PLATFORM_MARKETING_NAME}</p><p className="mt-1 text-xs leading-6 text-slate-600">{PLATFORM_ATTRIBUTION}</p></div>
            <nav aria-label="Enlaces del pie de página" className="flex flex-wrap gap-x-6 gap-y-3">{landingNavigation.map((link) => <a key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-[#0038BD]">{link.label}</a>)}</nav>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5 text-xs text-slate-600"><p>Creado por forwarders, para forwarders.</p><Link href={`${PLATFORM_ORIGIN}/politicas`} className="underline underline-offset-4 hover:text-[#0038BD]">Términos y privacidad</Link></div>
        </div>
      </footer>
    </div>
  )
}
