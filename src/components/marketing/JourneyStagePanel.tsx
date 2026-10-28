import { CheckCircle2, Database, Flag, Users } from 'lucide-react'
import type { OperationJourneyStage } from './landing-content'
import { ProductFrame } from './ProductFrame'

type JourneyStagePanelProps = {
  stage: OperationJourneyStage
}

const stageFacts = [
  { key: 'decision', label: 'Decisión', icon: CheckCircle2 },
  { key: 'team', label: 'Equipo', icon: Users },
  { key: 'connectedInformation', label: 'Información conectada', icon: Database },
  { key: 'result', label: 'Resultado', icon: Flag },
] as const

export function JourneyStagePanel({ stage }: JourneyStagePanelProps) {
  return (
    <div className="grid gap-6 rounded-3xl border border-slate-200 bg-[#F7F9FC] p-4 sm:p-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-10 lg:p-8">
      <div className="order-2 min-w-0 lg:order-1">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#0038BD]">
          Etapa {stage.shortLabel}
        </p>
        <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em] text-[#07111F] sm:text-3xl">
          {stage.label}
        </h3>
        <dl className="mt-6 grid gap-3">
          {stageFacts.map(({ key, label, icon: Icon }) => (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
              <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#0038BD]">
                <Icon size={15} aria-hidden="true" />
                {label}
              </dt>
              <dd className="mt-2 text-sm leading-6 text-slate-600">{stage[key]}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="order-1 min-w-0 lg:order-2">
        <ProductFrame src={stage.image} alt={stage.alt} label={`Pantalla relacionada · ${stage.label}`} />
      </div>
    </div>
  )
}
