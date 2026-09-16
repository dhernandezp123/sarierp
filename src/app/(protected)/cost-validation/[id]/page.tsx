'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { CostAnalysisPanel, costMoney } from '@/src/components/pricing/CostAnalysisPanel'
import { analyzeCosts, costCurrency, costNumber } from '@/src/lib/cost-analysis'
import { loadCostValidationData, type CostValidationData } from '@/src/lib/cost-validation-data'
import { calculateTaxAmount } from '@/src/lib/tax'
import { formatDate } from '@/src/lib/format'
import { cardClass, fieldClassSm } from '@/src/lib/ui-classes'

const buttonClass = 'rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800'
const emptyForm = { pricing_item_id: '', supplier: '', invoice_number: '', description: '', quantity: '1', unit_cost: '', currency: 'USD', tax_rate_id: '', invoice_date: '', is_taxable: false, notes: '' }

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm"><span className="font-medium">{label}</span>{children}</label>
}

export default function CostValidationDetailPage() {
  const { user, profile, loading } = useUser()
  const params = useParams<{ id: string }>()
  if (loading) return <p className="p-8">Cargando validación...</p>
  if (!user || !profile || !profile.is_active || profile.status !== 'Aprobado' || !['Admin', 'Finanzas', 'Contabilidad'].includes(profile.rol)) {
    return <div className={cardClass}><h1 className="text-xl font-bold">Acceso restringido</h1><p>No tienes permiso para ver este módulo.</p></div>
  }
  return <CostValidation key={user.id + ':' + profile.rol + ':' + params.id} quotationId={params.id} userId={user.id} />
}

