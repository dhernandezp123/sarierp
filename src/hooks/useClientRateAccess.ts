'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

export function useClientRateAccess(clienteId: string) {
  const { profile } = useUser()
  const context = `${profile?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${clienteId}`
  const enabled = Boolean(profile?.id && profile.tenant_id && profile.status === 'Aprobado' && profile.is_active && clienteId)
  const [result, setResult] = useState<{ context: string; allowed: boolean } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    void supabase.rpc('can_manage_client_rates', { p_cliente_id: clienteId }).then(({ data, error }) => {
      if (active) setResult({ context, allowed: !error && data === true })
    }, () => { if (active) setResult({ context, allowed: false }) })
    return () => { active = false }
  }, [clienteId, context, enabled])
  return { hasIndividualAccess: enabled && result?.context === context && result.allowed === true }
}
