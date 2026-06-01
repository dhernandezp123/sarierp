import { cn } from '@/src/lib/utils'
import { getCarrier } from '@/src/lib/constants/carriers'

type CarrierBadgeProps = {
  code?: string | null
  showName?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function CarrierBadge({
  code,
  showName = false,
  size = 'md',
  className,
}: CarrierBadgeProps) {
  const carrier = getCarrier(code)

  if (!carrier) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full bg-slate-100 font-semibold text-slate-600',
          size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
          className
        )}
      >
        {code || 'N/A'}
      </span>
    )
  }

  return (
    <span
      style={{ backgroundColor: carrier.bg, color: carrier.text }}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-bold tracking-wide',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      <span>{carrier.code}</span>
      {showName && <span className="font-semibold">{carrier.name}</span>}
    </span>
  )
}
