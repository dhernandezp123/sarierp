import type { NextConfig } from 'next'

const DEMO_PROJECT_REF = 'wlssekvxpfxhwedsjhpz'
const DEMO_SUPABASE_URL = `https://${DEMO_PROJECT_REF}.supabase.co`
const DEMO_SITE_URL = 'https://demo.forwarders.app'
const REQUIRED_DEPLOYMENT_ENVIRONMENT = 'demo'

function normalizedEnvironment(name: 'APP_ENV' | 'NEXT_PUBLIC_APP_ENV') {
  const value = process.env[name]?.trim().toLowerCase()
  if (value && value !== 'production' && value !== 'demo') {
    throw new Error(`${name} solo admite "production" o "demo".`)
  }
  return value
}

function requireExactUrl(name: string, expectedOrigin: string) {
  const rawValue = process.env[name]?.trim()
  if (!rawValue) throw new Error(`Falta ${name} para compilar el ambiente demo.`)

  let parsed: URL
  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${name} no es una URL válida.`)
  }

  if (
    parsed.origin !== expectedOrigin
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
    || parsed.username
    || parsed.password
  ) {
    throw new Error(`${name} debe ser exactamente ${expectedOrigin} en el ambiente demo.`)
  }
}

function decodeJwtPayload(value: string) {
  const parts = value.split('.')
  if (parts.length !== 3) return null

  try {
    return JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    ) as { ref?: unknown; role?: unknown }
  } catch {
    return null
  }
}

function requireDemoProjectKey(
  name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY',
  expectedRole: 'anon' | 'service_role',
  modernPrefix: 'sb_publishable_' | 'sb_secret_'
) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} para compilar el ambiente demo.`)

  if (value.startsWith(modernPrefix)) return

  const payload = decodeJwtPayload(value)
  if (payload?.role !== expectedRole || payload.ref !== DEMO_PROJECT_REF) {
    throw new Error(
      `${name} no pertenece al proyecto staging ${DEMO_PROJECT_REF}.`
    )
  }
}

function assertEnvironmentConfiguration() {
  const serverEnvironment = normalizedEnvironment('APP_ENV')
  const publicEnvironment = normalizedEnvironment('NEXT_PUBLIC_APP_ENV')
  const demoRequested =
    REQUIRED_DEPLOYMENT_ENVIRONMENT === 'demo'
    || serverEnvironment === 'demo'
    || publicEnvironment === 'demo'

  if (!demoRequested) return

  if (serverEnvironment !== 'demo' || publicEnvironment !== 'demo') {
    throw new Error(
      'APP_ENV y NEXT_PUBLIC_APP_ENV deben estar configuradas ambas como "demo".'
    )
  }

  requireExactUrl('NEXT_PUBLIC_SUPABASE_URL', DEMO_SUPABASE_URL)
  requireExactUrl('NEXT_PUBLIC_SITE_URL', DEMO_SITE_URL)
  requireDemoProjectKey('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon', 'sb_publishable_')
  requireDemoProjectKey('SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'sb_secret_')
}

assertEnvironmentConfiguration()

const nextConfig: NextConfig = {
  /* config options here */
}

export default nextConfig