function CostValidation({ quotationId, userId }: { quotationId: string; userId: string }) {
  const [data, setData] = useState<CostValidationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [confirmValidation, setConfirmValidation] = useState(false)
  const version = useRef(0)
  const mounted = useRef(true)
  const mutating = useRef(false)
  const refresh = useCallback(async () => {
    const request = ++version.current
    const current = () => mounted.current && request === version.current
    setLoading(true); setError(''); setData(null)
    try {
      const result = await loadCostValidationData(supabase, quotationId, current)
      if (current()) setData(result)
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : 'No se pudieron cargar los costos.')
    } finally { if (current()) setLoading(false) }
  }, [quotationId])
  useEffect(() => {
    mounted.current = true
    const requests = version
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => { mounted.current = false; requests.current++; window.clearTimeout(timer) }
  }, [refresh])

  async function mutate(action: () => Promise<void>, message: string) {
    if (mutating.current || !data) return
    mutating.current = true; setBusy(true)
    try {
      await action()
      if (mounted.current) { toast.success(message); await refresh() }
    } catch (e) {
      if (mounted.current) toast.error(e instanceof Error ? e.message : 'No se pudo guardar el cambio.')
    } finally { mutating.current = false; if (mounted.current) setBusy(false) }
  }

  const selectPricing = (id: string) => {
    const item = data?.pricing.find(p => p.id === id)
    setForm(previous => item ? { ...previous, pricing_item_id: id, supplier: item.supplier || '', description: item.description, currency: costCurrency(item.currency), quantity: String(item.quantity ?? ''), unit_cost: String(item.cost_amount ?? '') } : { ...previous, pricing_item_id: '' })
  }
  async function saveInvoice(event: FormEvent) {
    event.preventDefault()
    if (!data) return
    const quantity = costNumber(form.quantity), unitCost = costNumber(form.unit_cost)
    const linked = data.pricing.find(p => p.id === form.pricing_item_id)
    if (!form.description.trim() || quantity === null || quantity <= 0 || unitCost === null) {
      toast.error('Ingresa descripción, cantidad mayor a cero y costo unitario válido.'); return
    }
    if (costCurrency(form.currency) === 'Sin moneda') {
      toast.error('Revisa la moneda del cargo antes de registrar el costo.'); return
    }
    if (form.pricing_item_id && (!linked || costCurrency(linked.currency) !== form.currency)) {
      toast.error('El cargo debe pertenecer a esta cotización y tener la misma moneda.'); return
    }
    const tax = data.taxes.find(t => t.id === form.tax_rate_id)
    if (form.is_taxable && (!tax || costNumber(tax.percentage) === null)) {
      toast.error('Selecciona una tasa válida para el impuesto.'); return
    }
    const percentage = form.is_taxable ? Number(tax!.percentage) : 0
    const total = quantity * unitCost
    if (!Number.isFinite(total) || !Number.isFinite(calculateTaxAmount(form.is_taxable, total, percentage))) {
      toast.error('El importe supera el rango permitido.'); return
    }
    await mutate(async () => {
      const result = await supabase.from('provider_invoice_items').insert({
        quotation_id: quotationId, pricing_item_id: linked?.id || null,
        supplier: form.supplier.trim() || null, invoice_number: form.invoice_number.trim() || null,
        description: form.description.trim(), quantity, unit_cost: unitCost, total_cost: total,
        currency: form.currency, tax_rate_id: form.is_taxable ? tax!.id : null,
        tax_percentage_snapshot: percentage, tax_amount: calculateTaxAmount(form.is_taxable, total, percentage),
        invoice_date: form.invoice_date || null, is_taxable: form.is_taxable,
        notes: form.notes.trim() || null, created_by: userId,
      }).select('id').single()
      if (result.error || !result.data) throw new Error(result.error?.message || 'No se guardó el costo.')
      if (mounted.current) setForm(emptyForm)
    }, 'Costo de proveedor registrado')
  }

  if (loading) return <p className="p-8" role="status">Cargando validación...</p>
  if (error || !data) return <section className={cardClass} role="alert"><h1 className="text-xl font-bold">No se pudo cargar la validación</h1><p className="my-3">{error}</p><button className={buttonClass} onClick={() => void refresh()}>Reintentar</button></section>

  const financiallyValidated = data.quotation.status === 'Ganada' && data.quotation.financial_validation_status === 'Validado'
  const groups = analyzeCosts(data.pricing, data.invoices, financiallyValidated)
  const canValidate = data.quotation.status === 'Ganada' && groups.length > 0 && groups.every(g => g.reconciled)
  const validationReason = data.quotation.status !== 'Ganada' ? 'La cotización debe estar Ganada para validar.'
    : !canValidate ? 'Vincula los costos con sus cargos cotizados y revisa las monedas e importes antes de validar. Los cargos adicionales deben conciliarse con Pricing.'
    : 'Tener registros vinculados no confirma que todas las facturas hayan llegado; Finanzas debe revisar su alcance antes de validar.'

  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap gap-3">
      <Link className={buttonClass} href="/cost-validation">Volver a Validación</Link>
      <Link className={buttonClass} href={'/quotations/' + quotationId}>Ver cotización</Link>
      <button disabled={busy} className={buttonClass} onClick={() => void refresh()}>Actualizar</button>
    </div>
    <header><h1 className="text-3xl font-bold">Validación de Costos</h1>
      <p className="mt-2">{data.quotation.quotation_number} · {data.quotation.clientName} · {data.quotation.status}</p>
      <p className="text-sm">Estado financiero: {data.quotation.financial_validation_status || 'Pendiente'}</p>
    </header>
    <section className={cardClass}>
      <h2 className="font-bold">Base de comparación</h2>
      <p className="mt-2 text-sm">El detalle utiliza las líneas de Pricing actuales. La opción aceptada se conserva como referencia histórica independiente.</p>
      {data.options.map(option => <p key={option.id} className="mt-2 text-sm">
        Opción aceptada {option.option_code} — {option.label} ({formatDate(option.accepted_at)}):
        {' '}costo {costMoney(costNumber(option.cost_total), option.currency)}; venta sin impuesto {costMoney(costNumber(option.sale_subtotal), option.currency)}.
      </p>)}
      {!data.options.length && <p className="mt-2 text-sm">Sin opción aceptada disponible.</p>}
      {data.quotation.status === 'Pendiente de Fijar Precios' && <p className="mt-2 font-medium text-amber-700 dark:text-amber-300">Cotización en revisión de precios. Los valores actuales pueden diferir del presupuesto aceptado.</p>}
    </section>
    <section className={cardClass}>
      <h2 className="font-bold">Operaciones vinculadas</h2>
      {!data.shipments.length && <p className="mt-2 text-sm">Sin operación vinculada.</p>}
      {data.shipments.map(shipment => <div key={shipment.id} className="mt-3 text-sm">
        <p className="font-semibold">{shipment.shipment_number} · {shipment.operational_status}</p>
        {shipment.bookings.map(booking => <p key={booking.id}>
          {booking.booking_number || booking.carrier_booking || 'Booking sin número'} · {booking.carrier || 'Carrier pendiente'} · {booking.shipment_status || 'Estado pendiente'} ·
          {' '}{booking.booking_containers.length ? booking.booking_containers.map(c => c.quantity + ' × ' + c.container_type).join(', ') : 'Sin contenedores operativos registrados'}
          {' '}· ETD {formatDate(booking.etd)} · ETA {formatDate(booking.eta)}
        </p>)}
      </div>)}
      <p className="mt-3 text-sm text-slate-500">Costos a nivel de cotización; no están asignados individualmente a bookings, BL o contenedores.</p>
    </section>

    <CostAnalysisPanel pricing={data.pricing} invoices={data.invoices} containers={data.containers} agent={data.agent} validated={financiallyValidated} />

    <section className={cardClass}>
      <h2 className="text-xl font-bold">Registrar factura de proveedor</h2>
      <p className="mt-2 text-sm">Selecciona el cargo cotizado y ajusta cantidad e importe a la factura recibida. Puedes registrar varias facturas por cargo.</p>
      <form onSubmit={saveInvoice} className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Cargo cotizado"><select className={fieldClassSm} value={form.pricing_item_id} disabled={busy} onChange={e => selectPricing(e.target.value)}>
          <option value="">Sin vínculo — pendiente de conciliación</option>
          {data.pricing.map(p => <option key={p.id} value={p.id}>{p.description} · {p.supplier || 'Sin proveedor'} · {p.currency}</option>)}
        </select></Field>
        <Field label="Proveedor"><input className={fieldClassSm} value={form.supplier} disabled={busy} onChange={e => setForm({ ...form, supplier: e.target.value })} /></Field>
        <Field label="Número de factura"><input className={fieldClassSm} value={form.invoice_number} disabled={busy} onChange={e => setForm({ ...form, invoice_number: e.target.value })} /></Field>
        <Field label="Descripción del cargo"><input required className={fieldClassSm} value={form.description} disabled={busy} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Cantidad facturada"><input required type="number" min="0.000001" step="any" className={fieldClassSm} value={form.quantity} disabled={busy} onChange={e => setForm({ ...form, quantity: e.target.value })} /></Field>
        <Field label="Costo unitario sin impuesto"><input required type="number" min="0" step="any" className={fieldClassSm} value={form.unit_cost} disabled={busy} onChange={e => setForm({ ...form, unit_cost: e.target.value })} /></Field>
        <Field label="Moneda"><select className={fieldClassSm} value={form.currency} disabled={busy || !!form.pricing_item_id} onChange={e => setForm({ ...form, currency: e.target.value })}>
          {[...new Set(['USD', 'HNL', ...data.pricing.map(p => costCurrency(p.currency))])].filter(c => c !== 'Sin moneda').map(c => <option key={c}>{c}</option>)}
        </select></Field>
        <Field label="Fecha de factura"><input type="date" className={fieldClassSm} value={form.invoice_date} disabled={busy} onChange={e => setForm({ ...form, invoice_date: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_taxable} disabled={busy} onChange={e => setForm({ ...form, is_taxable: e.target.checked })} />Aplicar impuesto de proveedor</label>
        <Field label="Tasa de impuesto"><select className={fieldClassSm} value={form.tax_rate_id} disabled={busy || !form.is_taxable} onChange={e => setForm({ ...form, tax_rate_id: e.target.value })}>
          <option value="">Selecciona una tasa</option>
          {data.taxes.map(t => <option key={t.id} value={t.id}>{t.country} — {t.tax_name} ({t.percentage}%)</option>)}
        </select></Field>
        <Field label="Notas"><textarea className={fieldClassSm} value={form.notes} disabled={busy} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        <div className="flex items-end"><button className={buttonClass} disabled={busy} type="submit">{busy ? 'Guardando...' : 'Agregar costo de proveedor'}</button></div>
      </form>
    </section>
    <section className={cardClass}>
      <h2 className="text-xl font-bold">Facturas registradas y conciliación</h2>
      <p className="mt-2 text-sm">Los registros sin vínculo no se emparejan por descripción. Selecciona su cargo para conciliar; cambiar el vínculo devuelve la validación a Pendiente.</p>
      {!data.invoices.length ? <p className="mt-4">No hay costos de proveedor registrados.</p> : <div className="mt-4 overflow-x-auto rounded-xl border dark:border-slate-700">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-100 text-left dark:bg-slate-800"><tr>{['Factura / proveedor', 'Concepto / fecha', 'Cantidad', 'Costo unitario', 'Base', 'Impuesto', 'Total con impuesto', 'Cargo cotizado', 'Acción'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
          <tbody>{data.invoices.map(item => {
            const currency = costCurrency(item.currency), base = costNumber(item.total_cost), tax = costNumber(item.tax_amount)
            const eligible = data.pricing.filter(p => costCurrency(p.currency) === currency)
            return <tr key={item.id} className="border-t dark:border-slate-700">
              <td className="p-3">{item.invoice_number || 'Sin número'}<p className="text-xs">{item.supplier || 'Sin proveedor'}</p></td>
              <td className="p-3">{item.description}<p className="text-xs">{formatDate(item.invoice_date)}</p></td>
              <td className="p-3">{item.quantity}</td>
              <td className="p-3">{costMoney(costNumber(item.unit_cost), currency)}</td>
              <td className="p-3">{costMoney(base, currency)}</td><td className="p-3">{costMoney(tax, currency)}</td>
              <td className="p-3">{costMoney(base === null || tax === null ? null : base + tax, currency)}</td>
              <td className="p-3"><select aria-label={'Cargo cotizado para ' + item.description + ' ' + (item.invoice_number || item.id)} className={fieldClassSm} disabled={busy}
                value={eligible.some(p => p.id === item.pricing_item_id) ? item.pricing_item_id! : ''}
                onChange={e => {
                  const pricingId = e.target.value
                  if (pricingId && !eligible.some(p => p.id === pricingId)) return
                  void mutate(async () => {
                    // Updating description to its existing value also invokes the existing financial invalidation trigger.
                    const result = await supabase.from('provider_invoice_items').update({ pricing_item_id: pricingId || null, description: item.description })
                      .eq('id', item.id).eq('quotation_id', quotationId).is('deleted_at', null).select('id').single()
                    if (result.error || !result.data) throw new Error(result.error?.message || 'No se pudo vincular el costo.')
                  }, 'Conciliación actualizada; revisa la validación financiera')
                }}>
                <option value="">Sin vínculo — revisar</option>{eligible.map(p => <option key={p.id} value={p.id}>{p.description} · {p.supplier || 'Sin proveedor'}</option>)}
              </select></td>
              <td className="p-3"><button className={buttonClass} disabled={busy} onClick={() => setDeleteId(item.id)}>Eliminar</button></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </section>
    <section className={cardClass}>
      <h2 className="font-bold">Revisión financiera</h2><p className="my-3 text-sm">{validationReason}</p>
      {data.quotation.financial_validation_status !== 'Validado' && <button className={buttonClass} disabled={busy || !canValidate} onClick={() => setConfirmValidation(true)}>Marcar como validado</button>}
      {financiallyValidated && <Link className={buttonClass} href={data.customerInvoice ? '/invoicing/' + data.customerInvoice.id : '/invoicing/new?quotation=' + quotationId}>
        {data.customerInvoice ? 'Ver factura ' + (data.customerInvoice.invoice_number || '') : 'Generar factura'}
      </Link>}
    </section>
    <ConfirmDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null) }} title="Eliminar costo de proveedor" description="Se eliminará este registro y se deberá revisar nuevamente la validación financiera." confirmLabel="Eliminar" danger onConfirm={() => {
      if (!deleteId) return
      const target = deleteId
      void mutate(async () => {
        const result = await supabase.from('provider_invoice_items').delete().eq('id', target).eq('quotation_id', quotationId).select('id').single()
        if (result.error || !result.data) throw new Error(result.error?.message || 'No se eliminó el registro.')
      }, 'Costo eliminado')
    }} />
    <ConfirmDialog open={confirmValidation} onOpenChange={setConfirmValidation} title="Confirmar revisión completa" description="Confirma que recibiste todas las facturas y revisaste cantidades, cargos adicionales e impuestos. La presencia de un registro por cargo no garantiza que la facturación esté completa." confirmLabel="Validar costos" onConfirm={() => {
      if (!canValidate) return
      void mutate(async () => {
        const result = await supabase.from('quotations').update({ financial_validation_status: 'Validado' }).eq('id', quotationId).eq('status', 'Ganada').select('id').single()
        if (result.error || !result.data) throw new Error(result.error?.message || 'La cotización cambió; actualiza antes de validar.')
      }, 'Costos validados')
    }} />
  </div>
}
