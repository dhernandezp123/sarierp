import type { Profile } from '@/src/types'

export const APP_ENVIRONMENT =
  process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase() || 'production'

export const IS_DEMO_ENVIRONMENT = APP_ENVIRONMENT === 'demo'

export const AUTH_BACKGROUND_IMAGE = IS_DEMO_ENVIRONMENT
  ? 'radial-gradient(circle at 18% 18%, rgba(37, 99, 235, 0.45), transparent 34%), radial-gradient(circle at 82% 78%, rgba(14, 165, 233, 0.22), transparent 30%), linear-gradient(135deg, #020617 0%, #0f172a 55%, #172554 100%)'
  : "url('/login-bg.png')"

export const DEMO_TERMS_VERSION = '2026-07-31-v1'

export const DEMO_NOTICE =
  'Ambiente Demo: datos ficticios y compartidos. Los cambios pueden ser modificados o reiniciados.'

export const DEMO_DOCUMENT_NOTICE =
  'DOCUMENTO SIN VALIDEZ COMERCIAL, OPERATIVA O FISCAL'

export function isDemoProfile(
  profile: Pick<Profile, 'is_demo_user'> | null | undefined
) {
  return profile?.is_demo_user === true
}

export function isDemoAccessExpired(
  profile:
    | {
        is_demo_user?: boolean | null
        demo_expires_at?: string | null
      }
    | null
    | undefined
) {
  if (!profile?.is_demo_user) return false
  if (!profile.demo_expires_at) return true

  const expiresAt = Date.parse(profile.demo_expires_at)
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now()
}

export function canManageSensitiveSettings(
  profile:
    | Pick<Profile, 'rol' | 'is_demo_user' | 'is_platform_admin'>
    | null
    | undefined
) {
  return Boolean(
    profile?.rol === 'Admin'
      && profile.is_demo_user !== true
      && !IS_DEMO_ENVIRONMENT
  )
}
