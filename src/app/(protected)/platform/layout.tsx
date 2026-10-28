import { notFound, redirect } from 'next/navigation'
import { authorizePlatformAdmin, PlatformAccessError } from '@/src/lib/server/platform-admin'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  try { await authorizePlatformAdmin() }
  catch (error) {
    if (error instanceof PlatformAccessError) {
      if (error.status === 401) redirect('/login?next=/platform')
      notFound()
    }
    throw error
  }
  return children
}
