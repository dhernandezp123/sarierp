import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/src/lib/supabase/server'
import { profileMatchesTenant, readTenantHeaders } from '@/src/lib/tenant-context'

function safeNextPath(value: string | null) {
  if (value?.startsWith('/portal/')) return value
  return '/portal/reset-password'
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const nextPath = safeNextPath(request.nextUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const tenant = readTenantHeaders(await headers())
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .maybeSingle()
        : { data: null }

      if (profileMatchesTenant(profile?.tenant_id, tenant)) {
        return NextResponse.redirect(new URL(nextPath, request.url))
      }

      await supabase.auth.signOut()
    }
  }

  const errorUrl = new URL('/portal/forgot-password', request.url)
  errorUrl.searchParams.set('error', 'invalid_link')
  return NextResponse.redirect(errorUrl)
}
