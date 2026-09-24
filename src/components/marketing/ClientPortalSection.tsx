import Link from 'next/link'
import { ArrowRight, CheckCircle2, Eye, LockKeyhole } from 'lucide-react'

const internalFields = [
  'Referencia operativa y responsable',
  'Documentos y controles internos',
  'Costos y validaciones del expediente',
]

const clientFields = [
  'Estado actual y fecha del evento',
  'Historial de movimientos permitido',
  'Información visible de su carga',
]

export function ClientPortalSection() {
  return (
    <section id="portal" className="border-y border-slate-200 bg-[#F7F9FC] px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Portal del cliente</p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#07111F] sm:text-4xl">
              El mismo evento. La visibilidad que corresponde a cada usuario.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-slate-600">
            El equipo conserva el contexto operativo interno. El cliente consulta los hitos y datos permitidos desde un acceso separado, sin exponer costos, notas ni controles privados.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-48px_rgba(15,41,94,0.45)] sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#0038BD]">Evento Demo · 31/07/2026</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight text-[#07111F]">Carga en tránsito a Honduras</h3>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0038BD]">DEMO-SHP-001</span>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl bg-[#09172B] p-5 text-white sm:p-7">
              <div className="flex items-center gap-3 text-sm font-bold"><LockKeyhole size={18} className="text-[#FFB44B]" aria-hidden="true" />Vista interna</div>
              <p className="mt-3 text-sm leading-6 text-slate-300">Operaciones administra el evento dentro del expediente y conserva los controles que no son públicos.</p>
              <ul className="mt-6 space-y-3">
                {internalFields.map((field) => <li key={field} className="flex gap-3 text-sm text-slate-200"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#5EE0A4]" aria-hidden="true" />{field}</li>)}
              </ul>
            </article>

            <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-7">
              <div className="flex items-center gap-3 text-sm font-bold text-[#0038BD]"><Eye size={18} aria-hidden="true" />Vista permitida del cliente</div>
              <p className="mt-3 text-sm leading-6 text-slate-600">El portal traduce el mismo evento en seguimiento claro, usando únicamente la información habilitada para el cliente.</p>
              <ul className="mt-6 space-y-3">
                {clientFields.map((field) => <li key={field} className="flex gap-3 text-sm text-slate-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#0038BD]" aria-hidden="true" />{field}</li>)}
              </ul>
            </article>
          </div>

          <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
            <p className="text-xs leading-5 text-slate-500">Representación conceptual con referencia y evento ficticios del ambiente Demo.</p>
            <Link href="/portal/login" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-blue-200 bg-white px-5 text-sm font-semibold text-[#0038BD] hover:bg-blue-50">
              Ingresar al portal <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
