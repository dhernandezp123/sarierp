'use client'

import { fiscalDocumentCodes } from '@/src/lib/fiscal-offices'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, formatDateTime, calendarDaysUntil, toDateInputValue } from '@/src/lib/format'
import { isValidCaiDate, validateCaiRange } from '@/src/lib/cai-validation'
import { toast } from 'sonner'
import { Plus, CheckCircle2, AlertTriangle, Trash2, ShieldCheck, Pencil, History, Save, X, Loader2 } from 'lucide-react'
import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { canManageCaiRanges } from '@/src/lib/permissions'
import { useInvoiceMaster } from '@/src/hooks/useInvoiceMaster'
import { loadBillingPointsOfSale } from '@/src/lib/billing-points-of-sale'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { ToggleSwitch } from '@/src/components/ui/toggle-switch'
import { CompactSelect } from '@/src/components/ui/CompactSelect'
import { cardClass, fieldClass, primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'

type CaiRange = {
  id: string
  cai: string
  rango_desde: string
  rango_hasta: string
  fecha_limite_emision: string
  lugar_emision: string | null
  point_of_sale: string
  document_type: FiscalDocumentType
  range_start: number
  range_end: number
  next_number: number
  is_active: boolean
  created_at: string
  revision: number
  ever_used: boolean
  archived_at: string | null
}

type CaiEvent = { id: string; action: string; reason: string; actor_name: string; created_at: string; before_values: Partial<CaiRange> | null; after_values: Partial<CaiRange> }
type CaiAction = { range: CaiRange; kind: 'toggle' | 'archive' }

function isNearExpiry(fecha: string | null): boolean {
  const days = fecha && isValidCaiDate(fecha) ? calendarDaysUntil(fecha) : null
  return days !== null && days >= 0 && days <= 30
}
function isExpired(fecha: string | null): boolean {
  return !fecha || !isValidCaiDate(fecha) || fecha < toDateInputValue()
}

type FiscalDocumentType = keyof typeof fiscalDocumentCodes

const FISCAL_DOCUMENT_TYPES = Object.keys(fiscalDocumentCodes) as FiscalDocumentType[]
type CaiOffice={name:string;establishment_code:string;emission_point_code:string}

function getRangeUsedPct(active: CaiRange): number {
  const total = active.range_end - active.range_start + 1
  const used = Math.max(0, active.next_number - active.range_start)
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
}

const emptyForm = {
  cai: '',
  rango_desde: '',
  rango_hasta: '',
  fecha_limite_emision: '',
  lugar_emision: '',
  document_type: 'Factura' as FiscalDocumentType,
  next_number: '',
}

export default function CaiSettingsPage() {
  const { profile } = useUser()
  const identity=`${profile?.id}:${profile?.tenant_id}`,loadVersion=useRef(0)
  const owner=useRef(identity)
  useEffect(()=>{owner.current=identity;return()=>{owner.current=''}},[identity])
  const [loadedIdentity,setLoadedIdentity]=useState(''),[offices,setOffices]=useState<CaiOffice[]>([])
  const { isMaster } = useInvoiceMaster()
  const canManageRanges = canManageCaiRanges(profile?.rol, isMaster)

  const [loading, setLoading] = useState(true)
  const [ranges, setRanges] = useState<CaiRange[]>([])
  const [pointsOfSale, setPointsOfSale] = useState<string[]>([])
  const [pointOfSale, setPointOfSale] = useState('')
  const [selectedStatusType, setSelectedStatusType] = useState<FiscalDocumentType>('Factura')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<CaiRange | null>(null)
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState<CaiAction | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [confirmAction, setConfirmAction] = useState(false)
  const [historyRange, setHistoryRange] = useState<CaiRange | null>(null)
  const [events, setEvents] = useState<CaiEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const historyVersion = useRef(0)
  const [saving, setSaving] = useState(false)
  const saveInFlight = useRef(false)
  const formRef = useRef<HTMLElement>(null)
  const firstFieldRef = useRef<HTMLButtonElement>(null)
  const dateFieldRef = useRef<HTMLInputElement>(null)
  const actionRef = useRef<HTMLElement>(null)
  const [loadError, setLoadError] = useState(false)
  const openForm = () => {
    if(!showForm){setForm({...emptyForm,document_type:selectedStatusType});setEditing(null);setReason('')}
    setShowForm(true)
    if (showForm) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      firstFieldRef.current?.focus({ preventScroll: true })
    }
  }
  useEffect(() => {
    if (!showForm) return
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if(editing)dateFieldRef.current?.focus({preventScroll:true})
    else firstFieldRef.current?.focus({ preventScroll: true })
  }, [showForm,editing])
  useEffect(()=>{
    if(!pendingAction)return
    actionRef.current?.scrollIntoView({behavior:'smooth',block:'center'})
    actionRef.current?.querySelector('textarea')?.focus({preventScroll:true})
  },[pendingAction])
  const [activating, setActivating] = useState<string | null>(null)

  function editRange(range: CaiRange) {
    setEditing(range);setReason('');setForm({cai:range.cai,rango_desde:range.rango_desde,rango_hasta:range.rango_hasta,
      fecha_limite_emision:range.fecha_limite_emision,lugar_emision:range.lugar_emision||'',document_type:range.document_type,next_number:String(range.next_number)})
    setShowForm(true);formRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  async function showHistory(range: CaiRange) {
    const run=++historyVersion.current
    setHistoryRange(range);setEvents([]);setHistoryLoading(true);setHistoryError(false)
    try {
      const result=await supabase.from('cai_range_events').select('*').eq('range_id',range.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100)
      if(owner.current!==identity||run!==historyVersion.current)return
      if(result.error)throw result.error
      setEvents((result.data||[]) as CaiEvent[])
    }catch{if(owner.current===identity&&run===historyVersion.current){setHistoryError(true);toast.error('No se pudo consultar el historial del CAI')}}
    finally{if(owner.current===identity&&run===historyVersion.current)setHistoryLoading(false)}
  }

  const fetchAll = useCallback(async () => {
    if(owner.current!==identity)return
    const run=++loadVersion.current
    try {
    const [rangesRes, pointsRes, officesRes] = await Promise.all([supabase
      .from('cai_ranges')
      .select('*')
      .order('created_at', { ascending: false }), loadBillingPointsOfSale(supabase),supabase.from('billing_offices').select('name,establishment_code,emission_point_code').order('name')])
    if(run!==loadVersion.current||owner.current!==identity)return
    const failed=!!rangesRes.error||!!pointsRes.error||!!officesRes.error||!pointsRes.data.length
    setLoadedIdentity(identity);setLoadError(failed)
    if(failed){setRanges([]);setPointsOfSale([]);setOffices([]);toast.error('Error al cargar rangos CAI o puntos de venta');return}
    setOffices((officesRes.data||[]) as CaiOffice[])
    setPointsOfSale(pointsRes.data)
    setPointOfSale(current => pointsRes.data.includes(current) ? current : pointsRes.data[0] || '')
    setRanges((rangesRes.data || []) as CaiRange[])
    } catch {
      if(run!==loadVersion.current||owner.current!==identity)return
      setLoadedIdentity(identity);setRanges([]);setOffices([]);setPointsOfSale([])
      setLoadError(true)
      toast.error('No se pudieron cargar los rangos CAI. Reintenta la consulta.')
    } finally { if(run===loadVersion.current)setLoading(false) }
  }, [identity])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowForm(false);setEditing(null);setPendingAction(null);setHistoryRange(null);setEvents([]);setReason('');setActionReason('')
      void fetchAll()
    }, 0)
    return () => { window.clearTimeout(timeout) }
  }, [fetchAll])

  const handleSave = async () => {
    if (!canManageRanges) { toast.error('No tienes permiso para registrar rangos CAI'); return }
    if (!pointOfSale || !pointsOfSale.includes(pointOfSale)) { toast.error('Selecciona un punto de venta'); return }
    if (saveInFlight.current) return
    const office=offices.find(o=>o.name===pointOfSale)
    if(!office?.establishment_code||!office.emission_point_code){toast.error('Completa los códigos SAR de la oficina en Configuración de empresa.');return}
    if(!reason.trim()){toast.error('Indica el motivo del registro o corrección.');return}
    const validation = validateCaiRange({...form,next_number:editing?'':form.next_number},`${office.establishment_code}-${office.emission_point_code}-${fiscalDocumentCodes[form.document_type]}-`)
    if (validation) { toast.error(validation); return }
    saveInFlight.current = true
    try {
    setSaving(true)
    const { error } = await supabase.rpc('save_cai_range', {p_id:editing?.id||null,p_revision:editing?.revision||0,p_reason:reason.trim(),p_values:{
      cai: form.cai.trim(),
      rango_desde: form.rango_desde.trim(),
      rango_hasta: form.rango_hasta.trim(),
      fecha_limite_emision: form.fecha_limite_emision,
      lugar_emision: form.lugar_emision.trim() || null,
      document_type: form.document_type,
      point_of_sale: pointOfSale,
      next_number: form.next_number.trim() || null,
    }})
    setSaving(false)
    if(owner.current!==identity)return
    if (error) { toast.error(error.message); return }
    toast.success(editing?'Rango CAI corregido con historial':'Rango CAI registrado')
    setForm(emptyForm)
    setEditing(null);setReason('')
    setShowForm(false)
    await fetchAll()
    } catch {
      if(owner.current!==identity)return
      toast.error('No se pudo confirmar el registro. Revisa el historial antes de volver a guardar.')
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  async function applyAction() {
    if(!canManageRanges||!pendingAction||!actionReason.trim()||saveInFlight.current)return
    const action=pendingAction
    saveInFlight.current=true;setActivating(action.range.id)
    try {
      const args={p_id:action.range.id,p_revision:action.range.revision,p_reason:actionReason.trim()}
      const result=action.kind==='archive'?await supabase.rpc('archive_cai_range',args):await supabase.rpc('set_cai_range_active',{...args,p_active:!action.range.is_active})
      if(owner.current!==identity)return
      if(result.error)throw result.error
      toast.success(action.kind==='archive'?'CAI eliminado de uso; historial conservado':action.range.is_active?'CAI desactivado':'CAI activado')
      setPendingAction(null);setActionReason('');await fetchAll()
    }catch(error){if(owner.current===identity)toast.error((error as Error).message||'No se pudo confirmar el cambio. Recarga antes de reintentar.')}
    finally{saveInFlight.current=false;setActivating(null)}
  }

  const officeRanges = ranges.filter(range => range.point_of_sale === pointOfSale)
  const activeRange = officeRanges.find(
    (range) => range.is_active && !range.archived_at && range.document_type === selectedStatusType
  )
  const usedCount = activeRange
    ? Math.max(0, activeRange.next_number - activeRange.range_start)
    : 0
  const pct = activeRange ? getRangeUsedPct(activeRange) : 0
  const nearExpiry = activeRange && isNearExpiry(activeRange.fecha_limite_emision)
  const expired = activeRange && isExpired(activeRange.fecha_limite_emision)
  const nearLimit = pct >= 80

  const office=offices.find(o=>o.name===pointOfSale)
  const fiscalPrefix=`${office?.establishment_code||'XXX'}-${office?.emission_point_code||'XXX'}-${fiscalDocumentCodes[showForm?form.document_type:selectedStatusType]}-`
  if (loading||loadedIdentity!==identity) return <PageSkeleton cards={1} rows={4} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Configuración
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Rangos CAI — SAR</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            CAI, rango, vigencia y siguiente correlativo independientes por oficina y tipo de documento fiscal.
          </p>
        </div>
        {canManageRanges && (
          <button
            type="button"
            onClick={openForm}
            aria-label="Registrar rango CAI"
            title="Registrar rango CAI"
            aria-expanded={showForm}
            aria-controls="new-cai-range"
            className={`${primaryButtonClass} inline-flex h-10 w-10 shrink-0 items-center justify-center self-start !p-0`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      <p className="text-sm text-slate-500">Solo el usuario máster designado puede administrar CAI. Las correcciones conservan los documentos emitidos, el consumo y el historial.</p>

      <div className="max-w-sm">
        <label htmlFor="cai-point-of-sale" className="mb-1.5 block text-sm font-semibold">Punto de venta</label>
        <CompactSelect id="cai-point-of-sale" aria-label="Punto de venta" value={pointOfSale} disabled={showForm || saving}
          onValueChange={setPointOfSale} options={pointsOfSale.map(point=>({value:point,label:point}))}/>
        <p className="mt-2 text-xs text-slate-500">El CAI y el siguiente número corresponden únicamente a esta oficina y al tipo de documento seleccionado.</p>
        {office?.establishment_code&&office.emission_point_code?<p className="mt-1 text-xs font-semibold text-slate-600">Prefijo SAR: {office.establishment_code}-{office.emission_point_code}-{fiscalDocumentCodes[showForm?form.document_type:selectedStatusType]}-XXXXXXXX</p>:<p className="mt-1 text-xs text-amber-700">Completa los códigos SAR de esta oficina en Configuración de empresa antes de registrar o activar rangos.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {FISCAL_DOCUMENT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelectedStatusType(type)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedStatusType === type
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {loadError && <div role="alert" className={cardClass}>No se pudieron cargar los rangos. <button type="button" onClick={() => void fetchAll()} className={secondaryButtonClass}>Reintentar</button></div>}
      {ranges.some(range => !isValidCaiDate(range.fecha_limite_emision)) && (
        <div role="alert" className="rounded-xl border border-rose-300 p-4 text-rose-700 dark:text-rose-300">
          Hay rangos con fechas inválidas. Revisa el documento original antes de corregirlos; no deben activarse ni utilizarse para emitir.
        </div>
      )}
      {/* Status del rango activo */}
      {activeRange ? (
        <div className={`w-full max-w-3xl rounded-2xl border p-5 ${
          expired ? 'border-rose-300 bg-rose-50 dark:border-rose-800/50 dark:bg-rose-950/30'
          : nearExpiry || nearLimit ? 'border-amber-300 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30'
          : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {expired ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
              ) : nearExpiry || nearLimit ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              ) : (
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              )}
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {expired ? `Rango ${selectedStatusType} vencido` : nearExpiry || nearLimit ? `Alerta de ${selectedStatusType}` : `Rango ${selectedStatusType} activo`}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                  CAI: {activeRange.cai}
                </p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-slate-500 dark:text-slate-400">Vence: <span className={`font-semibold ${expired ? 'text-rose-600' : nearExpiry ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{formatDate(activeRange.fecha_limite_emision)}</span></p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">Facturas emitidas: <span className="font-semibold text-slate-900 dark:text-white">{usedCount}</span></p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Rango desde</p>
              <p className="font-mono font-semibold text-slate-900 dark:text-white">{activeRange.rango_desde}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Rango hasta</p>
              <p className="font-mono font-semibold text-slate-900 dark:text-white">{activeRange.rango_hasta}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Lugar de emisión</p>
              <p className="font-semibold text-slate-900 dark:text-white">{activeRange.lugar_emision || '—'}</p>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Uso del rango</span>
              <span className={nearLimit ? 'font-bold text-amber-600' : ''}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {(nearExpiry || nearLimit || expired) && (
              <p className={`mt-2 text-xs font-semibold ${expired ? 'text-rose-600' : 'text-amber-600'}`}>
                {expired ? '⚠ El rango CAI ha vencido. Debes registrar y activar un nuevo rango antes de emitir facturas.' :
                 nearExpiry ? `⚠ El rango vence en menos de 30 días. Solicita un nuevo CAI al SAR.` :
                 `⚠ El rango está al ${pct}% de uso. Solicita pronto un nuevo CAI al SAR.`}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full max-w-3xl rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Sin rango CAI activo</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                No puedes emitir {selectedStatusType.toLowerCase()} sin un rango CAI activo para ese documento.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form nuevo rango */}
      {showForm && canManageRanges && (
        <section ref={formRef} id="new-cai-range" className="w-full max-w-3xl scroll-mt-24 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-5 border-l-4 border-orange-500 pl-3"><p className="text-[10px] font-bold uppercase tracking-widest text-orange-700 dark:text-orange-300">Configuración fiscal</p><h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{editing?'Corregir rango CAI':'Nuevo rango CAI'}</h2></div>
          {editing&&<p className="mb-4 text-sm text-slate-500">Corrige según la autorización del SAR. Una renovación con otro CAI se registra por separado. Los documentos emitidos se conservan; un CAI usado mantiene su identidad, inicio de rango y siguiente correlativo.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Tipo de documento fiscal <span className="text-red-500">*</span>
              </label>
              <CompactSelect
                aria-label="Tipo de documento fiscal"
                ref={firstFieldRef}
                value={form.document_type}
                disabled={Boolean(editing)||saving}
                onValueChange={(value) => setForm((previous) => ({
                  ...previous,
                  document_type: value as FiscalDocumentType,
                }))}
                options={FISCAL_DOCUMENT_TYPES.map(type=>({value:type,label:type}))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                CAI <span className="text-red-500">*</span>
              </label>
              <input
                aria-label="CAI"
                disabled={Boolean(editing?.ever_used)||saving}
                value={form.cai}
                onChange={(e) => setForm((p) => ({ ...p, cai: e.target.value }))}
                placeholder="XXXXXX-XXXXX-XXXXX-XXXXXXXX-XXXXX-XX"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rango desde <span className="text-red-500">*</span>
              </label>
              <input
                aria-label="Rango desde"
                disabled={Boolean(editing?.ever_used)||saving}
                value={form.rango_desde}
                onChange={(e) => setForm((p) => ({ ...p, rango_desde: e.target.value }))}
                placeholder={`${fiscalPrefix}00000001`}
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rango hasta <span className="text-red-500">*</span>
              </label>
              <input
                aria-label="Rango hasta"
                value={form.rango_hasta}
                onChange={(e) => setForm((p) => ({ ...p, rango_hasta: e.target.value }))}
                placeholder={`${fiscalPrefix}00000500`}
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Fecha límite de emisión <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                ref={dateFieldRef}
                aria-label="Fecha límite de emisión"
                min="0001-01-01"
                max="9999-12-31"
                required
                value={form.fecha_limite_emision}
                onChange={(e) => setForm((p) => ({ ...p, fecha_limite_emision: e.target.value }))}
                className={`${fieldClass} [color-scheme:light] dark:[color-scheme:dark]`}
              />
            </div>
            {!editing&&<div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Siguiente correlativo (opcional)
              </label>
              <input aria-label="Siguiente correlativo" inputMode="numeric" value={form.next_number}
                onChange={(event) => setForm(previous => ({ ...previous, next_number: event.target.value }))}
                placeholder="Inicio del rango si se deja vacío" className={fieldClass} />
              <p className="mt-1 text-xs text-slate-500">Si la oficina ya utilizó parte del rango, indica el próximo número disponible.</p>
            </div>}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
                Lugar de emisión
              </label>
              <input
                aria-label="Lugar de emisión"
                value={form.lugar_emision}
                onChange={(e) => setForm((p) => ({ ...p, lugar_emision: e.target.value }))}
                placeholder="Ej. San Pedro Sula, Honduras"
                className={fieldClass}
              />
            </div>
            <label className="space-y-2 text-sm sm:col-span-2">Motivo del registro o corrección
              <textarea aria-label="Motivo del cambio CAI" value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000} className={`${fieldClass} h-auto min-h-20 resize-y py-3`} rows={2}/>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleSave} disabled={saving||!reason.trim()} aria-label="Guardar rango" title="Guardar rango" className={primaryButtonClass}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
            </button>
            <button type="button" onClick={() => {setShowForm(false);setEditing(null)}} disabled={saving} aria-label="Cancelar edición" title="Cancelar edición" className={secondaryButtonClass}>
              <X className="h-4 w-4"/>
            </button>
          </div>
        </section>
      )}

      {/* Lista de rangos */}
      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          Historial de rangos CAI
        </h2>
        {officeRanges.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No hay rangos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="pb-3 pr-4">Tipo</th>
                  <th className="pb-3 pr-4">CAI</th>
                  <th className="pb-3 pr-4">Rango</th>
                  <th className="pb-3 pr-4">Fecha límite</th>
                  <th className="pb-3 pr-4">Lugar</th>
                  <th className="pb-3 pr-4 text-center">Estado</th>
                  <th className="pb-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {officeRanges.map((r) => {
                  const exp = isExpired(r.fecha_limite_emision)
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-3 pr-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {r.document_type}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {r.cai}
                      </td>
                      <td className="pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {r.rango_desde}<br />→ {r.rango_hasta}
                      </td>
                      <td className={`pr-4 text-sm ${exp ? 'text-rose-500 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {isValidCaiDate(r.fecha_limite_emision) ? formatDate(r.fecha_limite_emision) : 'Fecha inválida: revisar'}
                        {exp && <span className="ml-1">⚠</span>}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-400">{r.lugar_emision || '—'}</td>
                      <td className="pr-4 text-center">
                        {r.archived_at ? <span className="text-xs text-slate-500">Eliminado · conservado</span> : r.is_active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" />
                            Activo
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Inactivo
                          </span>
                        )}
                      </td>
                        <td>
                          <div className="flex gap-1 justify-end">
                            <button type="button" aria-label={`Ver historial de ${r.cai}`} title="Ver historial" onClick={()=>void showHistory(r)} className={secondaryButtonClass}><History className="h-4 w-4"/></button>
                            {canManageRanges&&!r.archived_at&&<>
                              <button type="button" aria-label={`Editar ${r.cai}`} title="Editar CAI" disabled={saving||activating!==null} onClick={()=>editRange(r)} className={secondaryButtonClass}><Pencil className="h-4 w-4"/></button>
                              <ToggleSwitch checked={r.is_active} label={`${r.is_active?'Desactivar':'Activar'} ${r.cai}`} disabled={saving||activating!==null||(!r.is_active&&(exp||r.next_number>r.range_end))} onChange={()=>{setPendingAction({range:r,kind:'toggle'});setActionReason('')}}/>
                              <button type="button" aria-label={`Eliminar ${r.cai}`} title={r.is_active?'Desactiva el CAI antes de eliminarlo':'Eliminar conservando historial'} disabled={r.is_active||saving||activating!==null} onClick={()=>{setPendingAction({range:r,kind:'archive'});setActionReason('')}} className={`${secondaryButtonClass} text-rose-600 disabled:opacity-40`}><Trash2 className="h-4 w-4"/></button>
                            </>}
                          </div>
                        </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingAction&&canManageRanges&&<section ref={actionRef} className="w-full max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900/40" aria-label="Motivo de acción CAI">
        <h2 className="font-semibold">{pendingAction.kind==='archive'?'Eliminar de uso':pendingAction.range.is_active?'Desactivar':'Activar'} CAI · {pendingAction.range.cai}</h2>
        <p className="text-sm text-slate-500">{pendingAction.kind==='archive'?'El registro y sus movimientos quedarán disponibles como historial.':'El cambio afecta únicamente esta oficina y tipo de documento. Activar reemplaza al CAI activo de esa misma serie.'}</p>
        <label className="block space-y-2 text-sm">Motivo<textarea aria-label="Motivo de acción CAI" className={fieldClass} maxLength={1000} value={actionReason} onChange={event=>setActionReason(event.target.value)} rows={2}/></label>
        <div className="flex gap-2"><button type="button" aria-label="Confirmar cambio CAI" title="Confirmar cambio" disabled={!actionReason.trim()||activating!==null} className={primaryButtonClass} onClick={()=>setConfirmAction(true)}><CheckCircle2 className="h-4 w-4"/></button><button type="button" aria-label="Cancelar cambio CAI" title="Cancelar" disabled={activating!==null} className={secondaryButtonClass} onClick={()=>setPendingAction(null)}><X className="h-4 w-4"/></button></div>
      </section>}
      <ConfirmDialog open={confirmAction&&canManageRanges} onOpenChange={setConfirmAction} title="Confirmar cambio CAI" description="La acción, el motivo y el usuario quedarán registrados. Los documentos ya emitidos conservarán sus datos originales." onConfirm={()=>void applyAction()}/>
      {historyRange&&<section className={`${cardClass} space-y-4`}>
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Historial · {historyRange.cai}</h2><button type="button" aria-label="Cerrar historial" title="Cerrar historial" className={secondaryButtonClass} onClick={()=>{historyVersion.current++;setHistoryRange(null)}}><X className="h-4 w-4"/></button></div>
        <p className="text-xs text-slate-500">Últimos 100 movimientos registrados. Los CAI anteriores al control de historial conservan sus documentos y consumo; las modificaciones se registran desde esta actualización.</p>
        {historyLoading?<p role="status">Consultando historial…</p>:historyError?<p role="alert" className="text-sm text-rose-600">No se pudo cargar el historial. <button type="button" className="underline" onClick={()=>void showHistory(historyRange)}>Reintentar</button></p>:events.length===0?<p className="text-sm text-slate-500">Sin movimientos registrados desde esta actualización.</p>:<div className="space-y-3">{events.map(event=><article key={event.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><p className="font-semibold">{event.action} · {formatDateTime(event.created_at)} · {event.actor_name}</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-500">{event.reason}</p>{event.before_values&&<p className="mt-2 break-words font-mono text-xs">{event.before_values.rango_desde} → {event.before_values.rango_hasta} · {formatDate(event.before_values.fecha_limite_emision)} → {event.after_values.rango_desde} → {event.after_values.rango_hasta} · {formatDate(event.after_values.fecha_limite_emision)}</p>}</article>)}</div>}
      </section>}
    </div>
  )
}
