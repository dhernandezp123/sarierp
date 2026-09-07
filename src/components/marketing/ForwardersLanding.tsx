import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowRight, Check, ChevronDown, ClipboardCheck, FileText, Globe2, Mail, Route, ShieldCheck, Smartphone, Users } from 'lucide-react'
import { PLATFORM_ATTRIBUTION, PLATFORM_CONTACT_EMAIL, PLATFORM_NAME } from '@/src/lib/platform-branding'
import { LandingHeader } from './LandingHeader'
import { LandingContact } from './LandingContact'
import { ProductShowcase } from './ProductShowcase'
import { landingNavigation } from './landing-content'
import styles from './landing.module.css'

const workflow = [
  { number: '01', title: 'Cotiza con contexto', detail: 'Cliente, ruta, carga y condiciones comerciales en una misma cotización.', icon: FileText },
  { number: '02', title: 'Decide con margen', detail: 'Compara agentes, revisa costo y venta, y presenta las opciones al cliente.', icon: ShieldCheck },
  { number: '03', title: 'Coordina el embarque', detail: 'Conecta la instrucción de embarque con bookings, documentos y seguimiento.', icon: Route },
  { number: '04', title: 'Cierra con visibilidad', detail: 'Valida costos, factura y consulta el resultado financiero de la operación.', icon: ClipboardCheck },
]

const teams = [
  { name: 'Ventas y Pricing', question: '¿Qué podemos ofrecer y con qué margen?', detail: 'Clientes, tarifas y alternativas comerciales conectadas.', tags: ['Comparativo de agentes', 'Cotización en PDF'], icon: Users },
  { name: 'Operaciones', question: '¿Qué necesita el siguiente embarque?', detail: 'Instrucciones, bookings y documentos en el expediente operativo.', tags: ['Booking y BL', 'Bodega Miami'], icon: Route },
  { name: 'Finanzas y Dirección', question: '¿Cuál fue el resultado real?', detail: 'Costos validados, facturación y rentabilidad para tomar decisiones.', tags: ['Control de costos', 'Reportes'], icon: ClipboardCheck },
]

const questions = [
  { question: '¿Para qué tipo de operación está pensado?', answer: 'Para freight forwarders y empresas de carga que coordinan servicios marítimos FCL/LCL, aéreos, terrestres o courier. Incluye flujos de cotización y pricing, operaciones, bodega Miami y control financiero.' },
  { question: '¿Cómo puedo evaluar la implementación?', answer: 'Solicita una demo para revisar los servicios que manejas, los equipos que participan y el recorrido de una operación. La configuración, los datos iniciales y el alcance de la puesta en marcha deben definirse con tu empresa.' },
  { question: '¿Qué pasa con mis datos de Excel?', answer: 'Antes de definir una migración, hay que revisar el formato y la calidad de tus catálogos, tarifas y datos históricos. Cuéntanos qué información necesitas trasladar al solicitar la demo para evaluar su alcance.' },
  { question: '¿Mis clientes pueden consultar su carga?', answer: 'Sí. El portal del cliente permite consultar el estado de su carga, movimientos y notificaciones con un acceso separado del ERP interno. La información disponible corresponde a los registros y actualizaciones de la operación.' },
  { question: '¿Cómo funciona el soporte?', answer: 'El ERP cuenta con una mesa de ayuda para registrar incidencias y dar seguimiento a las respuestas. Los canales, horarios y tiempos de atención se establecen en las condiciones del servicio contratado.' },
  { question: '¿Dónde consulto el precio y las condiciones?', answer: 'Solicita una propuesta para revisar el alcance que necesita tu empresa. Confirma las condiciones comerciales, la puesta en marcha y el soporte antes de contratar.' },
]

