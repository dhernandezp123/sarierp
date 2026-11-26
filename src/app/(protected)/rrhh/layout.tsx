'use client'
import { Fragment, type ReactNode } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { canUseHrSelfService } from '@/src/lib/hr'

/** El cambio de identidad o permisos desmonta también formularios y modales privados. */
export default function HrLayout({ children }: { children: ReactNode }) {
 const { user, profile, loading } = useUser()
 if (loading || !user || !canUseHrSelfService(profile)) return null
 const scope = `${user.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
 return <Fragment key={scope}>{children}</Fragment>
}
