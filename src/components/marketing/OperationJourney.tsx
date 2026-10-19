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
            Selecciona cualquier etapa para ver qué decide cada equipo, qué información viaja conectada y qué resultado recibe el siguiente paso.
          </p>
        </div>

        <Tabs defaultValue={operationJourney[0].id} className="mt-10 gap-5">
          <TabsList aria-label="Seleccionar etapa de la operación" className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-slate-200/80 bg-[#F7F9FC] p-2 sm:grid-cols-4 xl:grid-cols-8">
            {operationJourney.map((stage) => (
              <TabsTrigger
                key={stage.id}
                value={stage.id}
                className="flex min-h-14 w-full min-w-0 flex-col items-start justify-center gap-1 whitespace-normal rounded-xl border border-transparent px-3 py-2.5 text-left text-slate-600 hover:bg-white data-[state=active]:border-blue-200 data-[state=active]:bg-white data-[state=active]:text-[#07111F] data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-[#0038BD]"
              >
                <span className="font-mono text-[10px] font-bold text-[#0038BD]">{stage.shortLabel}</span>
                <span className="block w-full whitespace-normal text-xs font-bold leading-4">{stage.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

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
