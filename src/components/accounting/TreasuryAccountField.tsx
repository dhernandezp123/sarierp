'use client'
import type { TreasuryAccount } from '@/src/hooks/useTreasuryAccounts'
import { fieldClass, fieldLabelClass } from '@/src/lib/ui-classes'
export function TreasuryAccountField({accounts,currency,value,onChange,error,loading}:{accounts:TreasuryAccount[];currency:string;value:string;onChange:(value:string)=>void;error:string;loading:boolean}){
 if(!accounts.length&&!error&&!loading)return null
 return <div><label className="flex min-w-0 flex-col gap-1.5 text-xs"><span className={fieldLabelClass}>Cuenta bancaria / caja</span><select aria-label="Cuenta bancaria / caja" className={fieldClass} value={accounts.some(a=>a.id===value&&a.currency===currency)?value:''} onChange={e=>onChange(e.target.value)} required disabled={loading||!!error}><option value="">{loading?'Cargando cuentas…':'Selecciona la cuenta del movimiento'}</option>{accounts.filter(a=>a.currency===currency).map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency} · {a.account_number||a.kind}</option>)}</select></label>{error&&<p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}</div>
}
