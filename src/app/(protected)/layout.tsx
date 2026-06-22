import { redirect } from 'next/navigation'
import { ProtectedShell } from '@/src/components/layout/protected-shell'
import { UserProvider } from '@/src/hooks/useUser'
import { createClient } from '@/src/lib/supabase/server'
import type { Profile } from '@/src/types'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

  if (profile.rol === 'Cliente') redirect('/portal')

  return (
    <UserProvider initialUser={user} initialProfile={profile}>
      <ProtectedShell>{children}</ProtectedShell>
    </UserProvider>
  )
}
