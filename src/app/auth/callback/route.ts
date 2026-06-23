import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/src/lib/supabase/server'

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
      return NextResponse.redirect(new URL(nextPath, request.url))
    }
  }

  const errorUrl = new URL('/portal/forgot-password', request.url)
  errorUrl.searchParams.set('error', 'invalid_link')
  return NextResponse.redirect(errorUrl)
}
