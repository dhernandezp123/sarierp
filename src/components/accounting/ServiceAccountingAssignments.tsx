'use client'
import { useEffect, useRef, useState } from 'react'
import { Link2, Pencil, Search } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useServiceAccounting } from '@/src/hooks/useServiceAccounting'
import { useInvoiceMaster } from '@/src/hooks/useInvoiceMaster'
import { supabase } from '@/src/lib/supabase/client'
import type { AccountingAccount } from '@/src/lib/accounting'
import { eligibleServiceAccount, serviceAssignmentCounts, serviceAssignmentStatus, serviceTaxLabels, type ServiceAccountingVariant, type ServiceConcept, type ServiceSourceKind, type ServiceTaxVariant } from '@/src/lib/service-accounting'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type Editor = { concept: ServiceConcept; revision: number; variants: ServiceAccountingVariant[] }
export function ServiceAccountingAssignments({ accounts }: { accounts: AccountingAccount[] }) {
  const { data, loading, error, reload, identity } = useServiceAccounting(), { isMaster } = useInvoiceMaster()
  const [kind, setKind] = useState<ServiceSourceKind>('service'), [query, setQuery] = useState(''), [pendingOnly, setPendingOnly] = useState(true)
  const [editor, setEditor] = useState<Editor | null>(null)
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const rows = (data?.concepts || []).filter(c => c.kind === kind).map(concept => {
    const profile = data?.profiles.find(p => p.source_kind === concept.kind && p.source_code === concept.code)
    const variants = data?.variants.filter(v => v.profile_id === profile?.id) || []
    return { concept, revision: profile?.revision || 0, variants, status: serviceAssignmentStatus(variants, accounts) }
  })
  const counts = serviceAssignmentCounts(rows, accounts)
  const filtered = rows.filter(r => (!pendingOnly || r.status.pending) && normalize(`${r.concept.code} ${r.concept.label}`).includes(normalize(query)))
  return <section className={`${cardClass} space-y-5`} aria-label="Asignaciones contables de servicios">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-80"><h2 className="flex items-center gap-2 text-base font-bold"><Link2 className="h-5 w-5 text-orange-600" aria-hidden="true" />Cuentas por servicio</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-500">Vincula cada concepto con sus auxiliares de ingreso y costo/gasto. Las variantes gravada (I), exenta (E) y exonerada se configuran individualmente.</p></div>
      <Link href="/accounting/accounts" className={secondaryButtonClass}>Catálogo de cuentas</Link></div>
    {loading && <p role="status">Cargando asignaciones…</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error} <button type="button" className="underline" onClick={reload}>Reintentar</button></p>}
    {data && <><div className="flex flex-wrap gap-2" aria-label="Tipo de concepto">{([['service','Servicios y cargos'],['product','Familias operativas']] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={()=>{setKind(value);setQuery('')}} className={`${kind === value ? primaryButtonClass : secondaryButtonClass} text-sm`}>{label}</button>)}</div>
    {kind === 'product' && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">Las familias aplican únicamente a líneas de flete de su producto. Los cargos adicionales mantienen su propia asignación.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de asignaciones">{[
      ['Conceptos pendientes',`${counts.pending} de ${counts.total}`],['Sin cuenta de ingreso',counts.income],['Sin cuenta de costo/gasto',counts.expense],['Clasificación pendiente',counts.classification],
    ].map(([label,value])=><div key={label} className="rounded-xl border border-orange-100 bg-orange-50/50 p-4 dark:border-orange-900/50 dark:bg-orange-950/10"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}</div>
    <p className="text-xs text-slate-500">Cada concepto cuenta una sola vez en pendientes; los otros indicadores pueden coincidir. Define solo las variantes y cuentas que apliquen. No se activa la contabilidad ni se modifican documentos anteriores.</p>
    <div className="flex flex-wrap items-center gap-3"><label className="relative w-full max-w-md"><span className="sr-only">Buscar servicio por código o nombre</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" /><input type="search" className={`${fieldClass} pl-9`} placeholder="Buscar código o nombre del servicio…" value={query} onChange={e=>setQuery(e.target.value)} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pendingOnly} onChange={e=>setPendingOnly(e.target.checked)} />Solo pendientes</label></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800"><tr><th className="p-3">Concepto</th><th className="p-3">Variante / ingreso</th><th className="p-3">Costo / gasto</th><th className="p-3">Estado</th><th className="p-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{filtered.map(row=><tr key={row.concept.code} className="border-t border-slate-100 align-top dark:border-slate-800"><td className="max-w-xs p-3"><p className="font-medium">{row.concept.label}</p><p className="mt-1 break-all text-xs text-slate-400">{row.concept.code}</p></td>
      <td className="p-3">{row.variants.length ? row.variants.map(v=><p key={v.tax_variant} className="mb-1 text-xs"><strong>{v.tax_variant}</strong> · {accountLabel(v.income_applicable,v.income_account_id,accounts)}</p>) : <span className="text-xs text-amber-700 dark:text-amber-300">Clasificación pendiente</span>}</td>
      <td className="p-3">{row.variants.length ? row.variants.map(v=><p key={v.tax_variant} className="mb-1 text-xs"><strong>{v.tax_variant}</strong> · {accountLabel(v.expense_applicable,v.expense_account_id,accounts)}</p>) : <span className="text-xs text-slate-400">Por definir</span>}</td>
      <td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs ${row.status.pending ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>{row.status.pending ? 'Pendiente' : 'Configurado'}</span></td>
      <td className="p-3">{isMaster && <button type="button" className="rounded-lg p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950" aria-label={`Configurar ${row.concept.label}`} title="Configurar cuentas" onClick={()=>setEditor({concept:row.concept,revision:row.revision,variants:row.variants.map(v=>({...v}))})}><Pencil className="h-4 w-4" aria-hidden="true" /></button>}</td></tr>)}</tbody></table>{!filtered.length && <p className="p-6 text-center text-sm text-slate-500">No hay conceptos con estos filtros.</p>}</div>
    {!isMaster && <p className="text-xs text-slate-500">Solo el usuario máster de Contabilidad puede modificar estas asignaciones.</p>}</>}
    {editor && <AssignmentEditor key={`${identity}:${editor.concept.kind}:${editor.concept.code}`} editor={editor} accounts={accounts} identity={identity} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);reload()}} />}
  </section>
}
function accountLabel(applicable: boolean, id: string | null, accounts: AccountingAccount[]) {
  if(!applicable)return 'No aplica'
  const account = accounts.find(a=>a.id===id)
  return account ? `${account.code} · ${account.name}${!account.active || !account.postable ? ' (revisar)' : ''}` : 'Por asignar'
}
function AssignmentEditor({ editor, accounts, identity, onClose, onSaved }: { editor:Editor;accounts:AccountingAccount[];identity:string;onClose:()=>void;onSaved:()=>void }) {
  const [variants,setVariants] = useState(editor.variants), [reason,setReason] = useState(''), [busy,setBusy] = useState(false)
  const active = useRef(true), lock = useRef(false)
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[identity])
  function update(tax:ServiceTaxVariant, patch:Partial<ServiceAccountingVariant>) { setVariants(rows=>rows.map(v=>v.tax_variant===tax?{...v,...patch}:v)) }
  async function save() {
    if(lock.current || !reason.trim())return
    lock.current=true;setBusy(true)
    try {
      const {error}=await supabase.rpc('save_service_accounting',{p_source_kind:editor.concept.kind,p_source_code:editor.concept.code,p_revision:editor.revision,p_variants:variants.map(({tax_variant,income_applicable,expense_applicable,income_account_id,expense_account_id})=>({tax_variant,income_applicable,expense_applicable,income_account_id,expense_account_id})),p_reason:reason.trim()})
      if(error)throw error
      if(active.current){toast.success('Asignaciones guardadas con registro del cambio.');onSaved()}
    }catch(e){if(active.current)toast.error((e as {message?:string}).message||'No se pudieron guardar las asignaciones.')}
    finally{lock.current=false;if(active.current)setBusy(false)}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose()}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={!busy}><DialogTitle>Cuentas de {editor.concept.label}</DialogTitle><DialogDescription>Selecciona las variantes que utiliza este concepto. Puedes guardar cuentas pendientes para completarlas después.</DialogDescription>
    <form className="space-y-4" onSubmit={e=>{e.preventDefault();void save()}}><fieldset disabled={busy} className="space-y-4"><legend className="sr-only">Variantes fiscales</legend>
      <div className="flex flex-wrap gap-4">{(Object.keys(serviceTaxLabels) as ServiceTaxVariant[]).map(tax=><label key={tax} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={variants.some(v=>v.tax_variant===tax)} onChange={e=>setVariants(rows=>e.target.checked?[...rows,{tax_variant:tax,income_applicable:true,expense_applicable:true,income_account_id:null,expense_account_id:null}]:rows.filter(v=>v.tax_variant!==tax))} />{serviceTaxLabels[tax]}</label>)}</div>
      {!variants.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Clasificación pendiente. No se asumirá que este concepto es gravado o exento.</p>}
      {variants.map(v=><div key={v.tax_variant} className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="font-semibold">{serviceTaxLabels[v.tax_variant]}</h3><div className="grid gap-4 sm:grid-cols-2">{(['income','expense'] as const).map(side=>{
        const applicable = v[`${side}_applicable`], id = v[`${side}_account_id`], label = side==='income'?'Ingreso':'Costo / gasto'
        return <div key={side} className="min-w-0 space-y-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={applicable} onChange={e=>update(v.tax_variant,{[`${side}_applicable`]:e.target.checked,...(!e.target.checked?{[`${side}_account_id`]:null}:{})})} />{label} aplicable</label><CompactSelect aria-label={`${label} ${v.tax_variant}`} disabled={busy||!applicable} searchable value={id||''} onValueChange={value=>update(v.tax_variant,{[`${side}_account_id`]:value||null})} options={[{value:'',label:applicable?'Pendiente de asignar':'No aplica'},...accounts.filter(a=>eligibleServiceAccount(a,side)).map(a=>({value:a.id,label:`${a.code} · ${a.name}`,description:a.kind}))]} /></div>
      })}</div></div>)}
      <label className="block space-y-1 text-sm"><span>Motivo del cambio</span><textarea className={fieldClass} rows={2} maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Indica la configuración o revisión realizada…" /></label>
    </fieldset><div className="flex flex-wrap justify-end gap-2"><button type="button" className={secondaryButtonClass} disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className={primaryButtonClass} disabled={busy||!reason.trim()}>{busy?'Guardando…':'Guardar asignaciones'}</button></div></form>
  </DialogContent></Dialog>
}
