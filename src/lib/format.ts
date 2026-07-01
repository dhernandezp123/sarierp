// Helper único de formato de fecha y moneda (REP-006 / REP-007).
//
// Regla crítica de fechas: las columnas DATE de Postgres llegan como
// 'YYYY-MM-DD'. `new Date('YYYY-MM-DD')` las interpreta como medianoche UTC,
// por lo que en Honduras (UTC-6) se muestran como el día anterior. Aquí las
// fechas sin hora se interpretan siempre en horario local.

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte un valor de fecha (columna DATE 'YYYY-MM-DD' o timestamp ISO)
 * en un Date seguro en zona local. Retorna null si no es interpretable.
 */
export function parseDateValue(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  if (DATE_ONLY_RE.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Formato estándar del ERP: DD/MM/YYYY. */
export function formatDate(value: string | Date | null | undefined, fallback = '-'): string {
  const date = parseDateValue(value)
  if (!date) return fallback
  return date.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Fecha corta para listados: DD mes [YYYY]. */
export function formatDateShort(
  value: string | Date | null | undefined,
  options: { year?: boolean } = {},
  fallback = '-'
): string {
  const date = parseDateValue(value)
  if (!date) return fallback
  return date.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: 'short',
    ...(options.year ? { year: 'numeric' } : {}),
  })
}

/** Fecha y hora local: DD/MM/YYYY HH:mm. */
export function formatDateTime(value: string | Date | null | undefined, fallback = '-'): string {
  const date = parseDateValue(value)
  if (!date) return fallback
  return date.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Valor 'YYYY-MM-DD' en zona local para inputs type="date" y filtros.
 * No usar `toISOString().slice(0, 10)`: después de las 18:00 en Honduras
 * devuelve el día siguiente (UTC).
 */
export function toDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Formato monetario estándar del ERP: 'USD 5,865.00'. */
export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  const value = Number(amount || 0)
  return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
