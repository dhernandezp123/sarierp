'use client'
import { useCallback, useRef, useState } from 'react'
import { Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import { readAllReportRows } from '@/src/lib/report-query'
import { formatDate, formatMoney, toDateInputValue } from '@/src/lib/format'
import { canManageHr, canUseHrSelfService, employeeFullName, type HrEmployee } from '@/src/lib/hr'
import { HR_PAY_FREQUENCIES, HR_PAYROLL_KINDS, HR_SALARY_MODES, type HrCompensation, type HrPayrollConcept, type HrPayrollRun, type HrPayslip } from '@/src/lib/hr-payroll'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { FinancePageHeader } from '@/src/components/invoicing/FinanceWorkspace'
import { FinanceNumberInput } from '@/src/components/ui/FinanceNumberInput'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/src/components/ui/dialog'
import { HrNavigation, useReturnFocus, useScopedLoad } from './HrShared'

type Account = { id: string; code: string; name: string; kind: string }
type Vacation = { id: string; employee_id: string; start_date: string; end_date: string }
type Data = { employees: HrEmployee[]; terms: HrCompensation[]; concepts: HrPayrollConcept[]; accounts: Account[]; runs: HrPayrollRun[]; slips: HrPayslip[]; vacations: Vacation[] }
const options = (values: readonly string[]) => values.map(value => ({ value, label: value }))
const accountOptions = (accounts: Account[]) => [{ value: '', label: 'Selecciona una cuenta' }, ...accounts.map(a => ({ value: a.id, label: `${a.code} · ${a.name}` }))]
export function HrPayrollPage() {
 const { user, profile, loading: userLoading } = useUser(), manager = canManageHr(profile), allowed = canUseHrSelfService(profile), tenant = profile?.tenant_id || ''
 const context = `${user?.id}:${tenant}:${profile?.rol}:${profile?.status}:${profile?.is_active}`
 const [dialog, setDialog] = useState<'terms' | 'concept' | 'run' | null>(null), [selected, setSelected] = useState<HrPayrollRun | null>(null)
 const loader = useCallback(async (): Promise<Data> => {
  const slips = await supabase.rpc('hr_payslips')
  if (slips.error) throw new Error('No se pudieron cargar los comprobantes de nómina.')
  if (!manager) return { employees: [], terms: [], concepts: [], accounts: [], runs: [], slips: slips.data as HrPayslip[], vacations: [] }
  const [employees, terms, concepts, accounts, runs, vacations] = await Promise.all([
   readAllReportRows<HrEmployee>((a,b) => supabase.from('hr_employees').select('*').eq('tenant_id',tenant).order('employee_code').order('id').range(a,b), { label: 'empleados' }),
   readAllReportRows<HrCompensation>((a,b) => supabase.from('hr_compensation').select('*').eq('tenant_id',tenant).order('effective_from',{ascending:false}).order('id').range(a,b), { label: 'condiciones salariales' }),
   readAllReportRows<HrPayrollConcept>((a,b) => supabase.from('hr_payroll_concepts').select('*').eq('tenant_id',tenant).order('code').order('id').range(a,b), { label: 'conceptos' }),
   readAllReportRows<Account>((a,b) => supabase.from('accounting_accounts').select('id,code,name,kind').eq('tenant_id',tenant).eq('active',true).eq('postable',true).neq('kind','Orden').order('code').order('id').range(a,b), { label: 'cuentas contables' }),
   readAllReportRows<HrPayrollRun>((a,b) => supabase.from('hr_payroll_runs').select('*').eq('tenant_id',tenant).order('pay_date',{ascending:false}).order('id').range(a,b), { label: 'nóminas' }),
   readAllReportRows<Vacation>((a,b) => supabase.from('hr_leave_requests').select('id,employee_id,start_date,end_date').eq('tenant_id',tenant).eq('status','Aprobada').eq('leave_type','Vacaciones').order('start_date',{ascending:false}).order('id').range(a,b), { label: 'vacaciones aprobadas' }),
  ])
  return { employees, terms, concepts, accounts, runs, slips: slips.data as HrPayslip[], vacations }
 }, [manager,tenant])
 const { data, error, loading, reload } = useScopedLoad(context,allowed && !!tenant,loader)
 const saved = () => { setDialog(null); setSelected(null); void reload() }
 if (userLoading) return null
 if (!allowed) return <div className={cardClass}>Tu usuario no tiene acceso a nómina.</div>
 return <div className="space-y-6">
  <FinancePageHeader eyebrow="Recursos Humanos" title={manager ? 'Nómina y liquidaciones' : 'Mis comprobantes'} icon={Wallet} description={manager ? 'Salarios y conceptos revisados, aprobación y registro contable. Contabilizar reconoce la obligación; el comprobante no acredita un pago bancario.' : 'Tus últimos 200 comprobantes aprobados. Un comprobante no acredita un pago bancario.'}
   actions={manager && <div className="flex flex-wrap gap-2"><button className={secondaryButtonClass} disabled={!data || loading || !!error} onClick={() => setDialog('terms')}>Condiciones salariales</button><button className={secondaryButtonClass} disabled={!data || loading || !!error} onClick={() => setDialog('concept')}>Conceptos y cuentas</button><button className={primaryButtonClass} disabled={!data || loading || !!error} onClick={() => setDialog('run')}>Preparar nómina</button></div>} />
  <HrNavigation manager={manager} />
  {error && <p role="alert" className="text-sm text-rose-600">{error} <button className="underline" onClick={() => void reload()}>Reintentar</button></p>}
  {loading ? <p className="text-sm text-slate-500">Cargando nómina…</p> : data && !error && <>
   {manager && <section className={cardClass}><FormSection title="Nóminas preparadas" description="Los borradores conservan sus datos de cálculo. Para corregirlos, anula y prepara otro. Las tasas legales y los importes variables se capturan con soporte; el sistema no presume exenciones.">
    {!data.runs.length ? <p className="text-sm text-slate-500">Sin nóminas. Configura salarios y cuentas antes de preparar la primera.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{data.runs.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{r.kind} · {formatDate(r.starts_on)} – {formatDate(r.ends_on)}</p><p>{r.status} · Neto {formatMoney(r.net,r.currency)} · Pago previsto {formatDate(r.pay_date)}</p></div><button className={secondaryButtonClass} onClick={() => setSelected(r)}>Revisar</button></li>)}</ul>}
   </FormSection></section>}
   <section className={cardClass}><FormSection title={manager ? 'Últimos 200 comprobantes' : 'Comprobantes disponibles'}>
    {!data.slips.length ? <p className="text-sm text-slate-500">Sin comprobantes disponibles.</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{data.slips.map(s => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{s.employee.name} · {s.kind}</p><p>{formatDate(s.starts_on)} – {formatDate(s.ends_on)} · {s.status} · Neto {formatMoney(s.net,s.currency)}</p></div><a className={secondaryButtonClass} href={`/api/hr/payslips/${s.id}`} target="_blank" rel="noopener noreferrer">Comprobante PDF</a></li>)}</ul>}
   </FormSection></section>
  </>}
  {data && manager && dialog && <PayrollSetupDialog key={dialog} mode={dialog} data={data} onClose={() => setDialog(null)} onSaved={saved} />}
  {manager && selected && <PayrollReview key={selected.id} run={selected} onClose={() => setSelected(null)} onSaved={saved} />}
 </div>
}

