import { RESERVED_TENANT_SLUGS } from './tenant-host'

export const PLATFORM_SECTIONS = ['overview', 'companies', 'users', 'activity'] as const
export type PlatformSection = (typeof PLATFORM_SECTIONS)[number]
export const PLATFORM_PATHS = ['/platform', '/platform/companies', '/platform/users', '/platform/activity']
export const COMPANY_STATUSES = ['Activo', 'Suspendido', 'Archivado'] as const
export const ACCESS_STATUSES = ['Pendiente', 'Aprobado', 'Rechazado'] as const
export const INTERNAL_ROLES = ['Admin', 'Ventas', 'Pricing', 'Operaciones', 'Contabilidad', 'Finanzas'] as const

type PlatformProfile = {
  rol?: string | null; status?: string | null; is_active?: boolean | null
  is_platform_admin?: boolean | null; tenant_id?: string | null
}

export function canManagePlatform(profile: PlatformProfile | null | undefined) {
  return profile?.is_platform_admin === true && profile.tenant_id == null
    && profile.rol === 'Admin' && profile.status === 'Aprobado' && profile.is_active === true
}

export function isPlatformConsolePath(pathname: string) {
  return PLATFORM_PATHS.includes(pathname)
}

export class PlatformInputError extends Error {}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function text(value: unknown, max: number, label: string, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new PlatformInputError(`${label}: ingresa entre ${min} y ${max} caracteres, sin saltos de línea.`)
  }
  return value.trim()
}
function uuid(value: unknown) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new PlatformInputError('Identificador inválido.')
  return value
}
function choice(value: unknown, choices: readonly string[]) {
  if (typeof value !== 'string' || !choices.includes(value)) throw new PlatformInputError('Selecciona una opción válida.')
  return value
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlatformInputError('Solicitud inválida.')
  return value as Record<string, unknown>
}

export function platformReadParams(params: URLSearchParams) {
  const section = choice(params.get('section') || 'overview', PLATFORM_SECTIONS)
  const page = Number(params.get('page') || '1')
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new PlatformInputError('Página inválida.')
  const search = (params.get('search') || '').trim()
  if (search.length > 100 || /[\u0000-\u001f\u007f]/.test(search)) throw new PlatformInputError('Búsqueda inválida.')
  const status = params.get('status') || ''
  if (status) choice(status, section === 'companies' ? COMPANY_STATUSES : section === 'users' ? ACCESS_STATUSES : [])
  return { p_section: section, p_search: search, p_status: status, p_page: page }
}

export function platformMutation(value: unknown) {
  const body = object(value)
  const reason = text(body.reason, 500, 'Motivo', 5)
  if (body.action === 'create-company') {
    const slug = text(body.slug, 63, 'Subdominio').toLowerCase()
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || RESERVED_TENANT_SLUGS.has(slug)) {
      throw new PlatformInputError('El subdominio no es válido o está reservado.')
    }
    return { rpc: 'platform_create_company', args: { p_name: text(body.name, 160, 'Nombre'), p_slug: slug, p_reason: reason } }
  }
  if (body.action === 'update-company') {
    const expected = text(body.expected_updated_at, 50, 'Versión de empresa')
    if (!Number.isFinite(Date.parse(expected))) throw new PlatformInputError('Recarga la empresa antes de guardar.')
    return { rpc: 'platform_update_company', args: {
      p_id: uuid(body.id), p_name: text(body.name, 160, 'Nombre'), p_status: choice(body.status, COMPANY_STATUSES),
      p_expected_updated_at: expected, p_reason: reason,
    } }
  }
  if (body.action === 'update-user') {
    const expected = object(body.expected)
    if (typeof body.is_active !== 'boolean' || typeof expected.is_active !== 'boolean') throw new PlatformInputError('Estado de acceso inválido.')
    return { rpc: 'platform_update_user_access', args: {
      p_id: uuid(body.id), p_role: choice(body.rol, [...INTERNAL_ROLES, 'Cliente']),
      p_status: choice(body.status, ACCESS_STATUSES), p_is_active: body.is_active, p_reason: reason,
      p_expected: { rol: choice(expected.rol, [...INTERNAL_ROLES, 'Cliente']), status: choice(expected.status, ACCESS_STATUSES),
        is_active: expected.is_active, tenant_id: uuid(expected.tenant_id) },
    } }
  }
  throw new PlatformInputError('Acción desconocida.')
}

export type PlatformCompany = {
  id: string; name: string; slug: string; status: string; created_at: string; updated_at: string
  users_count: number; admins_count: number
  domains: { hostname: string; is_active: boolean; is_primary: boolean }[]
}
export type PlatformUser = {
  id: string; nombre: string | null; apellido: string | null; email: string | null; rol: string
  status: string; is_active: boolean; is_platform_admin: boolean; tenant_id: string | null
  company_name: string | null; cliente_id: string | null; last_sign_in_at: string | null
}
export type PlatformEvent = {
  id: string; action: string; entity_name: string; company_name: string | null
  actor_name: string; reason: string; created_at: string
}
export type PlatformData = {
  summary?: { companies: number; active_companies: number; suspended_companies: number; users: number; pending_users: number; open_tickets: number }
  companies?: PlatformCompany[]; users?: PlatformUser[]; activity?: PlatformEvent[]
  total: number; page: number; page_size: number
}
