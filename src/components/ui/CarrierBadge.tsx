"use client"

// src/components/ui/CarrierBadge.tsx
// Badge visual con colores de marca del carrier.
// Uso: <CarrierBadge code="MSC" /> o <CarrierBadge code="MSC" showName />

import { getCarrier } from "@/src/lib/constants/carriers"
import { cn } from "@/src/lib/utils"

interface CarrierBadgeProps {
  code: string
  showName?: boolean   // muestra el nombre completo al lado del código
  size?: "sm" | "md"
  className?: string
}

export function CarrierBadge({
  code,
  showName = false,
  size = "md",
  className,
}: CarrierBadgeProps) {
  const carrier = getCarrier(code)
  const shouldShowName =
    showName &&
    carrier?.name.trim().toLocaleUpperCase() !== carrier?.code.trim().toLocaleUpperCase()

  // Fallback para carriers no registrados
  if (!carrier) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md font-semibold",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
          "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
          className
        )}
      >
        {code}
      </span>
    )
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        style={{ backgroundColor: carrier.bg, color: carrier.text }}
        className={cn(
          "inline-flex items-center rounded-md font-bold tracking-wide",
          size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
        )}
      >
        {carrier.code}
      </span>
      {shouldShowName && (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {carrier.name}
        </span>
      )}
    </span>
  )
}