function PayrollSetupDialog({ mode, data, onClose, onSaved }: { mode: 'terms' | 'concept' | 'run'; data: Data; onClose: () => void; onSaved: () => void }) {
 const returnFocus = useReturnFocus()
 return <Dialog open onOpenChange={open => { if (!open) onClose() }}><DialogContent className="grid-cols-1 max-h-[90dvh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={returnFocus}><DialogTitle>{mode === 'terms' ? 'Condiciones salariales' : mode === 'concept' ? 'Conceptos y cuentas' : 'Preparar nómina'}</DialogTitle><DialogDescription>Acceso exclusivo de Administración. Los importes y las reglas deben corresponder a documentación revisada de la empresa.</DialogDescription>
  {mode === 'terms' ? <CompensationForm data={data} onSaved={onSaved} /> : mode === 'concept' ? <ConceptForm data={data} onSaved={onSaved} /> : <RunForm data={data} onSaved={onSaved} />}
 </DialogContent></Dialog>
}
function CompensationForm({ data, onSaved }: { data: Data; onSaved: () => void }) {
 const [form,setForm] = useState({ employee:'',effective_from:toDateInputValue(),currency:'HNL',salary_mode:'Fijo',monthly_salary:'',frequency:'Mensual',source:'' }), [busy,setBusy] = useState(false)
 const change = (key: keyof typeof form,value: string) => setForm(f => ({...f,[key]:value,...(key === 'salary_mode' && value === 'Variable' ? {monthly_salary:'0'} : {})}))
 async function save() {
  setBusy(true)
  const r = await supabase.rpc('hr_add_compensation',{p_employee:form.employee,p_terms:{...form,monthly_salary:Number(form.monthly_salary)}})
  setBusy(false);if(r.error){toast.error(r.error.message);return}toast.success('Condiciones salariales registradas');onSaved()
 }
 return <div className="space-y-4"><div className="finance-field-row grid gap-4 sm:grid-cols-2">
  <FormField label="Empleado" as="div" required><CompactSelect aria-label="Empleado" disabled={busy} value={form.employee} onValueChange={v => change('employee',v)} options={[{value:'',label:'Selecciona un empleado'},...data.employees.map(e=>({value:e.id,label:`${e.employee_code} · ${employeeFullName(e)}`}))]} /></FormField>
  <FormField label="Vigente desde" required><input type="date" className={fieldClass} disabled={busy} value={form.effective_from} onChange={e=>change('effective_from',e.target.value)} /></FormField>
  <FormField label="Moneda contractual" as="div"><CompactSelect aria-label="Moneda contractual" disabled={busy} value={form.currency} onValueChange={v=>change('currency',v)} options={options(['HNL','USD'])} /></FormField>
  <FormField label="Modalidad salarial" as="div"><CompactSelect aria-label="Modalidad salarial" disabled={busy} value={form.salary_mode} onValueChange={v=>change('salary_mode',v)} options={options(HR_SALARY_MODES)} /></FormField>
  <FormField label="Salario fijo mensual" required hint="Base contractual mensual / 30 × días pagables. Variable puro usa 0."><FinanceNumberInput numericKind="money" min={0} step="0.01" disabled={busy || form.salary_mode==='Variable'} value={form.monthly_salary} onChange={e=>change('monthly_salary',e.target.value)} /></FormField>
  <FormField label="Frecuencia" as="div"><CompactSelect aria-label="Frecuencia" disabled={busy} value={form.frequency} onValueChange={v=>change('frequency',v)} options={options(HR_PAY_FREQUENCIES)} /></FormField>
  <FormField label="Referencia y condiciones del contrato" required className="sm:col-span-2"><textarea className={fieldClass} maxLength={2000} disabled={busy} value={form.source} onChange={e=>change('source',e.target.value)} /></FormField>
 </div><ul className="max-h-40 overflow-y-auto text-xs text-slate-500">{data.terms.filter(t=>t.employee_id===form.employee).map(t=><li key={t.id}>{formatDate(t.effective_from)} · {t.salary_mode} · {formatMoney(t.monthly_salary,t.currency)} · {t.frequency} · {t.source}</li>)}</ul>
 <button className={primaryButtonClass} disabled={busy || !form.employee || !form.effective_from || form.monthly_salary==='' || form.source.trim().length<10} onClick={()=>void save()}>{busy?'Guardando…':'Registrar vigencia'}</button></div>
}
function ConceptForm({ data, onSaved }: { data: Data; onSaved: () => void }) {
 const [selected,setSelected]=useState(''),[form,setForm]=useState({code:'',name:'',kind:'Ingreso',debit_account_id:'',credit_account_id:'',active:true}),[busy,setBusy]=useState(false)
 function select(id:string){setSelected(id);const c=data.concepts.find(c=>c.id===id);setForm(c?{code:c.code,name:c.name,kind:c.kind,debit_account_id:c.debit_account_id||'',credit_account_id:c.credit_account_id||'',active:c.active}:{code:'',name:'',kind:'Ingreso',debit_account_id:'',credit_account_id:'',active:true})}
 async function save(){setBusy(true);const r=await supabase.rpc('hr_save_payroll_concept',{p_id:selected||null,p_revision:data.concepts.find(c=>c.id===selected)?.revision??null,p_concept:form});setBusy(false);if(r.error){toast.error(r.error.message);return}toast.success('Concepto guardado');onSaved()}
 return <div className="space-y-4"><FormField label="Concepto existente" as="div"><CompactSelect aria-label="Concepto existente" disabled={busy} value={selected} onValueChange={select} options={[{value:'',label:'Crear concepto'},...data.concepts.map(c=>({value:c.id,label:`${c.code} · ${c.name}${c.active?'':' (inactivo)'}`}))]} /></FormField>
 <p className="text-sm text-slate-500">Crea SALARIO_BASE como ingreso para el salario fijo. Registra por separado IHSS, RAP, ISR, anticipos, bonos, horas extra, prestaciones y aportes patronales que correspondan. Los importes se documentan en cada nómina.</p>
 <div className="grid gap-4 sm:grid-cols-2"><FormField label="Código" required><input className={fieldClass} maxLength={30} disabled={busy || !!selected} value={form.code} onChange={e=>setForm(f=>({...f,code:e.target.value.toUpperCase()}))} /></FormField><FormField label="Nombre" required><input className={fieldClass} maxLength={120} disabled={busy} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
 <FormField label="Tipo" as="div"><CompactSelect aria-label="Tipo de concepto" disabled={busy || !!selected} value={form.kind} onValueChange={kind=>setForm(f=>({...f,kind,debit_account_id:'',credit_account_id:''}))} options={options(['Ingreso','Deducción','Aporte patronal'])} /></FormField>
 {form.kind!=='Deducción' && <FormField label="Cuenta de gasto (debe)" as="div" required><CompactSelect aria-label="Cuenta de gasto" disabled={busy} value={form.debit_account_id} onValueChange={debit_account_id=>setForm(f=>({...f,debit_account_id}))} options={accountOptions(data.accounts.filter(a=>a.kind==='Gasto'))} /></FormField>}
 {form.kind!=='Ingreso' && <FormField label="Cuenta de obligación (haber)" as="div" required><CompactSelect aria-label="Cuenta de obligación" disabled={busy} value={form.credit_account_id} onValueChange={credit_account_id=>setForm(f=>({...f,credit_account_id}))} options={accountOptions(data.accounts.filter(a=>['Pasivo','Activo'].includes(a.kind)))} /></FormField>}
 </div>{selected && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} disabled={busy} onChange={e=>setForm(f=>({...f,active:e.target.checked}))} />Concepto activo</label>}
 <button className={primaryButtonClass} disabled={busy || !form.code.trim() || !form.name.trim() || (form.kind!=='Deducción' && !form.debit_account_id) || (form.kind!=='Ingreso' && !form.credit_account_id)} onClick={()=>void save()}>{busy?'Guardando…':'Guardar concepto'}</button></div>
}

