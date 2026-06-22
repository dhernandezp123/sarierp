import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// NOTE: This app uses @supabase/supabase-js directly (localStorage sessions),
// not @supabase/ssr (cookie sessions). The proxy only refreshes the
// session token on each request to keep it alive — it does NOT gate access.
// Route protection is handled client-side in src/app/(protected)/layout.tsx.
//
// To add true server-side gating, migrate supabase/client.ts to use
// createBrowserClient from @supabase/ssr (FASE 4 task).
export async function proxy(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  await supabase.auth.getSession()
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
