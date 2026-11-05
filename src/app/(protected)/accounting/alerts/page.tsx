'use client'
import {useEffect,useRef,useState} from 'react'
import {BellRing} from 'lucide-react'
import {toast} from 'sonner'
import {useUser} from '@/src/hooks/useUser'
import {supabase} from '@/src/lib/supabase/client'
import {readAllReportRows} from '@/src/lib/report-query'
import {AccountingNav} from '@/src/components/accounting/AccountingNav'
import {AccountingAlertsPanel} from '@/src/components/accounting/AccountingAlertsPanel'
import {AccountingReminderDeliveries} from '@/src/components/accounting/AccountingReminderDeliveries'
import {FinancePageHeader} from '@/src/components/invoicing/FinanceWorkspace'
import {CompactSelect} from '@/src/components/ui/CompactSelect'
import {FormField,FormSection} from '@/src/components/ui/form-field'
import {ConfirmDialog} from '@/src/components/ui/ConfirmDialog'
import {cardClass,fieldClass,primaryButtonClass} from '@/src/lib/ui-classes'
type Settings={revision:number;internal_enabled:boolean;portal_enabled:boolean;email_enabled:boolean;before_days:number[];overdue_days:number;inactivity_days:number[]}
type Client={id:string;nombre:string;email_1:string|null;email_2:string|null}
type Preference={cliente_id:string;revision:number;approved_emails:string[];portal_enabled:boolean}
const defaults:Settings={revision:0,internal_enabled:false,portal_enabled:false,email_enabled:false,before_days:[7,3,0],overdue_days:7,inactivity_days:[30,60,90]}
export default function AccountingAlertSettingsPage(){const {user,profile}=useUser();return <SettingsForm key={`${user?.id}:${profile?.tenant_id}:${profile?.rol}`}/>}
function SettingsForm(){
 const [data,setData]=useState<{settings:Settings;clients:Client[];prefs:Preference[];canEdit:boolean}|null>(null),[form,setForm]=useState<Settings>(defaults)
 const [before,setBefore]=useState('7,3,0'),[inactive,setInactive]=useState('30,60,90'),[repeat,setRepeat]=useState('7'),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 const [clientId,setClientId]=useState(''),[slots,setSlots]=useState<string[]>([]),[portal,setPortal]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState<'settings'|'contacts'|null>(null)
 const mounted=useRef(true),lock=useRef(false)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{let active=true;void Promise.all([
  supabase.from('accounting_alert_settings').select('*').maybeSingle(),supabase.rpc('is_invoice_master'),
  readAllReportRows<Client>((a,b)=>supabase.from('clientes').select('id,nombre,email_1,email_2').is('deleted_at',null).order('id').range(a,b),{label:'contactos registrados',isCurrent:()=>active}),
  readAllReportRows<Preference>((a,b)=>supabase.from('collections_contact_preferences').select('cliente_id,revision,approved_emails,portal_enabled').order('cliente_id').range(a,b),{label:'preferencias de cobranza',key:'cliente_id',isCurrent:()=>active})
 ]).then(([settings,permission,clients,prefs])=>{if(!active)return;if(settings.error||permission.error)throw new Error('No se pudo consultar la configuración de alertas.');const s=(settings.data||defaults) as Settings;setData({settings:s,clients,prefs,canEdit:permission.data===true});setForm(s);setBefore(s.before_days.join(','));setInactive(s.inactivity_days.join(','));setRepeat(String(s.overdue_days));setError('')}).catch(e=>{if(active){setError((e as Error).message);setData(null)}});return()=>{active=false}},[refresh])
 const client=data?.clients.find(c=>c.id===clientId),pref=data?.prefs.find(p=>p.cliente_id===clientId)
 function choose(id:string){setClientId(id);const c=data?.clients.find(c=>c.id===id),p=data?.prefs.find(p=>p.cliente_id===id);setSlots(['email_1','email_2'].filter(slot=>{const email=c?.[slot as 'email_1'|'email_2'];return email&&p?.approved_emails.includes(email.trim().toLowerCase())}));setPortal(p?.portal_enabled||false)}
 function days(value:string){const values=value.split(',').map(v=>v.trim());if(!values.length||values.some(v=>!/^\d+$/.test(v)))throw new Error('Escribe días enteros separados por comas.');return values.map(Number)}
 async function save(){
  if(!confirm||lock.current||!data)return
  lock.current=true;setBusy(true)
  try{
   let response
   if(confirm==='settings')response=await supabase.rpc('save_accounting_alert_settings',{p_revision:data.settings.revision,p_settings:{...form,before_days:days(before),inactivity_days:days(inactive),overdue_days:Number(repeat)},p_reason:reason.trim()})
   else response=await supabase.rpc('save_collections_contacts',{p_client:clientId,p_revision:pref?.revision||0,p_slots:slots,p_portal:portal,p_reason:reason.trim()})
   if(response.error)throw response.error
   if(mounted.current){toast.success('Configuración de avisos guardada.');setConfirm(null);setReason('');setData(null);setRefresh(n=>n+1)}
  }catch(e){if(mounted.current)toast.error((e as Error).message||'No se pudo guardar la configuración.')}
  finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 return <div className="space-y-6"><FinancePageHeader eyebrow="Contabilidad" title="Alertas y cobranza" description="Avisos internos, calendario de vencimientos y contactos autorizados para recordatorios." icon={BellRing}/><AccountingNav/><AccountingAlertsPanel/>{error&&<p role="alert" className="text-red-600">{error}</p>}{!data&&!error&&<p>Cargando configuración…</p>}{data&&<><section className={`${cardClass} space-y-4`}><FormSection title="Canales y calendario" description="Los avisos automáticos se revisan diariamente por la mañana (Honduras). Los canales de clientes requieren además selección expresa por cliente. El correo necesita activación segura del servidor.">{null}</FormSection><fieldset disabled={!data.canEdit||busy} className="space-y-4"><div className="flex flex-wrap gap-5">{(['internal_enabled','portal_enabled','email_enabled'] as const).map((field,i)=><label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form[field]} onChange={e=>setForm({...form,[field]:e.target.checked})}/>{['Avisos internos','Avisos a clientes en portal','Correos de cobranza'][i]}</label>)}</div><div className="grid gap-4 sm:grid-cols-3"><FormField label="Días antes del vencimiento" hint="Separados por comas; 0 significa el día de vencimiento."><input className={fieldClass} value={before} onChange={e=>setBefore(e.target.value)} maxLength={80}/></FormField><FormField label="Repetir vencidas cada (días)"><input className={fieldClass} inputMode="numeric" value={repeat} onChange={e=>setRepeat(e.target.value)} maxLength={2}/></FormField><FormField label="Umbrales de inactividad (días)"><input className={fieldClass} value={inactive} onChange={e=>setInactive(e.target.value)} maxLength={80}/></FormField></div><FormField label="Motivo del cambio" required><input className={fieldClass} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></FormField><button className={primaryButtonClass} disabled={reason.trim().length<5} onClick={()=>setConfirm('settings')}>Guardar calendario y canales</button></fieldset>{!data.canEdit&&<p className="text-sm text-slate-500">Solo Administración o el máster contable puede modificar esta configuración.</p>}</section>
 <section className={`${cardClass} space-y-4`}><FormSection title="Destinatarios por cliente" description="Selecciona los correos registrados en el perfil. Si una dirección cambia, debe seleccionarse de nuevo. Dos campos con el mismo correo generan un solo envío.">{null}</FormSection><FormField as="div" label="Cliente"><CompactSelect aria-label="Cliente para avisos de cobranza" searchable value={clientId} onValueChange={choose} options={[{value:'',label:'Selecciona un cliente'},...data.clients.map(c=>({value:c.id,label:c.nombre}))]} /></FormField>{client&&<fieldset disabled={!data.canEdit||busy} className="space-y-3">{(['email_1','email_2'] as const).map(slot=><label key={slot} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!client[slot]} checked={slots.includes(slot)} onChange={e=>setSlots(e.target.checked?[...slots,slot]:slots.filter(s=>s!==slot))}/>{client[slot]||'Sin correo registrado'} · {slot==='email_1'?'Principal':'Secundario'}</label>)}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={portal} onChange={e=>setPortal(e.target.checked)}/>Avisar a usuarios activos del portal vinculados a este cliente</label><p className="text-xs text-slate-500">No se crean cuentas ni se invita a personas automáticamente. Tener correo registrado no habilita avisos sin esta selección.</p><button className={primaryButtonClass} disabled={reason.trim().length<5} onClick={()=>setConfirm('contacts')}>Guardar destinatarios</button></fieldset>}</section></>}
 <AccountingReminderDeliveries/>
 <ConfirmDialog open={Boolean(confirm)} onOpenChange={open=>{if(!open&&!busy)setConfirm(null)}} title="Guardar configuración de avisos" description="El cambio queda auditado. Habilitar canales de clientes permite avisos automáticos a los destinatarios seleccionados cuando el servidor los tenga activados." confirmLabel="Confirmar cambio" onConfirm={()=>void save()}/>
 </div>
}
