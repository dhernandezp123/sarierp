import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isPlatformConsolePath } from '@/src/lib/platform-admin'
import {
  clearTenantHeaders,
  isPlatformSupportPath,
  tenantContextFromRow,
  writeTenantHeaders,
  type TenantPublicContextRow,
} from '@/src/lib/tenant-context'
import {
  getTenantEntryRedirectUrl,
  getTenantPlatformRedirectUrl,
  isLegalDocumentPath,
  isPlatformLegalDocumentPath,
  resolveTenantHost,
} from '@/src/lib/tenant-host'

const PUBLIC_ROUTES = new Set([
  '/',
  '/opengraph-image',
  '/robots.txt',
  '/sitemap.xml',
  '/init',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/register',
  '/onboarding',
  '/politicas',
  '/terminos-logisticos',
  '/portal/login',
  '/portal/register',
  '/portal/forgot-password',
  '/portal/reset-password',
  '/auth/callback',
])

const PLATFORM_ROUTES = new Set([
  '/',
  '/opengraph-image',
  '/robots.txt',
  '/sitemap.xml',
  '/init',
  '/login',
  '/politicas',
])

function tenantErrorResponse(request: NextRequest, unavailable = false) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: unavailable ? 'No se pudo validar la empresa' : 'Empresa no encontrada' },
      { status: unavailable ? 503 : 404 },
    )
  }

  const status = unavailable ? 503 : 404
  const title = unavailable ? 'No pudimos validar la empresa' : 'Empresa no encontrada'
  const detail = unavailable
    ? 'Intenta nuevamente en unos minutos.'
    : 'Revisa el enlace de acceso proporcionado por tu empresa.'

  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Forwarders ERP</title></head><body style="margin:0;font-family:system-ui;background:#07111f;color:#fff;display:grid;min-height:100vh;place-items:center"><main style="max-width:36rem;padding:2rem;text-align:center"><p style="color:#ef8e01;font-weight:700">Forwarders ERP</p><h1>${title}</h1><p style="color:#aeb8cc">${detail}</p></main></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  )
}

export async function proxy(req: NextRequest) {
  return demoHeaders(await sandboxProxy(req))
}

async function sandboxProxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers)
  clearTenantHeaders(requestHeaders)
  const pathname = req.nextUrl.pathname

  // This branch is a sandbox, including immutable Vercel Preview aliases.
  if (['/init','/register','/onboarding','/forgot-password','/reset-password','/portal/register','/portal/forgot-password','/portal/reset-password'].includes(pathname)) {
    const login = new URL(pathname.startsWith('/portal') ? '/portal/login' : '/login', req.url)
    return demoHeaders(NextResponse.redirect(login))
  }
  const asset = pathname === '/_next/image' ? req.nextUrl.searchParams.get('url') : pathname
  if (asset === '/login-bg.png' || asset === '/logo/sari-logo.png') return demoHeaders(new NextResponse(null,{status:404}))

  const localTenantHostname = process.env.LOCAL_TENANT_HOSTNAME
    || (process.env.NODE_ENV === 'production' ? null : 'sari.forwarders.app')
  const requestHost = req.headers.get('host')?.split(':')[0]
  const demoHost = requestHost === 'demo.forwarders.app' || requestHost?.endsWith('.vercel.app') || requestHost === 'localhost' || requestHost === '127.0.0.1'
  const hostResolution = resolveTenantHost(demoHost ? 'demo.forwarders.app' : req.headers.get('host'), {
    localTenantHostname,
  })

  if (hostResolution.kind === 'invalid') return tenantErrorResponse(req)

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          requestHeaders.set('cookie', req.cookies.toString())
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const isLegalDocument = isLegalDocumentPath(pathname)

  if (hostResolution.kind === 'platform') {
    if (
      !PLATFORM_ROUTES.has(pathname)
      && !isPlatformConsolePath(pathname)
      && !isPlatformSupportPath(pathname)
      && !isPlatformLegalDocumentPath(pathname)
      && !pathname.startsWith('/api/')
    ) {
      return tenantErrorResponse(req)
    }
  } else {
    if (pathname === '/platform' || pathname.startsWith('/platform/') || pathname === '/api/platform' || pathname.startsWith('/api/platform/')) {
      return tenantErrorResponse(req)
    }
    const { data, error } = await supabase
      .rpc('resolve_tenant_public_context', {
        p_hostname: hostResolution.lookupHostname,
      })
      .maybeSingle()

    if (error) return tenantErrorResponse(req, true)

    const tenant = tenantContextFromRow(
      data as TenantPublicContextRow,
      hostResolution.requestHostname,
    )
    if (!tenant || (hostResolution.slug && tenant.slug !== hostResolution.slug)) {
      return tenantErrorResponse(req)
    }

    const tenantEntryRedirectUrl = getTenantEntryRedirectUrl(
      req.nextUrl.toString(),
    )
    if (tenantEntryRedirectUrl) {
      return NextResponse.redirect(tenantEntryRedirectUrl, 308)
    }

    const platformRedirectUrl = getTenantPlatformRedirectUrl(
      req.nextUrl.toString(),
      hostResolution.isLocalAlias,
    )
    if (platformRedirectUrl) {
      return NextResponse.redirect(platformRedirectUrl, 308)
    }

    writeTenantHeaders(requestHeaders, tenant)
    response = NextResponse.next({ request: { headers: requestHeaders } })
  }

  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims?.sub)
  const isPublicRoute = PUBLIC_ROUTES.has(pathname) || isLegalDocument

  if (!isAuthenticated && !isPublicRoute && !pathname.startsWith('/api/')) {
    const loginPath = pathname.startsWith('/portal') ? '/portal/login' : '/login'
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = loginPath
    loginUrl.search = ''

    const returnTo = `${pathname}${req.nextUrl.search}`
    loginUrl.searchParams.set('next', returnTo)

    return NextResponse.redirect(loginUrl)
  }

  return demoHeaders(response)
}

function demoHeaders(response: NextResponse) {
  response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive')
  return response
}

export const config = {
  matcher: [
    '/login-bg.png',
    '/logo/sari-logo.png',
    '/_next/image',
    '/((?!_next/static|_next/image|ocr-assets/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
