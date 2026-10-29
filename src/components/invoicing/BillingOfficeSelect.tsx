'use client'

import { useEffect, useId, useState } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { fieldClass, fieldLabelClass, fieldStackClass } from '@/src/lib/ui-classes'

// La etiqueta la decide cada formulario (Compras: oficina emisora; clientes: de facturación).
export function BillingOfficeSelect({ value, onChange, disabled = false, label = 'Oficina de facturación', required = false }: {
  value: string; onChange: (id: string) => void; disabled?: boolean; label?: string; required?: boolean
}) {
  const { profile } = useUser()
  const identity = `${profile?.id}:${profile?.tenant_id}`
  const id = useId()
  const [state, setState] = useState<{ identity: string; rows: {id: string; name: string; is_active: boolean}[]; error: string; loading: boolean }>({ identity: '', rows: [], error: '', loading: true })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabase.from('billing_offices').select('id,name,is_active').order('name')
        if (active) setState({ identity, rows: data || [], error: error ? 'No se pudieron cargar las oficinas.' : '', loading: false })
      } catch { if (active) setState({ identity, rows: [], error: 'No se pudieron cargar las oficinas.', loading: false }) }
    })()
    return () => { active = false }
  }, [identity, retry])
  const current = state.identity === identity ? state : { rows: [], error: '', loading: true }
  return <div className={fieldStackClass}>
    <label htmlFor={id} className={fieldLabelClass}>{label}{required && <span className="text-red-400"> *</span>}</label>
    <select id={id} required={required} value={value} disabled={disabled || current.loading || !!current.error} onChange={event => onChange(event.target.value)} className={fieldClass}>
      <option value="">{current.loading ? 'Cargando oficinas…' : 'Sin asignar — requiere asignación antes de facturar'}</option>
      {current.rows.filter(row => row.is_active || row.id === value).map(row => <option key={row.id} value={row.id} disabled={!row.is_active}>{row.name}{!row.is_active ? ' (inactiva)' : ''}</option>)}
    </select>
    {current.error && <p role="alert" className="text-sm text-red-600">{current.error} <button type="button" onClick={() => setRetry(n => n + 1)}>Reintentar</button></p>}
  </div>
}
