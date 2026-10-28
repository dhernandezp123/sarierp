'use client'
import { useEffect, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
export function useInvoiceMaster() {
  const { user, profile } = useUser()
  const context = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
  const enabled = Boolean(user && profile?.tenant_id)
  const [result, setResult] = useState<{ context: string; allowed: boolean; error: boolean } | null>(null)
  useEffect(() => {
    if (!enabled) return
    let active = true
    void supabase.rpc('is_invoice_master').then(({ data, error }) => { if (active) setResult({ context, allowed: !error && data === true, error: Boolean(error) }) }, () => { if (active) setResult({ context, allowed: false, error: true }) })
    return () => { active = false }
  }, [context, enabled])
  const current = result?.context === context ? result : null
  return { isMaster: current?.allowed === true, loading: !current, error: current?.error === true }
}
