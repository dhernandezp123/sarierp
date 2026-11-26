
const marginSteps = [
  { label: 'Costo estimado', value: 'USD 3,650.00', tone: 'border-slate-200 bg-white text-[#07111F]' },
  { label: 'Venta', value: 'USD 4,950.00', tone: 'border-blue-100 bg-blue-50 text-[#0038BD]' },
  { label: 'Margen cotizado', value: 'USD 1,300.00', tone: 'border-emerald-100 bg-emerald-50 text-emerald-800' },
  { label: 'Costo adicional', value: '+USD 250.00', tone: 'border-amber-100 bg-amber-50 text-amber-800' },
  { label: 'Margen final', value: 'USD 1,050.00', tone: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
]

export function MarginStory() {
  return (
    <section id="margen" className="bg-[#07111F] px-5 py-16 text-white sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFB44B]">La historia del margen</p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl lg:text-5xl">
              Un cargo de USD 250.00 cambia el resultado.
            </h2>
          </div>
          <div>
            <p className="max-w-2xl text-base leading-8 text-slate-300">
              La venta se mantiene en USD 4,950.00. Si el agente cobra USD 250.00 adicionales, el costo final sube a USD 3,900.00 y el margen baja a USD 1,050.00.
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Ejemplo ficticio a partir de la cotización demo.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <ol className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-5">
            {marginSteps.map((step) => (
              <li key={step.label} className="flex min-w-0 flex-1 items-center gap-3">
                <div className={`flex h-full min-h-24 min-w-0 flex-1 flex-col justify-between rounded-2xl border p-5 ${step.tone}`}>
                  <span className="text-xs font-bold uppercase tracking-[0.08em]">{step.label}</span>
                  <strong className="mt-3 text-lg font-semibold tracking-tight">{step.value}</strong>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
