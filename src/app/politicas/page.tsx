import Link from 'next/link'
import platformPolicy from '@/public/legal/platform-2026-09-07.json'
import { Globe2, ArrowLeft, Mail } from 'lucide-react'
import {
  PLATFORM_ATTRIBUTION,
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_NAME,
} from '@/src/lib/platform-branding'

export const metadata = {
  title: 'Términos de Uso y Privacidad — Forwarders ERP by Hernova Systems',
  description: 'Términos de uso, aviso de privacidad y condiciones del sistema logístico Forwarders ERP.',
}

const sections = platformPolicy.sections

function SectionBody({ body }: { body: string }) {
  const blocks = body.split('\n\n')
  return (
    <div className="space-y-3.5">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const hasBullets = lines.some((l) => l.startsWith('•'))

        if (hasBullets) {
          return (
            <ul key={i} className="space-y-2">
              {lines.map((line, j) =>
                line.startsWith('•') ? (
                  <li key={j} className="flex items-start gap-3">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#EF8E01]" />
                    <span className="text-sm leading-relaxed text-slate-600 text-left">
                      {line.replace(/^•\s*/, '')}
                    </span>
                  </li>
                ) : (
                  <p key={j} className="text-sm leading-relaxed text-slate-600 text-left">
                    {line}
                  </p>
                )
              )}
            </ul>
          )
        }

        return (
          <p key={i} className="text-sm leading-relaxed text-slate-600 text-left">
            {block}
          </p>
        )
      })}
    </div>
  )
}

export default function PoliticasPage() {
  return (
    <main className="min-h-screen bg-[#F7F8FA] text-[#07111F]">

      {/* Nav */}
      <nav className="sticky top-0 z-20 border-b border-white/8 bg-[#07111F]/96 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EF8E01] text-white shadow-sm">
              <Globe2 size={15} />
            </span>
            <span className="text-sm font-bold text-white">Forwarders ERP</span>
            <span className="hidden text-[11px] text-slate-500 sm:block">by Hernova Systems</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            <ArrowLeft size={12} />
            Volver al inicio
          </Link>
        </div>
      </nav>

      {/* Hero — dark */}
      <header className="relative isolate overflow-hidden bg-[#07111F] px-5 py-16 sm:px-8 sm:py-20">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[#EF8E01]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#0038BD]/15 blur-3xl" />
        {/* Grid */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,white,transparent_78%)]" />

        <div className="relative z-10 mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#EF8E01]/25 bg-[#EF8E01]/10 px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EF8E01]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#EF8E01]">
              Forwarders ERP by Hernova Systems
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Términos de Uso y Aviso de Privacidad
          </h1>

          <p className="mt-3 text-base text-slate-400">
            Versión {platformPolicy.version} · Edición {platformPolicy.edition}. {platformPolicy.effective}
          </p>

          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-400 text-left">
            Estos términos establecen las condiciones de uso, responsabilidades y compromisos
            entre el titular de Hernova Systems y las organizaciones que utilizan la plataforma Forwarders ERP para
            gestionar sus operaciones de carga internacional. Deben leerse junto con la orden
            de servicio, el SLA y el acuerdo de tratamiento de datos aplicables.
          </p>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <details className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 lg:hidden">
          <summary className="cursor-pointer font-semibold text-slate-800">Contenido de las políticas</summary>
          <nav aria-label="Contenido de las políticas" className="mt-4 flex flex-col gap-3 text-sm text-blue-700">
            {sections.map(section => <a key={section.id} href={`#${section.id}`} className="underline underline-offset-4">{section.title}</a>)}
          </nav>
        </details>
        <div className="grid gap-10 lg:grid-cols-[224px_1fr] lg:items-start">

          {/* Índice lateral */}
          <aside className="hidden lg:block">
            <div className="sticky top-[72px] max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-[#07111F] px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#EF8E01]">
                  Contenido
                </p>
              </div>
              <nav className="p-2.5">
                {sections.map((s, i) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="group flex items-center gap-2.5 rounded-xl px-3 py-2 transition hover:bg-[#0038BD]/5"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-500 transition group-hover:bg-[#0038BD]/10 group-hover:text-[#0038BD]">
                      {i + 1}
                    </span>
                    <span className="text-[11px] font-medium leading-tight text-slate-500 transition group-hover:text-[#0038BD]">
                      {s.title}
                    </span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          {/* Secciones */}
          <div className="space-y-5">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={s.id}
                className="group relative overflow-hidden scroll-mt-[80px] rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-[#0038BD]/5"
              >
                {/* Gradient bar — animada on hover */}
                <div className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-[#0038BD] to-[#EF8E01] transition-transform duration-500 group-hover:scale-x-100" />

                <div className="p-6 sm:p-8">
                  {/* Número + título */}
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0038BD]/8 text-[11px] font-bold text-[#0038BD]">
                      {i + 1}
                    </span>
                    <h2 className="text-base font-bold leading-snug text-[#07111F]">
                      {s.title}
                    </h2>
                  </div>

                  {/* Divisor */}
                  <div className="my-4 h-px bg-gradient-to-r from-slate-100 via-slate-200 to-transparent" />

                  {/* Contenido */}
                  <SectionBody body={s.body} />
                </div>
              </section>
            ))}

            <div className="flex flex-wrap gap-4 text-sm text-blue-700 underline underline-offset-4">
              <Link href="/terminos-logisticos">Condiciones del servicio logístico</Link>
              <a href="/legal/platform-2026-09-07.json" download>Descargar esta versión</a>
              <a href="/legal/platform-2026-06-22.json" download>Consultar versión anterior (22/06/2026)</a>
            </div>
            {/* CTA contacto */}
            <div className="relative overflow-hidden rounded-2xl bg-[#07111F] p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#EF8E01]/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-[#0038BD]/20 blur-3xl" />
              <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#EF8E01]">
                    Soporte
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-white">
                    ¿Tienes preguntas sobre estas políticas?
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Atenderemos tu consulta según su naturaleza, la normativa aplicable y los plazos acordados.
                  </p>
                </div>
                <a
                  href={`mailto:${PLATFORM_CONTACT_EMAIL}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#EF8E01] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#EF8E01]/20 transition hover:bg-[#db8000]"
                >
                  <Mail size={15} />
                  {PLATFORM_CONTACT_EMAIL}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/8 bg-[#07111F] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#EF8E01]/15">
              <Globe2 size={12} className="text-[#EF8E01]" />
            </span>
            <div className="text-xs leading-relaxed text-slate-500">
              <p className="font-semibold text-slate-400">{PLATFORM_NAME}</p>
              <p>{PLATFORM_ATTRIBUTION}</p>
              <p>Todos los derechos reservados.</p>
            </div>
          </div>
          <p className="text-xs text-slate-600">Honduras &amp; Centroam&eacute;rica</p>
        </div>
      </footer>

    </main>
  )
}