type DraftPerson = { key: string; employee_id: string; paid_days: string; items: { key: string; concept_id: string; amount: string; source: string }[] }
function RunForm({ data, onSaved }: { data: Data; onSaved: () => void }) {
 const [form,setForm]=useState({kind:'Nómina',starts_on:toDateInputValue(),ends_on:toDateInputValue(),pay_date:toDateInputValue(),currency:'HNL',exchange_rate:'1',payable_account_id:'',review_source:'',leave_request_id:'',settlement_cause:'',rounding_account_id:''})
 const [people,setPeople]=useState<DraftPerson[]>([{key:crypto.randomUUID(),employee_id:'',paid_days:'',items:[]}]),[busy,setBusy]=useState(false),[attested,setAttested]=useState(false)
 const requestId=useRef(crypto.randomUUID())
 function changed(){requestId.current=crypto.randomUUID();setAttested(false)}
 function change(key:keyof typeof form,value:string){changed();setForm(f=>({...f,[key]:value,...(key==='currency' && value==='HNL'?{exchange_rate:'1'}:{})}));if(key==='kind' && value!=='Nómina')setPeople(p=>p.map(e=>({...e,paid_days:'0'})))}
 function updatePerson(index:number,patch:Partial<DraftPerson>){changed();setPeople(p=>p.map((e,i)=>i===index?{...e,...patch}:e))}
 const invalid=!form.payable_account_id || !form.starts_on || !form.ends_on || !form.pay_date || form.review_source.trim().length<20 || !attested || (form.kind==='Vacaciones' && !form.leave_request_id) || (form.kind==='Liquidación' && form.settlement_cause.trim().length<10) || people.some(p=>!p.employee_id || p.paid_days==='' || p.items.some(i=>!i.concept_id || i.amount==='' || i.source.trim().length<10))
 async function save(){if(invalid||busy)return;setBusy(true);const r=await supabase.rpc('hr_create_payroll',{p_request_id:requestId.current,p_run:{...form,review_confirmed:attested,exchange_rate:Number(form.exchange_rate)},p_employees:people.map(p=>({employee_id:p.employee_id,paid_days:Number(p.paid_days),items:p.items.map(i=>({concept_id:i.concept_id,amount:Number(i.amount),source:i.source}))}))});setBusy(false);if(r.error){toast.error(r.error.message);return}toast.success('Borrador preparado para revisión');onSaved()}
 return <div className="space-y-5"><div className="finance-field-row grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 <FormField label="Tipo" as="div"><CompactSelect aria-label="Tipo de nómina" disabled={busy} value={form.kind} onValueChange={v=>change('kind',v)} options={options(HR_PAYROLL_KINDS)} /></FormField>
 <FormField label="Desde" required><input type="date" className={fieldClass} disabled={busy} value={form.starts_on} onChange={e=>change('starts_on',e.target.value)} /></FormField><FormField label="Hasta" required><input type="date" className={fieldClass} disabled={busy} value={form.ends_on} onChange={e=>change('ends_on',e.target.value)} /></FormField>
 <FormField label="Pago previsto / fecha contable" required><input type="date" className={fieldClass} disabled={busy} value={form.pay_date} onChange={e=>change('pay_date',e.target.value)} /></FormField>
 <FormField label="Moneda" as="div"><CompactSelect aria-label="Moneda" disabled={busy} value={form.currency} onValueChange={v=>change('currency',v)} options={options(['HNL','USD'])} /></FormField>
 <FormField label="Tipo de cambio a HNL" required><FinanceNumberInput numericKind="exchange" min="0.000001" step="0.000001" disabled={busy || form.currency==='HNL'} value={form.exchange_rate} onChange={e=>change('exchange_rate',e.target.value)} /></FormField>
 <FormField label="Remuneraciones por pagar" as="div" required className="sm:col-span-2 lg:col-span-3"><CompactSelect aria-label="Remuneraciones por pagar" disabled={busy} value={form.payable_account_id} onValueChange={v=>change('payable_account_id',v)} options={accountOptions(data.accounts.filter(a=>a.kind==='Pasivo'))} /></FormField>
 </div>
 {form.currency!=='HNL' && <FormField label="Cuenta de redondeo cambiario" as="div" required hint="Solo absorbe diferencias de centavos al convertir a HNL; no modifica el neto en moneda contractual."><CompactSelect aria-label="Cuenta de redondeo cambiario" disabled={busy} value={form.rounding_account_id} onValueChange={v=>change('rounding_account_id',v)} options={accountOptions(data.accounts.filter(a=>['Gasto','Ingreso'].includes(a.kind)))} /></FormField>}
 {form.kind==='Vacaciones' && <FormField label="Vacaciones aprobadas" as="div" required hint="Selecciona una sola solicitud. Registra el pago al menos tres días antes del inicio. Su saldo se controla en Vacaciones y permisos."><CompactSelect aria-label="Vacaciones aprobadas" disabled={busy} value={form.leave_request_id} onValueChange={id=>{changed();const v=data.vacations.find(v=>v.id===id);setForm(f=>({...f,leave_request_id:id,...(v?{starts_on:v.start_date,ends_on:v.end_date}:{})}));if(v)setPeople([{key:crypto.randomUUID(),employee_id:v.employee_id,paid_days:'0',items:[]}])}} options={[{value:'',label:'Selecciona vacaciones aprobadas'},...data.vacations.map(v=>({value:v.id,label:`${data.employees.find(e=>e.id===v.employee_id)?.employee_code||'Empleado'} · ${formatDate(v.start_date)} – ${formatDate(v.end_date)}`}))]} /></FormField>}
 {form.kind==='Liquidación' && <FormField label="Causal y procedencia de prestaciones" required hint="Indica causal, tipo de contrato, preaviso/cesantía aplicables, excepciones y evidencia revisada."><textarea className={fieldClass} maxLength={2000} disabled={busy} value={form.settlement_cause} onChange={e=>change('settlement_cause',e.target.value)} /></FormField>}
 <FormSection title="Empleados y conceptos" description="Días pagables confirmados según contrato: el fijo mensual se divide entre 30. En vacaciones y liquidación se capturan solo conceptos revisados; no se añade automáticamente otro salario ni se modifica el saldo de vacaciones.">
 <div className="space-y-4">{people.map((p,index)=><div key={p.key} className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Empleado {index+1}</h3><button className={secondaryButtonClass} disabled={busy || people.length===1} onClick={()=>{changed();setPeople(p=>p.filter((_,i)=>i!==index))}}>Quitar empleado</button></div>
  <div className="finance-field-row grid gap-4 sm:grid-cols-2"><FormField label="Empleado" as="div" required><CompactSelect aria-label={`Empleado ${index+1}`} disabled={busy} value={p.employee_id} onValueChange={employee_id=>updatePerson(index,{employee_id})} options={[{value:'',label:'Selecciona'},...data.employees.filter(e=>e.id===p.employee_id || !people.some(x=>x.employee_id===e.id)).map(e=>({value:e.id,label:`${e.employee_code} · ${employeeFullName(e)}`}))]} /></FormField><FormField label="Días pagables" required><FinanceNumberInput numericKind="quantity" min={0} max={30} step="0.01" disabled={busy || form.kind!=='Nómina'} value={p.paid_days} onChange={e=>updatePerson(index,{paid_days:e.target.value})} /></FormField></div>
  {p.items.map((item,n)=><div key={item.key} className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700"><div className="flex items-center justify-between"><p className="text-sm font-medium">Concepto {n+1}</p><button className={secondaryButtonClass} disabled={busy} onClick={()=>updatePerson(index,{items:p.items.filter((_,i)=>i!==n)})}>Quitar</button></div>
  <div className="finance-field-row grid gap-3 sm:grid-cols-2"><FormField label="Concepto" as="div" required><CompactSelect aria-label={`Concepto ${index+1}-${n+1}`} disabled={busy} value={item.concept_id} onValueChange={v=>updatePerson(index,{items:p.items.map((x,i)=>i===n?{...x,concept_id:v}:x)})} options={[{value:'',label:'Selecciona'},...data.concepts.filter(c=>c.active && c.code!=='SALARIO_BASE').map(c=>({value:c.id,label:`${c.name} · ${c.kind}`}))]} /></FormField><FormField label="Importe revisado" required><FinanceNumberInput numericKind="money" min={0} step="0.01" disabled={busy} value={item.amount} onChange={e=>updatePerson(index,{items:p.items.map((x,i)=>i===n?{...x,amount:e.target.value}:x)})} /></FormField><FormField label="Soporte y cálculo" required className="sm:col-span-2"><textarea className={fieldClass} disabled={busy} maxLength={2000} value={item.source} onChange={e=>updatePerson(index,{items:p.items.map((x,i)=>i===n?{...x,source:e.target.value}:x)})} /></FormField></div></div>)}
  <button className={secondaryButtonClass} disabled={busy || p.items.length>=50} onClick={()=>updatePerson(index,{items:[...p.items,{key:crypto.randomUUID(),concept_id:'',amount:'',source:''}]})}>Agregar concepto</button>
 </div>)}</div><button className={`${secondaryButtonClass} mt-3`} disabled={busy || people.length>=100} onClick={()=>{changed();setPeople(p=>[...p,{key:crypto.randomUUID(),employee_id:'',paid_days:form.kind==='Nómina'?'':'0',items:[]}])}}>Agregar empleado</button>
 </FormSection>
 <FormField label="Revisión de obligaciones y prestaciones" required hint="Documenta vigencia de tasas, IHSS/RAP/ISR aplicables o su exclusión justificada, vacaciones, pagos/anticipos previos y causal de liquidación. Para prestaciones: base salarial, días efectivamente trabajados, proporciones, límites y pagos previos."><textarea className={`${fieldClass} min-h-28`} maxLength={4000} disabled={busy} value={form.review_source} onChange={e=>change('review_source',e.target.value)} /></FormField>
 <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={busy} checked={attested} onChange={e=>setAttested(e.target.checked)} /><span>Revisé importes legales y contractuales, pagos previos y las exclusiones indicadas. Los importes de vacaciones no duplican el salario ni un anticipo ya pagado.</span></label>
 <button className={primaryButtonClass} disabled={busy || invalid} onClick={()=>void save()}>{busy?'Preparando…':'Guardar borrador'}</button></div>
}

