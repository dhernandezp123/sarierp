'use client'

import { CheckCircle2, Database, GitBranch } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs'
import { teamRoles } from './landing-content'

const roleFacts = [
  { key: 'receives', label: 'Información que recibe', icon: Database },
  { key: 'decision', label: 'Decisión que toma', icon: GitBranch },
  { key: 'result', label: 'Resultado que entrega', icon: CheckCircle2 },
] as const

export function TeamRoleSwitcher() {
  return (
    <section id="equipos" className="bg-white px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">Un expediente, distintas responsabilidades</p>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em] text-[#07111F] sm:text-4xl lg:text-5xl">
            Cada equipo ve su trabajo. La operación conserva el hilo.
          </h2>
        </div>

        <Tabs defaultValue={teamRoles[0].id} className="mt-9 gap-5 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <div className="overflow-x-auto pb-2 lg:overflow-visible">
            <TabsList aria-label="Seleccionar equipo" className="h-auto w-max gap-2 border-slate-200 bg-[#F7F9FC] p-2 lg:w-full lg:flex-col">
              {teamRoles.map((role, index) => (
                <TabsTrigger
                  key={role.id}
                  value={role.id}
                  className="min-h-11 min-w-52 justify-start gap-3 border border-transparent px-4 py-3 text-left text-slate-600 data-[state=active]:border-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#07111F] data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-[#0038BD] lg:w-full"
                >
                  <span className="font-mono text-[10px] font-bold text-[#0038BD]">0{index + 1}</span>
                  <span className="text-xs font-bold">{role.name}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-w-0">
            {teamRoles.map((role) => (
              <TabsContent key={role.id} value={role.id} className="m-0">
                <article className="rounded-3xl border border-slate-200 bg-[#F7F9FC] p-5 sm:p-8">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0038BD]">{role.name}</p>
                  <h3 className="mt-3 max-w-2xl font-display text-2xl font-semibold tracking-[-0.03em] text-[#07111F] sm:text-3xl">
                    {role.question}
                  </h3>
                  <dl className="mt-7 grid gap-4 md:grid-cols-3">
                    {roleFacts.map(({ key, label, icon: Icon }) => (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5">
                        <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#0038BD]">
                          <Icon size={16} aria-hidden="true" />
                          {label}
                        </dt>
                        <dd className="mt-3 text-sm leading-7 text-slate-600">{role[key]}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </section>
  )
}
