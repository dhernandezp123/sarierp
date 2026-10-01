import { ChevronDown, CircleHelp } from 'lucide-react'

type InsuranceCalculationDetailsProps = {
  notes?: string | null
}

export function InsuranceCalculationDetails({
  notes,
}: InsuranceCalculationDetailsProps) {
  const calculationSteps = (notes || '')
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean)

  return (
    <details className="group mt-2 w-full max-w-xl overflow-hidden rounded-lg border border-blue-200 bg-blue-50/70 text-left dark:border-blue-800 dark:bg-blue-950/30">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-800 outline-none transition hover:bg-blue-100/80 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-blue-200 dark:hover:bg-blue-900/40 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
          <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
        <span>
          Ver desglose del cálculo
          {calculationSteps.length > 0 ? ` (${calculationSteps.length} pasos)` : ''}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-blue-200 bg-white/80 px-3 py-3 dark:border-blue-800 dark:bg-slate-950/40">
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
          Base asegurada, servicios cubiertos, porcentajes e impuesto aplicados.
        </p>

        {calculationSteps.length > 0 ? (
          <ol className="mt-3 space-y-2">
            {calculationSteps.map((step, index) => {
              const separatorIndex = step.indexOf(':')
              const label = separatorIndex >= 0
                ? step.slice(0, separatorIndex).trim()
                : ''
              const value = separatorIndex >= 0
                ? step.slice(separatorIndex + 1).trim()
                : step

              return (
                <li
                  key={`${index}-${step}`}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2 text-xs leading-5 text-slate-700 dark:text-slate-200"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {index + 1}
                  </span>
                  <p className="min-w-0 break-words">
                    {label ? (
                      <>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {label}:
                        </span>{' '}
                        {value}
                      </>
                    ) : (
                      value
                    )}
                  </p>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            Esta línea no tiene el detalle histórico del cálculo.
          </p>
        )}
      </div>
    </details>
  )
}
