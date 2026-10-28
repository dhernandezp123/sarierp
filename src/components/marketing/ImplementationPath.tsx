import { ArrowRight } from 'lucide-react'
import { implementationSteps } from './landing-content'

export function ImplementationPath() {
  return (
    <section id="implementacion" className="bg-white px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Un camino que se define contigo</p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#07111F] sm:text-4xl lg:text-5xl">
              Antes de poner en marcha, aclaramos el alcance.
            </h2>
          </div>
          <div>
            <p className="max-w-2xl text-base leading-8 text-slate-600">
              La configuración y preparación dependen de los flujos, datos y responsables de cada empresa. Por eso el proceso comienza con diagnóstico y termina cuando las condiciones acordadas están preparadas.
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">Los tiempos y compromisos se confirman únicamente dentro de una propuesta comercial aprobada.</p>
          </div>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {implementationSteps.map((step, index) => (
            <li key={step.number} className="relative rounded-2xl border border-slate-200 bg-[#F7F9FC] p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-bold text-[#0038BD]">{step.number}</span>
                {index < implementationSteps.length - 1 ? <ArrowRight size={15} className="hidden text-slate-400 lg:block" aria-hidden="true" /> : null}
              </div>
              <h3 className="mt-7 text-base font-semibold text-[#07111F]">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