function PayrollReview({ run, onClose, onSaved }: { run: HrPayrollRun; onClose: () => void; onSaved: () => void }) {
 const [busy,setBusy]=useState(false),[action,setAction]=useState(''),[reason,setReason]=useState(''),returnFocus=useReturnFocus()
 const loader=useCallback(async()=>{const r=await supabase.from('hr_payroll_entries').select('id,employee_snapshot,items,gross,deductions,net').eq('run_id',run.id).order('id');if(r.error)throw new Error('No se pudo cargar el detalle.');return r.data as {id:string;employee_snapshot:{name:string};items:{concept:{name:string;kind:string};amount:number;source:string}[];gross:number;deductions:number;net:number}[]},[run.id])
 const {data,error,loading,reload}=useScopedLoad(run.id,true,loader)
 async function apply(){if(busy || !action)return;setBusy(true);const r=await supabase.rpc('hr_review_payroll',{p_id:run.id,p_action:action,p_reason:reason});setBusy(false);if(r.error){toast.error(r.error.message);return}toast.success('Estado de nómina actualizado');onSaved()}
 return <Dialog open onOpenChange={open=>{if(!open && !busy)onClose()}}><DialogContent className="grid-cols-1 max-h-[90dvh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={returnFocus}><DialogTitle>{run.kind} · {formatDate(run.starts_on)} – {formatDate(run.ends_on)}</DialogTitle><DialogDescription>{run.status}. La contabilización requiere período abierto y cuentas activas; registra remuneraciones pendientes de pago.</DialogDescription>
 <p className="whitespace-pre-wrap text-sm">{run.review_source}</p>
 {error && <p role="alert">{error} <button className="underline" onClick={()=>void reload()}>Reintentar</button></p>}
 {loading?<p>Cargando detalle…</p>:data?.map(e=><section key={e.id} className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700"><p className="font-semibold">{e.employee_snapshot.name}</p><ul className="my-3 space-y-2">{e.items.map((i,n)=><li key={n}><p>{i.concept.name} · {i.concept.kind} · {formatMoney(i.amount,run.currency)}</p><p className="whitespace-pre-wrap text-xs text-slate-500">{i.source}</p></li>)}</ul><p>Bruto {formatMoney(e.gross,run.currency)} · Deducciones {formatMoney(e.deductions,run.currency)} · Neto {formatMoney(e.net,run.currency)}</p></section>)}
 <p className="font-semibold">Neto total {formatMoney(run.net,run.currency)}</p>
 {run.journal_entry_id && <p className="text-xs text-slate-500">Asiento: {run.journal_entry_id}{run.reversal_entry_id && ` · Reversión: ${run.reversal_entry_id}`}</p>}
 {run.status!=='Anulada' && <><div className="flex flex-wrap gap-2">{(run.status==='Borrador'?['Aprobar','Anular']:run.status==='Aprobada'?['Contabilizar','Anular']:['Revertir']).map(value=><button key={value} className={secondaryButtonClass} disabled={busy || loading || !!error} onClick={()=>{setAction(value);setReason('')}}>{value}</button>)}</div>
 {action && <div className="space-y-3 rounded-lg border border-amber-300 p-4"><p className="text-sm">Confirmar: {action}. {action==='Revertir'?'Se registrará una reversión contable con fecha de hoy.':action==='Contabilizar'?'Se registrará el asiento con la fecha de pago prevista.':'Se conservarán los importes y el historial de este documento.'}</p>{['Anular','Revertir'].includes(action) && <FormField label="Motivo" required><textarea className={fieldClass} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} /></FormField>}<div className="flex gap-2"><button className={secondaryButtonClass} disabled={busy} onClick={()=>setAction('')}>Volver</button><button className={primaryButtonClass} disabled={busy || (['Anular','Revertir'].includes(action) && reason.trim().length<10)} onClick={()=>void apply()}>{busy?'Procesando…':`Confirmar ${action.toLowerCase()}`}</button></div></div>}</>}
 </DialogContent></Dialog>
}
