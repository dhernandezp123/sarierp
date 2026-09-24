import { GitBranch, ScanSearch, ShieldCheck } from 'lucide-react'
import { productEvidence } from './landing-content'

const evidenceIcons = [ScanSearch, GitBranch, ShieldCheck]

export function ProductEvidence() {
  return (
    <section id="beneficios" aria-label="Evidencia del producto" className="border-b border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-7 sm:px-8 md:grid-cols-3 md:gap-8">
        {productEvidence.map((item, index) => {
          const Icon = evidenceIcons[index]
          return (
            <div key={item.title} className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0038BD]">
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#07111F]">{item.title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
