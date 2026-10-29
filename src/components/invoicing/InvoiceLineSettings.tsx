'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { useServiceAccounting } from '@/src/hooks/useServiceAccounting'
import { readAllReportRows } from '@/src/lib/report-query'
import type { AccountingAccount } from '@/src/lib/accounting'
import { eligibleServiceAccount, pricingServiceReference, serviceTaxLabels, type ServiceConcept, type ServiceAccountingProfile, type ServiceAccountingVariant, type ServiceTaxVariant, type ServiceSourceKind } from '@/src/lib/service-accounting'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { fieldLabelClass, fieldStackClass } from '@/src/lib/ui-classes'

type Reference = { kind:ServiceSourceKind;code:string }
type Source = { rateCode?:string|null;itemType?:string|null;product?:string|null }
export type ServiceChoice = ServiceConcept & { tax_variant?:ServiceTaxVariant }
const CatalogContext = createContext<{ concepts:ServiceConcept[];profiles:ServiceAccountingProfile[];variants:ServiceAccountingVariant[];accounts:AccountingAccount[] }>({concepts:[],profiles:[],variants:[],accounts:[]})
export function InvoiceLineSettingsProvider({children}:{children:ReactNode}) {
  const {user,profile} = useUser(), identity = `${user?.id}:${profile?.tenant_id}`
  const catalog = useServiceAccounting()
  const [state,setState] = useState<{identity:string;accounts:AccountingAccount[];error:string}|null>(null), [revision,setRevision] = useState(0)
  useEffect(()=>{let current=true
    void readAllReportRows<AccountingAccount>((a,b)=>supabase.from('accounting_accounts').select('id,code,name,kind,active,postable,account_level,parent_id').eq('active',true).eq('postable',true).in('kind',['Ingreso','Costo','Gasto']).order('code').order('id').range(a,b),{label:'cuentas de servicios',isCurrent:()=>current})
      .then(accounts=>{if(current)setState({identity,accounts,error:''})}).catch(()=>{if(current)setState({identity,accounts:[],error:'No se pudieron cargar las cuentas de servicios.'})})
    return()=>{current=false}
  },[identity,revision])
  const accounts = state?.identity===identity ? state.accounts : []
  const error = catalog.error || (state?.identity===identity ? state.error : '')
  return <CatalogContext.Provider value={{concepts:catalog.data?.concepts||[],profiles:catalog.data?.profiles||[],variants:catalog.data?.variants||[],accounts}}>{error&&<p role="alert" className="text-sm text-red-600">{error} <button type="button" onClick={()=>{catalog.reload();setRevision(n=>n+1)}}>Reintentar</button></p>}{children}</CatalogContext.Provider>
}
export function ServiceCatalogSelect({reference,variant,side='income',disabled=false,onSelect,onClear}:{reference?:Reference;variant:ServiceTaxVariant;side?:'income'|'expense';disabled?:boolean;onSelect:(service:ServiceChoice)=>void;onClear?:()=>void}) {
  const {concepts,profiles,variants} = useContext(CatalogContext)
  const choices:ServiceChoice[] = concepts.flatMap(concept=>{
    const profile = profiles.find(p=>p.source_kind===concept.kind&&p.source_code===concept.code)
    const rows = variants.filter(v=>v.profile_id===profile?.id)
    return rows.length ? rows.filter(v=>v[`${side}_applicable`]).map(v=>({...concept,tax_variant:v.tax_variant})) : [concept]
  })
  const key = (choice:ServiceChoice)=>JSON.stringify([choice.kind,choice.code,choice.tax_variant||''])
  const selected = choices.find(c=>c.kind===reference?.kind&&c.code===reference.code&&(c.tax_variant===variant||!c.tax_variant))
  return <CompactSelect aria-label="Servicio de catálogo" searchable disabled={disabled} value={selected?key(selected):''} onValueChange={value=>{if(!value){onClear?.();return}const choice=choices.find(c=>key(c)===value);if(choice)onSelect(choice)}} options={[{value:'',label:'Captura manual / seleccionar servicio'},...choices.map(c=>({value:key(c),label:`${c.label}${c.tax_variant?` · ${serviceTaxLabels[c.tax_variant]}`:''}`,description:`${c.code} · ${c.kind==='product'?'Familia de flete':'Servicio'}${!c.tax_variant?' · Clasificación pendiente':''}`}))]} />
}
export function ServiceLineAccountSelect({accountId,onAccount,reference,variant,side='income',manualAccounts,disabled=false}:{accountId:string;onAccount:(id:string)=>void;reference?:Reference;variant:ServiceTaxVariant;side?:'income'|'expense';manualAccounts?:AccountingAccount[];disabled?:boolean}) {
  const catalog = useContext(CatalogContext)
  const profile = catalog.profiles.find(p=>p.source_kind===reference?.kind&&p.source_code===reference.code)
  const mapping = catalog.variants.find(v=>v.profile_id===profile?.id&&v.tax_variant===variant)
  const mappedId = mapping?.[`${side}_account_id`]
  const account = catalog.accounts.find(a=>a.id===mappedId)
  const valid = eligibleServiceAccount(account,side)
  const accounts = (manualAccounts||catalog.accounts).filter(a=>a.active&&a.postable&&(side==='income'?a.kind==='Ingreso':['Activo','Costo','Gasto'].includes(a.kind)))
  const label = valid&&account ? `Configurada: ${account.code} · ${account.name}` : side==='income'?'Predeterminada de Contabilidad':'Seleccionar cuenta'
  return <div className="min-w-0 space-y-1"><CompactSelect aria-label={side==='income'?'Cuenta de ingreso':'Cuenta de costo / gasto / activo'} searchable disabled={disabled} value={accountId} onValueChange={onAccount} options={[{value:'',label},...accounts.map(a=>({value:a.id,label:`${a.code} · ${a.name}`,description:a.kind}))]} />
    {reference&&<p className={`text-xs ${valid?'text-slate-500':'text-amber-700 dark:text-amber-300'}`}>{reference.code} · {serviceTaxLabels[variant]} · {accountId?'Cuenta seleccionada manualmente.':valid?'Se guardará la cuenta configurada al emitir.':'Asignación pendiente: revisa Configuración o selecciona una cuenta manual.'}</p>}
  </div>
}
export function InvoiceLineSettings({accountId,onAccount,onService,onClearService,reference,source,variant='E',disabled=false,readonlyService=false}:{accountId:string;onAccount:(id:string)=>void;onService:(s:ServiceChoice)=>void;onClearService?:()=>void;reference?:Reference;source?:Source;variant?:ServiceTaxVariant;disabled?:boolean;readonlyService?:boolean}) {
  const {concepts} = useContext(CatalogContext)
  const ref = reference || (source?pricingServiceReference(source.rateCode,source.itemType,source.product,concepts):undefined)
  return <div className="col-span-full grid gap-2 pb-3 sm:grid-cols-2">{!readonlyService&&<div className={fieldStackClass}><p className={fieldLabelClass}>Servicio de catálogo (opcional)</p><ServiceCatalogSelect reference={ref} variant={variant} disabled={disabled} onSelect={onService} onClear={onClearService}/></div>}
    <div className={fieldStackClass}><p className={fieldLabelClass}>Cuenta de ingreso</p><ServiceLineAccountSelect accountId={accountId} onAccount={onAccount} reference={ref} variant={variant} disabled={disabled}/></div></div>
}
