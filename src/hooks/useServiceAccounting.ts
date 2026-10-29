'use client'
import { useEffect, useState } from 'react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { readAllReportRows } from '@/src/lib/report-query'
import type { ServiceAccountingProfile, ServiceAccountingVariant, ServiceConcept } from '@/src/lib/service-accounting'

type Catalog = { concepts: ServiceConcept[]; profiles: ServiceAccountingProfile[]; variants: ServiceAccountingVariant[] }
export function useServiceAccounting() {
  const { user, profile } = useUser(), identity = `${user?.id}:${profile?.tenant_id}`
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ identity: string; data: Catalog | null; error: string } | null>(null)
  useEffect(() => {
    let current = true
    void Promise.all([
      readAllReportRows<{ code: string; label: string; taxable: boolean }>((a,b) => supabase.from('client_rate_catalog').select('code,label,taxable').eq('active',true).order('code').range(a,b), { key:'code', label:'servicios', isCurrent:()=>current }),
      readAllReportRows<{ value: string; label: string }>((a,b) => supabase.from('service_products').select('value,label').eq('active',true).order('value').range(a,b), { key:'value', label:'productos operativos', isCurrent:()=>current }),
      readAllReportRows<ServiceAccountingProfile>((a,b) => supabase.from('service_accounting_profiles').select('id,source_kind,source_code,revision').order('id').range(a,b), { label:'perfiles contables de servicios', isCurrent:()=>current }),
      readAllReportRows<ServiceAccountingVariant>((a,b) => supabase.from('service_accounting_variants').select('id,profile_id,tax_variant,income_account_id,expense_account_id,income_applicable,expense_applicable').order('id').range(a,b), { label:'asignaciones contables de servicios', isCurrent:()=>current }),
    ]).then(([services, products, profiles, variants]) => {
      if (current) setState({ identity, error:'', data:{ concepts:[...services.map(s=>({...s,kind:'service' as const})),...products.map(p=>({kind:'product' as const,code:p.value,label:p.label}))], profiles, variants } })
    }).catch(() => { if(current) setState({identity,data:null,error:'No se pudieron consultar las asignaciones contables. Reintenta la consulta.'}) })
    return () => { current = false }
  }, [identity,revision])
  const current = state?.identity === identity ? state : null
  return { identity, data:current?.data||null, error:current?.error||'', loading:!current, reload:()=>{setState(null);setRevision(r=>r+1)} }
}
