/**
 * Reglas compartidas de las solicitudes de cotizacion por WhatsApp (Kapso).
 * Sin dependencias de servidor: las usan el webhook, las pantallas y las pruebas.
 */

export const WHATSAPP_REQUEST_STATUSES = ['Pendiente', 'En proceso', 'Cotizada'] as const
export type WhatsappRequestStatus = typeof WHATSAPP_REQUEST_STATUSES[number]

export const whatsappStatusTone: Record<WhatsappRequestStatus, string> = {
  Pendiente: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'En proceso': 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  Cotizada: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
}

/** Roles que pueden registrarse como remitentes autorizados. */
export const WHATSAPP_SENDER_ROLES = ['Admin', 'Ventas', 'Pricing'] as const

/** Deja solo dígitos; valida código de país + número (E.164 sin "+": 8 a 15 dígitos). */
export function normalizeWhatsappPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null
}

/** "50499998888" -> "+504 9999 8888" solo para mostrar. */
export function formatWhatsappPhone(digits: string) {
  if (digits.startsWith('504') && digits.length === 11) return `+504 ${digits.slice(3, 7)} ${digits.slice(7)}`
  if (digits.startsWith('1') && digits.length === 11) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  return `+${digits}`
}

/**
 * Por ahora una sola empresa es dueña del número de WhatsApp. El webhook solo
 * procesa si el tenant resuelto por el proxy coincide con KAPSO_TENANT_SLUG.
 * Sin configuración, se rechaza (falla cerrado).
 */
export function isWhatsappTenantAllowed(tenantSlug: string | null | undefined, configuredSlug: string | null | undefined) {
  const expected = configuredSlug?.trim().toLowerCase()
  return Boolean(expected && tenantSlug && tenantSlug === expected)
}

/**
 * phone_number_id del evento: campo top-level del evento (o del payload si es un lote)
 * o conversation.phone_number_id.
 */
export function eventPhoneNumberId(evento: unknown, payload?: unknown): string | null {
  const read = (value: unknown) => (typeof value === 'string' || typeof value === 'number') && String(value).trim() ? String(value).trim() : null
  const event = (evento ?? {}) as { phone_number_id?: unknown; conversation?: { phone_number_id?: unknown } }
  const root = (payload ?? {}) as { phone_number_id?: unknown }
  return read(event.phone_number_id) ?? read(event.conversation?.phone_number_id) ?? read(root.phone_number_id)
}

/** El evento pertenece al número configurado. Sin configuración, se ignora. */
export function isEventForPhoneNumber(evento: unknown, payload: unknown, configuredPhoneNumberId: string | null | undefined) {
  const expected = configuredPhoneNumberId?.trim()
  return Boolean(expected && eventPhoneNumberId(evento, payload) === expected)
}
