import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = new Set([
  '/',
  '/init',
  '/login',
  '/register',
  '/onboarding',
  '/politicas',
  '/portal/login',
  '/portal/register',
  '/portal/forgot-password',
  '/portal/reset-password',
  '/auth/callback',
  '/robots.txt',
])

const IS_DEMO_ENVIRONMENT =
  process.env.APP_ENV === 'demo'
  || process.env.NEXT_PUBLIC_APP_ENV === 'demo'

const DEMO_BLOCKED_PUBLIC_ROUTES = new Set([
  '/init',
  '/register',
  '/onboarding',
  '/portal/register',
  '/portal/forgot-password',
  '/portal/reset-password',
])

const DEMO_PRIVATE_BRAND_ASSETS = new Set([
  '/login-bg.png',
  '/logo/sari-logo.png',
])

function applyDemoHeaders(response: NextResponse) {
  if (IS_DEMO_ENVIRONMENT) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  }
  return response
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  const optimizedImagePath = pathname === '/_next/image'
    ? req.nextUrl.searchParams.get('url')
    : null
  const optimizedImageIsPrivate = (() => {
    if (!optimizedImagePath) return false
    try {
      return DEMO_PRIVATE_BRAND_ASSETS.has(
        new URL(optimizedImagePath, req.nextUrl.origin).pathname
      )
    } catch {
      return false
    }
  })()

  if (
    IS_DEMO_ENVIRONMENT
    && (
      DEMO_PRIVATE_BRAND_ASSETS.has(pathname)
      || optimizedImageIsPrivate
    )
  ) {
    return applyDemoHeaders(new NextResponse(null, { status: 404 }))
  }

  let response = NextResponse.next({ request: req })

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
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data } = await supabase.auth.getClaims()
  const isAuthenticated = Boolean(data?.claims?.sub)
  const isPublicRoute = PUBLIC_ROUTES.has(pathname)

  if (IS_DEMO_ENVIRONMENT && pathname === '/') {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    return applyDemoHeaders(NextResponse.redirect(loginUrl))
  }

  if (IS_DEMO_ENVIRONMENT && DEMO_BLOCKED_PUBLIC_ROUTES.has(pathname)) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = pathname.startsWith('/portal') ? '/portal/login' : '/login'
    loginUrl.search = ''
    return applyDemoHeaders(NextResponse.redirect(loginUrl))
  }

  if (!isAuthenticated && !isPublicRoute) {
    const loginPath = pathname.startsWith('/portal') ? '/portal/login' : '/login'
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = loginPath
    loginUrl.search = ''
    const returnTo = `${pathname}${req.nextUrl.search}`
    loginUrl.searchParams.set('next', returnTo)

    return applyDemoHeaders(NextResponse.redirect(loginUrl))
  }

  return applyDemoHeaders(response)
}

export const config = {
  matcher: [
    '/login-bg.png',
    '/logo/sari-logo.png',
    '/_next/image',
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
