'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import { JourneyStagePanel } from './JourneyStagePanel'
import { operationJourney } from './landing-content'

export function OperationJourney() {
  return (
    <section id="workflow" className="overflow-hidden bg-white px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Un embarque, ocho decisiones conectadas</p>
            <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#07111F] sm:text-4xl lg:text-5xl">
              El expediente avanza. El contexto no vuelve a empezar.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-slate-600 lg:pb-1">
            Selecciona una etapa para ver qué decide el equipo, qué información permanece conectada, qué pantalla la representa y qué resultado entrega al siguiente paso.
          </p>
        </div>

        <Tabs defaultValue={operationJourney[0].id} className="mt-10 gap-5">
          <div className="overflow-x-auto pb-2" role="region" aria-label="Etapas del recorrido operativo" tabIndex={0}>
            <TabsList aria-label="Seleccionar etapa de la operación" className="h-auto w-max min-w-full justify-start gap-2 rounded-2xl border-slate-200 bg-[#F7F9FC] p-2">
              {operationJourney.map((stage) => (
                <TabsTrigger
                  key={stage.id}
                  value={stage.id}
                  className="min-h-11 min-w-36 flex-1 flex-col items-start gap-1 rounded-xl border border-transparent px-3 py-2.5 text-left text-slate-600 hover:bg-white data-[state=active]:border-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#07111F] data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-[#0038BD]"
                >
                  <span className="font-mono text-[9px] font-bold text-[#0038BD]">{stage.shortLabel}</span>
                  <span className="text-xs font-bold leading-4">{stage.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {operationJourney.map((stage) => (
            <TabsContent key={stage.id} value={stage.id} className="m-0 focus-visible:ring-2 focus-visible:ring-[#0038BD] focus-visible:ring-offset-4">
              <JourneyStagePanel stage={stage} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  )
}
