'use client'

import { createContext, useContext } from 'react'

/**
 * Integraciones habilitadas para el tenant actual. Se calculan en el servidor
 * (src/app/layout.tsx) con variables que no se exponen al navegador.
 */
export type TenantFeatures = { whatsappIntake: boolean }

const TenantFeaturesContext = createContext<TenantFeatures>({ whatsappIntake: false })

export function TenantFeaturesProvider({ features, children }: { features: TenantFeatures; children: React.ReactNode }) {
  return <TenantFeaturesContext.Provider value={features}>{children}</TenantFeaturesContext.Provider>
}

export function useTenantFeatures() {
  return useContext(TenantFeaturesContext)
}
