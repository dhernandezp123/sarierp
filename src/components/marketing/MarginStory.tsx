import { ArrowRight, Minus } from 'lucide-react'

const marginSteps = [
  { label: 'Costo estimado', value: 'USD 3,650.00', tone: 'border-slate-200 bg-white text-[#07111F]' },
  { label: 'Venta', value: 'USD 4,950.00', tone: 'border-blue-100 bg-blue-50 text-[#0038BD]' },
  { label: 'GP cotizado', value: 'USD 1,300.00', tone: 'border-emerald-100 bg-emerald-50 text-emerald-800' },
  { label: 'Variación de costos', value: 'USD 0.00', tone: 'border-amber-100 bg-amber-50 text-amber-800' },
  { label: 'GP real', value: 'USD 1,300.00', tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
]

export function MarginStory() {
  return (
    <section id="margen" className="bg-[#07111F] px-5 py-16 text-white sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">La historia del margen</p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl">
              Lo cotizado y lo registrado, en la misma conversación.
            </h2>
          </div>
          <div>
            <p className="max-w-2xl text-base leading-8 text-slate-300">
              La venta y el costo estimado forman el GP cotizado. Al registrar y validar los costos de la operación, el equipo puede revisar la variación y el GP real disponible.
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Visualización conceptual con los datos ficticios de la captura Demo. No es una calculadora ni una promesa de ahorro.
            </p>
          </div>
        </div>

        <div className="mt-10 overflow-x-auto pb-3" role="region" aria-label="Recorrido conceptual del margen" tabIndex={0}>
          <ol className="flex min-w-[62rem] items-stretch gap-3 lg:min-w-0">
            {marginSteps.map((step, index) => (
              <li key={step.label} className="flex min-w-0 flex-1 items-center gap-3">
                <div className={`flex h-full min-h-32 min-w-0 flex-1 flex-col justify-between rounded-2xl border p-5 ${step.tone}`}>
                  <span className="text-xs font-bold uppercase tracking-[0.08em] opacity-75">{step.label}</span>
                  <strong className="mt-6 text-xl font-semibold tracking-tight">{step.value}</strong>
                </div>
                {index < marginSteps.length - 1 ? (
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-[#FFB44B]">
                    {index === 2 ? <Minus size={15} /> : <ArrowRight size={15} />}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
