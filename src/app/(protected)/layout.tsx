import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { ProtectedShell } from '@/src/components/layout/protected-shell'
import { UserProvider } from '@/src/hooks/useUser'
import { createClient } from '@/src/lib/supabase/server'
import { profileMatchesAccessContext, readTenantHeaders } from '@/src/lib/tenant-context'
import type { Profile } from '@/src/types'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = readTenantHeaders(await headers())

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const profile = (data as Profile | null) ?? null

  if (!profile || profile.status !== 'Aprobado' || !profile.is_active) {
    redirect('/login')
  }

  if (!profileMatchesAccessContext(profile, tenant)) {
    redirect('/login?error=tenant_mismatch')
  }

  if (profile.rol === 'Cliente') redirect('/portal')

  return (
    <UserProvider initialUser={user} initialProfile={profile}>
      <ProtectedShell>{children}</ProtectedShell>
    </UserProvider>
  )
}
