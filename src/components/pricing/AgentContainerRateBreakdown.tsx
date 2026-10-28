import { cn } from '@/src/lib/utils'
import { mutedCardClass } from '@/src/lib/ui'

type ContainerRate = {
  id: string
  container_type_name: string | null
  quantity: number | string | null
  ocean_freight: number | string | null
}

type AgentContainerRateBreakdownProps = {
  rates?: ContainerRate[] | null
  currency: string
  formatCurrency: (value: number) => string
}

export function AgentContainerRateBreakdown({
  rates,
  currency,
  formatCurrency,
}: AgentContainerRateBreakdownProps) {
  return (
    <div className={cn(mutedCardClass, 'mb-3 p-3')}>
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
        Flete por contenedor
      </p>

      {rates && rates.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {rates.map((rate) => {
            const quantity = Number(rate.quantity || 0)
            const unitCost = rate.ocean_freight === null
              ? null
              : Number(rate.ocean_freight)
            const hasCost = unitCost !== null && Number.isFinite(unitCost)

            return (
              <li key={rate.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm">
                <span className="min-w-0 break-words text-slate-700 dark:text-slate-200">
                  {quantity} × {rate.container_type_name || 'Contenedor'}
                </span>
                <div className="ml-auto text-right">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {hasCost ? `${currency} ${formatCurrency(unitCost)}` : 'Sin costo registrado'}
                  </p>
                  {hasCost && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      por contenedor
                    </p>
                  )}
                  {hasCost && quantity > 1 && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Subtotal: {currency} {formatCurrency(unitCost * quantity)}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Esta tarifa no tiene un desglose por contenedor registrado.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Costos base. EXW, MBL y PS se incluyen en el costo final.
      </p>
    </div>
  )
}
