import { calendarDaysUntil, parseDateValue, toDateInputValue } from './format'

export const openCommercialStatuses = ['Pendiente de Fijar Precios', 'Pricing Aprobado', 'Enviada al Cliente']

export function isInCreationPeriod(createdAt: string | null, from: string, to: string) {
  if (from && to && from > to) return false
  if (!from && !to) return true
  const date = parseDateValue(createdAt)
  if (!date) return false
  const day = toDateInputValue(date)
  return (!from || day >= from) && (!to || day <= to)
}

/** Período inmediatamente anterior con el mismo número de días de calendario. */
export function previousCreationPeriod(from: string, to: string) {
  const start = parseDateValue(from)
  const end = parseDateValue(to)
  if (!start || !end || from > to) return null
  const days = (calendarDaysUntil(end, start) ?? 0) + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(start)
  previousStart.setDate(previousStart.getDate() - days)
  return { from: toDateInputValue(previousStart), to: toDateInputValue(previousEnd) }
}

export function summarizeCommercialQuotes<T extends { status: string | null }>(
  quotes: T[],
  totals: (quote: T) => { sale: number; profit: number }
) {
  let wonSale = 0
  let wonProfit = 0
  let openSale = 0
  let won = 0
  let lost = 0
  for (const quote of quotes) {
    const value = totals(quote)
    if (quote.status === 'Ganada') {
      won++
      wonSale += value.sale
      wonProfit += value.profit
    } else if (quote.status === 'Perdida') lost++
    else if (openCommercialStatuses.includes(quote.status || '')) openSale += value.sale
  }
  return {
    wonSale, wonProfit, openSale, won, lost,
    margin: wonSale > 0 ? wonProfit / wonSale * 100 : null,
    closeRate: won + lost > 0 ? won / (won + lost) * 100 : null,
  }
}

export function commercialChange(current: number | null, previous: number | null, points = false) {
  if (current === null || previous === null) return 'Sin base comparable'
  if (points) {
    const difference = current - previous
    return `${difference > 0 ? '+' : ''}${difference.toFixed(1)} pp`
  }
  if (previous <= 0) return current === previous ? 'Sin variación' : 'Sin base comparable'
  const difference = (current - previous) / previous * 100
  return `${difference > 0 ? '+' : ''}${difference.toFixed(1)}%`
}
