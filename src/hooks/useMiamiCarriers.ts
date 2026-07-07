'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'

// Fallback mientras carga el catálogo o si la tabla aún no existe en el ambiente.
export const DEFAULT_MIAMI_CARRIERS = [
  'UPS', 'FedEx', 'DHL', 'USPS', 'Amazon Logistics', 'OnTrac', 'LaserShip', 'Otro',
]

// Alfabético con "Otro" siempre al final.
const sortCarriers = (names: string[]) =>
  [...names].sort((a, b) => {
    if (a === 'Otro') return 1
    if (b === 'Otro') return -1
    return a.localeCompare(b, 'es')
  })

export function useMiamiCarriers() {
  const [carriers, setCarriers] = useState<string[]>(DEFAULT_MIAMI_CARRIERS)

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('miami_carriers')
      .select('name')
      .eq('is_active', true)
    if (error || !data?.length) return
    setCarriers(sortCarriers(data.map((c) => c.name as string)))
  }, [])

  useEffect(() => { reload() }, [reload])

  return { carriers, reload }
}
