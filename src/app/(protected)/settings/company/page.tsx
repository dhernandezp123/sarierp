'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Building2, Save } from 'lucide-react'
import { supabase } from '../../../../lib/supabase/client'
import { useUser } from '../../../../hooks/useUser'
import { PageSkeleton } from '@/src/components/ui/page-skeleton'
import { cardClass, fieldClass, primaryButtonClass } from '@/src/lib/ui-classes'

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
  invoice_footer_note: string | null
  lugar_emision_defecto: string | null
  exchange_rate_usd_hnl: number | null
  condiciones_bl: string | null
  condiciones_awb: string | null
  condiciones_carta_porte: string | null
  plantilla_cotizacion: string | null
}

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
    invoice_footer_note: '',
    lugar_emision_defecto: '',
    exchange_rate_usd_hnl: 25.30,
    condiciones_bl: '',
    condiciones_awb: '',
    condiciones_carta_porte: '',
    plantilla_cotizacion: '',
  })

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
        invoice_footer_note: data.invoice_footer_note ?? '',
        lugar_emision_defecto: data.lugar_emision_defecto ?? '',
        exchange_rate_usd_hnl: data.exchange_rate_usd_hnl ?? 25.30,
        condiciones_bl: (data as any).condiciones_bl ?? '',
        condiciones_awb: (data as any).condiciones_awb ?? '',
        condiciones_carta_porte: (data as any).condiciones_carta_porte ?? '',
        plantilla_cotizacion: (data as any).plantilla_cotizacion ?? '',
      })
    }
    setLoading(false)
  }

  const set = (key: keyof typeof form, value: string | number | null) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!isAdmin) { toast.error('Solo el Admin puede modificar esta configuración'); return }
    setSaving(true)

    const payload = {
      ...form,
      default_tax_rate: Number(form.default_tax_rate) || 15,
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

    setSaving(false)
    if (error) { toast.error(error.message); return }
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
