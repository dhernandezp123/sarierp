import { NextResponse, type NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/src/lib/supabase/server'
import { profileMatchesTenant, readTenantHeaders } from '@/src/lib/tenant-context'
import { recoveryDestination } from '@/src/lib/password-recovery'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const nextPath = recoveryDestination(request.nextUrl.searchParams.get('next'))

  // Auth SMTP issued on the server returns an implicit recovery fragment.
  // The browser preserves it across this redirect and consumes it on the public page.
  if (!code && !request.nextUrl.searchParams.has('error') && !request.nextUrl.searchParams.has('error_code')) {
    return NextResponse.redirect(new URL('/reset-password', request.url))
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const tenant = readTenantHeaders(await headers())
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase
            .from('profiles')
            .select('tenant_id, rol')
            .eq('id', user.id)
            .maybeSingle()
        : { data: null }

      if (profileMatchesTenant(profile?.tenant_id, tenant)) {
        const destination = new URL(profile?.rol === 'Cliente' ? nextPath : '/reset-password', request.url)
        destination.searchParams.set('recovery', '1')
        destination.searchParams.set('account', user!.id)
        return NextResponse.redirect(destination)
      }

      await supabase.auth.signOut()
    }
  }

  const errorUrl = new URL('/portal/forgot-password', request.url)
  errorUrl.searchParams.set('error', 'invalid_link')
  return NextResponse.redirect(errorUrl)
}
