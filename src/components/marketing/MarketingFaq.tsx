import { ArrowRight, ChevronDown } from 'lucide-react'
import { landingQuestions } from './landing-content'

export function MarketingFaq() {
  return (
    <section id="preguntas" className="border-y border-slate-200 bg-[#F7F9FC] px-5 py-16 sm:px-8 lg:py-20">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.7fr_1fr] lg:gap-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Antes de empezar</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#07111F] sm:text-4xl">Resolvamos tus preguntas.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">El siguiente paso es entender cómo encaja Forwarders.app en tu operación.</p>
          <a href="#demo" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0038BD] underline-offset-4 hover:underline">
            Hablemos de tu caso <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {landingQuestions.map(({ question, answer }) => (
            <details key={question} name="landing-faq" className="group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-5 py-5 text-sm font-semibold leading-6 sm:text-base [&::-webkit-details-marker]:hidden">
                {question}
                <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-[#0038BD] transition-transform group-open:rotate-180" />
              </summary>
              <p className="pb-6 pr-8 text-sm leading-7 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
