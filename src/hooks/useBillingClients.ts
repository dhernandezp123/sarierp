'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import type { ClientOption } from '@/src/lib/client-search'

export type BillingClient = ClientOption & { nombre: string }

export function useBillingClients(context: string) {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ context: string; revision: number; rows: BillingClient[]; error: string } | null>(null)
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      void readAllReportRows<BillingClient>((from, to) => supabase.from('clientes')
        .select('id,nombre,codigo_cliente,rtn').order('nombre').order('id').range(from, to),
      { label: 'clientes', isCurrent: () => active })
        .then(rows => { if (active) setResult({ context, revision, rows, error: '' }) })
        .catch(() => { if (active) setResult({ context, revision, rows: [], error: 'No se pudieron cargar los clientes. Reintenta la consulta.' }) })
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [context, revision])
  const reload = useCallback(() => setRevision(value => value + 1), [])
  const current = result?.context === context && result.revision === revision ? result : null
  return { clients: current?.rows || [], loading: !current, error: current?.error || '', reload }
}
