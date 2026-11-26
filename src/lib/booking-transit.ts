import { calendarDaysUntil, parseDateValue } from '@/src/lib/format'

/**
 * Días de tránsito reales: días calendario entre la salida real y el arribo
 * real. Devuelve null si falta alguna fecha o si el arribo es anterior a la
 * salida (dato inconsistente que debe corregirse en el itinerario).
 */
export function realTransitDays(actualEtd?: string | null, actualEta?: string | null) {
  const departure = parseDateValue(actualEtd)
  if (!departure || !actualEta) return null
  const days = calendarDaysUntil(actualEta, departure)
  return days === null || days < 0 ? null : days
}

type FreeDaysSource = {
  free_days?: number | null
  actual_eta?: string | null
  remaining_free_days?: number | null
}

/**
 * Días libres restantes con el día de arribo real como día 1: con 14 días y
 * arribo el 02/01, el último día libre es el 15/01 (restan 1) y el 16/01 ya
 * es 0. Un valor negativo indica días en demora. Sin días libres o sin arribo
 * real se conserva el valor capturado.
 */
export function effectiveRemainingFreeDays(source: FreeDaysSource, today = new Date()) {
  const freeDays = source.free_days
  if (freeDays === null || freeDays === undefined || !Number.isFinite(Number(freeDays)) || !source.actual_eta) {
    return source.remaining_free_days ?? null
  }
  const elapsed = calendarDaysUntil(today, parseDateValue(source.actual_eta) || undefined)
  if (elapsed === null) return source.remaining_free_days ?? null
  return Number(freeDays) - Math.max(elapsed, 0)
}

/** Último día libre (fecha local) con la misma regla; null si no hay base. */
export function lastFreeDay(source: FreeDaysSource) {
  const arrival = parseDateValue(source.actual_eta)
  const freeDays = Number(source.free_days)
  if (!arrival || source.free_days === null || source.free_days === undefined || !Number.isFinite(freeDays) || freeDays <= 0) return null
  const last = new Date(arrival)
  last.setHours(0, 0, 0, 0)
  last.setDate(last.getDate() + freeDays - 1)
  return last
}
