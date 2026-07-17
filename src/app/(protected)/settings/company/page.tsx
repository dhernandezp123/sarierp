'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Building2, Fuel, MapPin, Save, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { cardClass, fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'
import { DEFAULT_INSURANCE_COST_RATE_PERCENT } from '@/src/lib/insurance-calculator'

type CompanySettings = {
  id: string
  legal_name: string | null
  trade_name: string | null
  rtn: string | null
  address: string | null
  city: string | null
  country: string | null
  zip_code: string | null
  phone: string | null
  phone_2: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  default_currency: string | null
  default_tax_rate: number | null
  insurance_cost_rate_percent: number | null
  invoice_footer_note: string | null
  lugar_emision_defecto: string | null
  exchange_rate_usd_hnl: number | null
  condiciones_bl: string | null
  condiciones_awb: string | null
  condiciones_carta_porte: string | null
  plantilla_cotizacion: string | null
  miami_consignee: string | null
  miami_address_line: string | null
  miami_suite_prefix: string | null
  miami_city: string | null
  miami_state: string | null
  miami_zip: string | null
  miami_country: string | null
  miami_phone: string | null
}

type BunkerForm = {
  label: string
  rate_per_lbs: number
  rate_per_ft3: number
  minimum_amount: number
  is_active: boolean
}

const BUNKER_CODE = 'bunker_emergency_surcharge'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  )
}

