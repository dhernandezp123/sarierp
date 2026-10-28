'use client'

import { createContext, useContext } from 'react'
import type { TenantPublicContext } from '@/src/lib/tenant-context'

const TenantContext = createContext<TenantPublicContext | null>(null)

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantPublicContext | null
  children: React.ReactNode
}) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
}

export function useTenant() {
  return useContext(TenantContext)
}