export function ForwardersLanding() {
  return (
    <div data-forwarders-landing className={`${styles.landing} min-h-screen bg-white text-[#07111F]`}>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-5 focus:py-3 focus:text-[#0038BD] focus:shadow-lg">Saltar al contenido</a>
      <LandingHeader />
      <main>
        <section id="contenido" tabIndex={-1} className={`${styles.hero} relative overflow-hidden border-b border-slate-200`}>
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[0.9fr_1.15fr] lg:gap-12 lg:py-20">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]"><span className="h-1.5 w-6 rounded-full bg-[#EF8E01]" aria-hidden="true" />Hecho para freight forwarders</p>
              <h1 className="mt-5 text-[2.4rem] font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">Cotiza. Coordina.<br /><span className="text-[#0038BD]">Controla tus márgenes.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">De la primera tarifa al cierre del embarque. Conecta a tu equipo comercial, operaciones y finanzas en una sola plataforma.</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a href="#demo" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-[#0038BD] px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/15 transition-colors hover:bg-[#002a90]">Solicitar demo <ArrowRight size={17} aria-hidden="true" /></a>
                <a href="#producto" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:border-[#0038BD] hover:text-[#0038BD]">Explorar el producto <ArrowDown size={16} aria-hidden="true" /></a>
              </div>
              <p className="mt-6 text-xs font-medium leading-6 text-slate-600">FCL / LCL <span aria-hidden="true" className="mx-2 text-slate-400">·</span> Aéreo <span aria-hidden="true" className="mx-2 text-slate-400">·</span> Terrestre <span aria-hidden="true" className="mx-2 text-slate-400">·</span> Courier</p>
            </div>
            <div className={`${styles.heroPreview} relative min-w-0`}>
              <div aria-hidden="true" className="absolute -inset-4 rounded-[2rem] border border-blue-200/60 bg-white/30 sm:-inset-5" />
              <figure className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-blue-950/10">
                <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={16} className="text-[#0038BD]" aria-hidden="true" />El margen, antes de aprobar</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Datos demo</span>
                </figcaption>
                <a href="#producto" className="group block" aria-label="Explorar las capturas reales del producto">
                  <Image src="/product/cotizacion-rentabilidad.webp" alt="Cotización de demostración con costo, venta y margen visibles en Forwarders ERP" width={1920} height={1080} sizes="(max-width: 1024px) 100vw, 660px" preload className="aspect-video h-auto w-full" />
                  <span className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">Una vista real de tu próximo flujo de trabajo <ArrowRight size={16} className="shrink-0 text-[#0038BD]" aria-hidden="true" /></span>
                </a>
              </figure>
            </div>
          </div>
        </section>

        <section id="beneficios" aria-label="Lo que conecta tu operación" className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-7 sm:px-8 md:grid-cols-3 md:gap-8">
            {[
              { icon: ShieldCheck, title: 'Margen visible', text: 'Costo y venta antes de aprobar.' },
              { icon: Route, title: 'Operación conectada', text: 'Del pricing al expediente del embarque.' },
              { icon: Globe2, title: 'Información compartida', text: 'Cada equipo con el acceso que necesita.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0038BD]"><Icon size={20} aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-600">{text}</p></div></div>
            ))}
          </div>
        </section>

        <section id="producto" className="bg-[#F7F9FC] px-5 py-16 sm:px-8 lg:py-20">
          <span id="funcionalidades" className="block" aria-hidden="true" />
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Conoce el producto</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Así trabaja tu equipo.</h2></div>
              <p className="max-w-md text-sm leading-6 text-slate-600">Explora seis vistas reales del sistema. Selecciona un área y amplía la captura para ver los detalles.</p>
            </div>
            <ProductShowcase />
          </div>
        </section>

        <section id="workflow" className="bg-[#09172B] px-5 py-16 text-white sm:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">Un recorrido completo</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cada etapa prepara la siguiente.</h2><p className="mt-4 text-base leading-7 text-slate-300">La información acompaña al embarque, desde la propuesta comercial hasta el resultado de la operación.</p></div>
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {workflow.map(({ number, title, detail, icon: Icon }) => (
                <li key={number} className="relative rounded-2xl border border-white/15 bg-white/[0.04] p-6">
                  <div className="flex items-center justify-between"><Icon size={24} className="text-[#FFB44B]" aria-hidden="true" /><span className="font-mono text-sm text-slate-400">{number}</span></div>
                  <h3 className="mt-6 text-base font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
                </li>
              ))}
            </ol>
            <a href="#demo" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#FFB44B] underline-offset-4 hover:underline">Veamos este flujo con tu operación <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
        </section>

        <section id="equipos" className="px-5 py-16 sm:px-8 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Un sistema, distintas responsabilidades</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Cada equipo sabe dónde mirar.</h2></div>
            <div className="mt-9 grid gap-5 md:grid-cols-3">
              {teams.map(({ name, question, detail, tags, icon: Icon }) => (
                <article key={name} className="rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center gap-3 text-sm font-semibold text-[#0038BD]"><Icon size={20} aria-hidden="true" />{name}</div>
                  <h3 className="mt-5 text-xl font-semibold leading-7 tracking-tight">{question}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
                  <ul className="mt-5 space-y-2">{tags.map((tag) => <li key={tag} className="flex items-center gap-2 text-xs font-medium text-slate-600"><Check size={14} className="text-[#0038BD]" aria-hidden="true" />{tag}</li>)}</ul>
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
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Antes de empezar</p><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Resolvamos tus preguntas.</h2><p className="mt-4 text-base leading-7 text-slate-600">El siguiente paso es entender cómo encaja Forwarders ERP en tu operación.</p><a href="#demo" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0038BD] underline-offset-4 hover:underline">Hablemos de tu caso <ArrowRight size={16} aria-hidden="true" /></a></div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {questions.map(({ question, answer }) => (
                <details key={question} name="landing-faq" className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-sm font-semibold leading-6 sm:text-base [&::-webkit-details-marker]:hidden">{question}<ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[#0038BD] transition-transform group-open:rotate-180" /></summary>
                  <p className="pb-6 pr-8 text-sm leading-7 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="demo" className="px-5 py-16 sm:px-8 lg:py-20">
          <div className="relative mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-3xl bg-[#09172B] p-6 sm:p-10 lg:grid-cols-[1fr_0.95fr] lg:gap-20 lg:p-14">
            <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-40 h-96 w-96 rounded-full bg-[#0038BD]/25 blur-3xl" />
            <div className="relative"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">Conversemos</p><h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">Tu operación merece<br />una vista completa.</h2><p className="mt-5 max-w-md text-base leading-7 text-slate-300">Cuéntanos quién eres. Revisemos cómo cotizas, coordinas tus embarques y controlas tus costos.</p>
              <ul className="mt-7 space-y-4">{['Conoce el flujo de principio a fin.', 'Revisa las herramientas para tu equipo.', 'Aclara el alcance de la puesta en marcha.'].map((item) => <li key={item} className="flex items-center gap-3 text-sm text-slate-200"><Check size={16} className="shrink-0 text-[#FFB44B]" aria-hidden="true" />{item}</li>)}</ul>
              <div className="mt-8 border-t border-white/15 pt-6"><p className="text-sm text-slate-300">¿Prefieres escribirnos?</p><a href={`mailto:${PLATFORM_CONTACT_EMAIL}`} className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-[#FFB44B] hover:underline"><Mail size={16} aria-hidden="true" />{PLATFORM_CONTACT_EMAIL}</a></div>
            </div>
            <div className="relative"><LandingContact /></div>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-[#F7F9FC] px-5 py-9 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div><p className="font-bold tracking-tight">{PLATFORM_NAME}</p><p className="mt-1 text-xs leading-6 text-slate-600">{PLATFORM_ATTRIBUTION}</p></div>
            <nav aria-label="Enlaces del pie de página" className="flex flex-wrap gap-x-6 gap-y-3">{landingNavigation.map((link) => <a key={link.href} href={link.href} className="text-sm text-slate-600 hover:text-[#0038BD]">{link.label}</a>)}</nav>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5 text-xs text-slate-600"><p>Creado por forwarders, para forwarders.</p><Link href="/politicas" className="underline underline-offset-4 hover:text-[#0038BD]">Términos y privacidad</Link></div>
        </div>
      </footer>
    </div>
  )
}