export default function CompanySettingsPage() {
  const { user, profile } = useUser()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [form, setForm] = useState<Omit<CompanySettings, 'id'>>({
    legal_name: '',
    trade_name: '',
    rtn: '',
    address: '',
    city: '',
    country: 'Honduras',
    zip_code: '',
    phone: '',
    phone_2: '',
    email: '',
    website: '',
    logo_url: '',
    default_currency: 'USD',
    default_tax_rate: 15,
    insurance_cost_rate_percent: DEFAULT_INSURANCE_COST_RATE_PERCENT,
    invoice_footer_note: '',
    lugar_emision_defecto: '',
    exchange_rate_usd_hnl: 25.30,
    condiciones_bl: '',
    condiciones_awb: '',
    condiciones_carta_porte: '',
    plantilla_cotizacion: '',
    miami_consignee: '',
    miami_address_line: '',
    miami_suite_prefix: '',
    miami_city: 'Miami',
    miami_state: 'FL',
    miami_zip: '',
    miami_country: 'USA',
    miami_phone: '',
  })
  const [bunker, setBunker] = useState<BunkerForm>({
    label: 'Bunker Emergency Surcharge',
    rate_per_lbs: 0,
    rate_per_ft3: 0,
    minimum_amount: 0,
    is_active: true,
  })
  const [bunkerLoaded, setBunkerLoaded] = useState(false)
  const [bunkerExists, setBunkerExists] = useState(false)
  const [bunkerDirty, setBunkerDirty] = useState(false)

  const isAdmin = profile?.rol === 'Admin'

  useEffect(() => { fetchSettings() }, [])

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      toast.error('Error al cargar configuración')
      setLoading(false)
      return
    }

    if (data) {
      setSettingsId(data.id)
      setForm({
        legal_name: data.legal_name ?? '',
        trade_name: data.trade_name ?? '',
        rtn: data.rtn ?? '',
        address: data.address ?? '',
        city: data.city ?? '',
        country: data.country ?? 'Honduras',
        zip_code: data.zip_code ?? '',
        phone: data.phone ?? '',
        phone_2: data.phone_2 ?? '',
        email: data.email ?? '',
        website: data.website ?? '',
        logo_url: data.logo_url ?? '',
        default_currency: data.default_currency ?? 'USD',
        default_tax_rate: data.default_tax_rate ?? 15,
        insurance_cost_rate_percent:
          (data as any).insurance_cost_rate_percent ??
          DEFAULT_INSURANCE_COST_RATE_PERCENT,
        invoice_footer_note: data.invoice_footer_note ?? '',
        lugar_emision_defecto: data.lugar_emision_defecto ?? '',
        exchange_rate_usd_hnl: data.exchange_rate_usd_hnl ?? 25.30,
        condiciones_bl: (data as any).condiciones_bl ?? '',
        condiciones_awb: (data as any).condiciones_awb ?? '',
        condiciones_carta_porte: (data as any).condiciones_carta_porte ?? '',
        plantilla_cotizacion: (data as any).plantilla_cotizacion ?? '',
        miami_consignee: (data as any).miami_consignee ?? '',
        miami_address_line: (data as any).miami_address_line ?? '',
        miami_suite_prefix: (data as any).miami_suite_prefix ?? '',
        miami_city: (data as any).miami_city ?? 'Miami',
        miami_state: (data as any).miami_state ?? 'FL',
        miami_zip: (data as any).miami_zip ?? '',
        miami_country: (data as any).miami_country ?? 'USA',
        miami_phone: (data as any).miami_phone ?? '',
      })
    }

    const { data: bunkerData, error: bunkerError } = await supabase
      .from('surcharge_rules')
      .select('label, rate_per_lbs, rate_per_ft3, minimum_amount, is_active')
      .eq('code', BUNKER_CODE)
      .maybeSingle()

    if (bunkerError) {
      toast.error('Error al cargar configuracion del Bunker')
      setLoading(false)
      return
    }

    setBunkerLoaded(true)
    setBunkerExists(Boolean(bunkerData))

    if (bunkerData) {
      setBunker({
        label: bunkerData.label ?? 'Bunker Emergency Surcharge',
        rate_per_lbs: Number(bunkerData.rate_per_lbs) || 0,
        rate_per_ft3: Number(bunkerData.rate_per_ft3) || 0,
        minimum_amount: Number(bunkerData.minimum_amount) || 0,
        is_active: bunkerData.is_active ?? true,
      })
    }

    setLoading(false)
  }

  const set = (key: keyof typeof form, value: string | number | null) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const setBunkerField = (key: keyof BunkerForm, value: string | number | boolean) => {
    setBunkerDirty(true)
    setBunker((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!isAdmin) { toast.error('Solo el Admin puede modificar esta configuración'); return }
    if (!bunkerLoaded) {
      toast.error('No se puede guardar hasta cargar la configuracion del Bunker')
      return
    }
    const insuranceCostRatePercent = Number(form.insurance_cost_rate_percent)
    if (
      !Number.isFinite(insuranceCostRatePercent) ||
      insuranceCostRatePercent <= 0 ||
      insuranceCostRatePercent > 5
    ) {
      toast.error('El costo del seguro debe ser mayor que 0% y no superar 5%.')
      return
    }
    setSaving(true)

    const payload = {
      ...form,
      default_tax_rate: Number(form.default_tax_rate) || 15,
      insurance_cost_rate_percent: insuranceCostRatePercent,
      legal_name: form.legal_name || null,
      trade_name: form.trade_name || null,
      rtn: form.rtn || null,
      address: form.address || null,
      city: form.city || null,
      zip_code: form.zip_code || null,
      phone: form.phone || null,
      phone_2: form.phone_2 || null,
      email: form.email || null,
      website: form.website || null,
      logo_url: form.logo_url || null,
      invoice_footer_note: form.invoice_footer_note || null,
      updated_at: new Date().toISOString(),
      updated_by: user?.id || null,
    }

    let error
    if (settingsId) {
      const res = await supabase.from('company_settings').update(payload).eq('id', settingsId)
      error = res.error
    } else {
      const res = await supabase.from('company_settings').insert(payload).select('id').single()
      if (!res.error && res.data) setSettingsId(res.data.id)
      error = res.error
    }

    if (error) { setSaving(false); toast.error(error.message); return }

    if (bunkerExists || bunkerDirty) {
      const { error: bunkerError } = await supabase
        .from('surcharge_rules')
        .upsert(
          {
            code: BUNKER_CODE,
            label: bunker.label.trim() || 'Bunker Emergency Surcharge',
            service_product: 'miami_lcl',
            calculation_type: 'max_formula',
            rate_per_lbs: Number(bunker.rate_per_lbs) || 0,
            rate_per_ft3: Number(bunker.rate_per_ft3) || 0,
            minimum_amount: Number(bunker.minimum_amount) || 0,
            currency: 'USD',
            is_active: bunker.is_active,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'code' }
        )

      if (bunkerError) {
        setSaving(false)
        toast.error(`Configuración guardada, pero falló el Bunker: ${bunkerError.message}`)
        return
      }

      setBunkerExists(true)
      setBunkerDirty(false)
    }

    setSaving(false)
    toast.success('Configuración guardada')
  }

  if (loading) return <PageSkeleton cards={3} rows={4} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
            Configuración
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Empresa</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Datos legales y de contacto usados en documentos y PDFs.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={primaryButtonClass}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          Solo el administrador puede modificar estos datos. Estás viendo la configuración en modo lectura.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Datos legales */}
        <section className={cardClass}>
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-slate-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Datos legales</h2>
          </div>
          <div className="space-y-4">
            <Field label="Razón social / Nombre legal">
              <input
                value={form.legal_name ?? ''}
                onChange={(e) => set('legal_name', e.target.value)}
                disabled={!isAdmin}
                placeholder="Ej. SARI EXPRESS S DE R.L. DE C.V."
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Nombre comercial">
              <input
                value={form.trade_name ?? ''}
                onChange={(e) => set('trade_name', e.target.value)}
                disabled={!isAdmin}
                placeholder="Ej. Sari Express"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="RTN">
              <input
                value={form.rtn ?? ''}
                onChange={(e) => set('rtn', e.target.value)}
                disabled={!isAdmin}
                placeholder="Ej. 08019003239182"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
          </div>
        </section>

        {/* Dirección */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Dirección</h2>
          <div className="space-y-4">
            <Field label="Dirección">
              <input
                value={form.address ?? ''}
                onChange={(e) => set('address', e.target.value)}
                disabled={!isAdmin}
                placeholder="Calle, número, colonia..."
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Ciudad">
                <input
                  value={form.city ?? ''}
                  onChange={(e) => set('city', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Ej. San Pedro Sula"
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
              <Field label="Código postal">
                <input
                  value={form.zip_code ?? ''}
                  onChange={(e) => set('zip_code', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Ej. 21101"
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
            </div>
            <Field label="País">
              <input
                value={form.country ?? ''}
                onChange={(e) => set('country', e.target.value)}
                disabled={!isAdmin}
                placeholder="Honduras"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
          </div>
        </section>

        {/* Contacto */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Contacto</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Teléfono principal">
                <input
                  value={form.phone ?? ''}
                  onChange={(e) => set('phone', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="+504 2553-0000"
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
              <Field label="Teléfono secundario">
                <input
                  value={form.phone_2 ?? ''}
                  onChange={(e) => set('phone_2', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="+504 ..."
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
            </div>
            <Field label="Correo electrónico">
              <input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                disabled={!isAdmin}
                placeholder="operaciones@sariexpress.com"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Sitio web">
              <input
                value={form.website ?? ''}
                onChange={(e) => set('website', e.target.value)}
                disabled={!isAdmin}
                placeholder="https://sariexpress.com"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Logo para documentos">
              <input
                value={form.logo_url ?? ''}
                onChange={(e) => set('logo_url', e.target.value)}
                disabled={!isAdmin}
                placeholder="/logo/sari-logo.png"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
          </div>
        </section>

        {/* Facturación */}
        <section className={cardClass}>
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Configuración de facturación</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Moneda predeterminada">
                <select
                  value={form.default_currency ?? 'USD'}
                  onChange={(e) => set('default_currency', e.target.value)}
                  disabled={!isAdmin}
                  className={`${fieldClass} disabled:opacity-60`}
                >
                  <option value="USD">USD</option>
                  <option value="HNL">HNL</option>
                </select>
              </Field>
              <Field label="ISV / Impuesto (%)">
                <input
                  type="number"
                  value={form.default_tax_rate ?? 15}
                  onChange={(e) => set('default_tax_rate', Number(e.target.value))}
                  disabled={!isAdmin}
                  min="0"
                  max="100"
                  step="0.01"
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Lugar de emisión (SAR)">
                <input
                  value={form.lugar_emision_defecto ?? ''}
                  onChange={(e) => set('lugar_emision_defecto', e.target.value)}
                  disabled={!isAdmin}
                  placeholder="Ej. San Pedro Sula, Honduras"
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
              <Field label="Tipo de cambio USD → HNL">
                <input
                  type="number"
                  value={form.exchange_rate_usd_hnl ?? 25.30}
                  onChange={(e) => set('exchange_rate_usd_hnl', Number(e.target.value))}
                  disabled={!isAdmin}
                  min="1"
                  step="0.0001"
                  placeholder="25.3000"
                  className={`${fieldClass} disabled:opacity-60`}
                />
              </Field>
            </div>
            <Field label="Nota de pie de factura">
              <textarea
                value={form.invoice_footer_note ?? ''}
                onChange={(e) => set('invoice_footer_note', e.target.value)}
                disabled={!isAdmin}
                rows={3}
                placeholder="Ej. Gracias por su preferencia. Pagos en cuenta Bancatlán #0001234..."
                className={`${fieldClass} resize-none disabled:opacity-60`}
              />
            </Field>
          </div>
        </section>
      </div>

      {/* Dirección de recepción en Miami */}
      <section className={cardClass}>
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Seguro de carga Full Cover
          </h2>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Porcentaje que cobra la aseguradora sobre la base asegurada de costo.
          Ingrese 0.28 para representar 0.28%.
        </p>
        <div className="max-w-xs">
          <Field label="Costo de seguro (%)">
            <input
              type="number"
              value={
                form.insurance_cost_rate_percent ??
                DEFAULT_INSURANCE_COST_RATE_PERCENT
              }
              onChange={(e) =>
                set('insurance_cost_rate_percent', Number(e.target.value))
              }
              disabled={!isAdmin}
              min="0.0001"
              max="5"
              step="0.0001"
              className={`${fieldClass} disabled:opacity-60`}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          El cambio se utiliza al calcular o actualizar líneas de seguro. Los
          importes ya guardados no se alteran automáticamente.
        </p>
      </section>

      <section className={cardClass}>
        <div className="mb-1 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Dirección de recepción en Miami</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Esta dirección se muestra en el portal del cliente en "Mis direcciones". El código del cliente se agrega automáticamente como identificador de suite.
        </p>
        <div className="space-y-4">
          <Field label="Nombre del consignatario">
            <input
              value={form.miami_consignee ?? ''}
              onChange={(e) => set('miami_consignee', e.target.value)}
              disabled={!isAdmin}
              placeholder="Ej. SARI EXPRESS"
              className={`${fieldClass} disabled:opacity-60`}
            />
          </Field>
          <Field label="Dirección">
            <input
              value={form.miami_address_line ?? ''}
              onChange={(e) => set('miami_address_line', e.target.value)}
              disabled={!isAdmin}
              placeholder="Ej. 5000 NW 74th Ave"
              className={`${fieldClass} disabled:opacity-60`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Prefijo de suite (antes del código de cliente)">
              <input
                value={form.miami_suite_prefix ?? ''}
                onChange={(e) => set('miami_suite_prefix', e.target.value)}
                disabled={!isAdmin}
                placeholder="Ej. Suite  ó  Ste.  ó  #"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={form.miami_phone ?? ''}
                onChange={(e) => set('miami_phone', e.target.value)}
                disabled={!isAdmin}
                placeholder="+1 (305) 000-0000"
                type="tel"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Ciudad">
              <input
                value={form.miami_city ?? ''}
                onChange={(e) => set('miami_city', e.target.value)}
                disabled={!isAdmin}
                placeholder="Miami"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Estado">
              <input
                value={form.miami_state ?? ''}
                onChange={(e) => set('miami_state', e.target.value)}
                disabled={!isAdmin}
                placeholder="FL"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="ZIP">
              <input
                value={form.miami_zip ?? ''}
                onChange={(e) => set('miami_zip', e.target.value)}
                disabled={!isAdmin}
                placeholder="33166"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
          </div>
          <Field label="País">
            <input
              value={form.miami_country ?? ''}
              onChange={(e) => set('miami_country', e.target.value)}
              disabled={!isAdmin}
              placeholder="USA"
              className={`${fieldClass} disabled:opacity-60`}
            />
          </Field>
          {form.miami_address_line && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Vista previa (cliente con código SE-001)</p>
              <div className="font-mono text-sm leading-relaxed text-blue-900 dark:text-blue-100">
                {form.miami_consignee && <p>{form.miami_consignee}</p>}
                <p>
                  {form.miami_address_line}
                  {(form.miami_suite_prefix || form.miami_address_line) && ' '}
                  {form.miami_suite_prefix ?? ''}SE-001
                </p>
                <p>{form.miami_city}, {form.miami_state} {form.miami_zip}</p>
                <p>{form.miami_country}</p>
                {form.miami_phone && <p>Tel: {form.miami_phone}</p>}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Bunker Emergency Surcharge */}
      <section className={cardClass}>
        <div className="mb-1 flex items-center gap-2">
          <Fuel className="h-5 w-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Bunker Emergency Surcharge — Miami LCL</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Recargo automático en cotizaciones Miami LCL. Se calcula como MAX(lbs × tarifa LBS, ft3 × tarifa FT3, mínimo). Los cambios aplican a cotizaciones nuevas o recalculadas; las ya cotizadas conservan su monto.
        </p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nombre del recargo (aparece en el PDF)">
              <input
                value={bunker.label}
                onChange={(e) => setBunkerField('label', e.target.value)}
                disabled={!isAdmin}
                placeholder="Bunker Emergency Surcharge"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Estado">
              <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={bunker.is_active}
                  onChange={(e) => setBunkerField('is_active', e.target.checked)}
                  disabled={!isAdmin}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                />
                Recargo activo (si se desactiva, no se agrega a nuevas cotizaciones)
              </label>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Tarifa por LBS (USD)">
              <input
                type="number"
                value={bunker.rate_per_lbs}
                onChange={(e) => setBunkerField('rate_per_lbs', Number(e.target.value))}
                disabled={!isAdmin}
                min="0"
                step="0.0001"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Tarifa por FT3 (USD)">
              <input
                type="number"
                value={bunker.rate_per_ft3}
                onChange={(e) => setBunkerField('rate_per_ft3', Number(e.target.value))}
                disabled={!isAdmin}
                min="0"
                step="0.0001"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
            <Field label="Mínimo (USD)">
              <input
                type="number"
                value={bunker.minimum_amount}
                onChange={(e) => setBunkerField('minimum_amount', Number(e.target.value))}
                disabled={!isAdmin}
                min="0"
                step="0.01"
                className={`${fieldClass} disabled:opacity-60`}
              />
            </Field>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/50 dark:bg-amber-950/30">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Ejemplo (1,000 lbs / 45 ft3)</p>
            <p className="font-mono text-sm text-amber-900 dark:text-amber-100">
              MAX(1,000 × {Number(bunker.rate_per_lbs || 0).toFixed(4)}, 45 × {Number(bunker.rate_per_ft3 || 0).toFixed(4)}, {Number(bunker.minimum_amount || 0).toFixed(2)}) = USD{' '}
              {Math.max(
                1000 * (Number(bunker.rate_per_lbs) || 0),
                45 * (Number(bunker.rate_per_ft3) || 0),
                Number(bunker.minimum_amount) || 0
              ).toFixed(2)}
            </p>
          </div>
        </div>
      </section>

      {/* Plantilla de correo para cotizaciones */}
      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          Plantilla de correo — Cotizaciones
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Texto de cierre que aparece al final del correo de cotización. El sistema incluye automáticamente los datos del servicio y la tarifa.
        </p>
        <Field label="Texto de cierre del correo">
          <textarea
            value={form.plantilla_cotizacion ?? ''}
            onChange={(e) => set('plantilla_cotizacion', e.target.value)}
            disabled={!isAdmin}
            rows={4}
            placeholder={'Saludos cordiales,\nSari Express — Equipo Comercial\noperaciones@sariexpress.com'}
            className={`${fieldClass} resize-none disabled:opacity-60`}
          />
        </Field>
      </section>

      {/* Condiciones en documentos */}
      <section className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">
          Condiciones en documentos de transporte
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Texto que aparece al pie de cada tipo de documento. Dejar vacío para omitir la sección.
        </p>
        <div className="space-y-4">
          <Field label="Condiciones — House Bill of Lading (HBL)">
            <textarea
              value={form.condiciones_bl ?? ''}
              onChange={(e) => set('condiciones_bl', e.target.value)}
              disabled={!isAdmin}
              rows={4}
              placeholder="Texto de términos y condiciones para el HBL marítimo..."
              className={`${fieldClass} resize-none disabled:opacity-60`}
            />
          </Field>
          <Field label="Condiciones — Air Waybill (AWB)">
            <textarea
              value={form.condiciones_awb ?? ''}
              onChange={(e) => set('condiciones_awb', e.target.value)}
              disabled={!isAdmin}
              rows={4}
              placeholder="Texto de términos y condiciones para el AWB aéreo..."
              className={`${fieldClass} resize-none disabled:opacity-60`}
            />
          </Field>
          <Field label="Condiciones — Carta Porte">
            <textarea
              value={form.condiciones_carta_porte ?? ''}
              onChange={(e) => set('condiciones_carta_porte', e.target.value)}
              disabled={!isAdmin}
              rows={4}
              placeholder="Texto de términos y condiciones para la Carta Porte terrestre..."
              className={`${fieldClass} resize-none disabled:opacity-60`}
            />
          </Field>
        </div>
      </section>

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={primaryButtonClass}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  )
}
