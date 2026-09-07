import { canAccessPath, getDefaultPathForRole } from './permissions'

/** Normaliza el destino antes de comprobar permisos; conserva filtros y fragmentos. */
export function getLoginDestination(role: string | null | undefined, requested: string | null): string {
  const fallback = getDefaultPathForRole(role)
  if (!requested?.startsWith('/') || requested.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(requested)) return fallback

  try {
    const base = 'https://erp.invalid'
    const destination = new URL(requested, base)
    if (destination.origin !== base || !canAccessPath(role, destination.pathname)) return fallback
    if (['/portal/login', '/portal/register', '/portal/forgot-password', '/portal/reset-password'].includes(destination.pathname.replace(/\/$/, ''))) return fallback
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return fallback
  }
}
