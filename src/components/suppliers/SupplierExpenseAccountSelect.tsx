'use client'
import type { AccountingAccount } from '@/src/lib/accounting'
import { supplierExpenseAccounts } from '@/src/lib/supplier-accounting'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
export function SupplierExpenseAccountSelect({accounts,value,onChange,disabled=false,label='Cuenta de gasto predeterminada'}:{accounts:AccountingAccount[];value:string;onChange:(id:string)=>void;disabled?:boolean;label?:string}) {
 const eligible=supplierExpenseAccounts(accounts),current=accounts.find(a=>a.id===value)
 const unavailable=value&&!eligible.some(a=>a.id===value)?[{value,label:current?current.code+' · '+current.name+' (no disponible)':'Cuenta no disponible',disabled:true}]:[]
 return <CompactSelect aria-label={label} className="w-full max-w-lg" searchable disabled={disabled} value={value} options={[{value:'',label:'Sin cuenta predeterminada'},...unavailable,...eligible.map(a=>({value:a.id,label:a.code+' · '+a.name,description:a.kind}))]} onValueChange={onChange}/>
}
