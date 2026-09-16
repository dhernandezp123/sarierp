import { parseDateValue } from './format'

// Límite de representación del formulario, no una regla de vigencia fiscal.
export function isValidCaiDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' && !!parseDateValue(value)
}

export function validateCaiRange(form: { cai: string; rango_desde: string; rango_hasta: string; fecha_limite_emision: string }): string | null {
  if (!form.cai.trim()) return 'Ingresa el CAI.'
  if (!isValidCaiDate(form.fecha_limite_emision)) return 'Ingresa una fecha válida con año de cuatro dígitos.'
  const start = /^(.*-)(\d+)$/.exec(form.rango_desde.trim())
  const end = /^(.*-)(\d+)$/.exec(form.rango_hasta.trim())
  if (!start || !end || start[1] !== end[1] || start[2].length !== end[2].length) return 'Los rangos deben tener el mismo prefijo y cantidad de dígitos.'
  if (BigInt(start[2]) > BigInt(end[2])) return 'El inicio del rango no puede ser mayor que el final.'
  return null
}
