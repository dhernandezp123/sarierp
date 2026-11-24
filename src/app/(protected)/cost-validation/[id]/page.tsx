'use client'
import { FinanceNumberInput as NumberInput } from '@/src/components/ui/FinanceNumberInput'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, ClipboardCheck, Clock3, FileText, Info, Loader2, Plus, Receipt, RefreshCw, Scale, ShieldCheck, ShieldOff, Ship, Trash2, type LucideIcon } from 'lucide-react'
import { useUser } from '@/src/hooks/useUser'
import { supabase } from '@/src/lib/supabase/client'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CostAnalysisPanel, costMoney } from '@/src/components/pricing/CostAnalysisPanel'
import { CostNotice, CostProgress, CostStatusBadge, costIconTones, financialStatusTone, operationalStatusTone, quotationStatusTone, type CostTone } from '@/src/components/pricing/CostStatus'
import { FinanceEmptyState, FinancePageHeader, financeActionClass } from '@/src/components/invoicing/FinanceWorkspace'
import { analyzeCosts, costCurrency, costNumber } from '@/src/lib/cost-analysis'
import { loadCostValidationData, type CostValidationData } from '@/src/lib/cost-validation-data'
import { calculateTaxAmount } from '@/src/lib/tax'
import { formatDate } from '@/src/lib/format'
import { cardClass, fieldClassSm } from '@/src/lib/ui-classes'
import { billingReturnHref, operationsAreComplete } from '@/src/lib/billing-readiness'
import { ownCustomsZeroCostIds } from '@/src/lib/customs-quotation'
import { cn } from '@/src/lib/utils'

const primaryActionClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#B3282D] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9a2227] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-600 dark:hover:bg-rose-500 dark:focus-visible:ring-offset-slate-950'
const successActionClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950'
const dangerIconClass = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40'
const subheadClass = 'mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
const th = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
const emptyForm = { pricing_item_id: '', supplier: '', invoice_number: '', description: '', quantity: '1', unit_cost: '', currency: 'USD', tax_rate_id: '', invoice_date: '', is_taxable: false, notes: '' }
const pageEyebrow = 'Finanzas · Costos'

function DetailSkeleton() {
  return <div className="space-y-6" role="status" aria-label="Cargando validación">
    <div className="flex items-center gap-4"><div className="h-12 w-12 animate-pulse rounded-2xl bg-rose-50 dark:bg-rose-950/30" /><div className="space-y-2"><div className="h-3 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" /><div className="h-7 w-72 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" /></div></div>
    <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1220]" />
    <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map(i => <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1220]" />)}</div>
    <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1220]" />
    <span className="sr-only">Cargando validación...</span>
  </div>
}

function SectionTitle({ icon: Icon, tone = 'slate', children, aside }: { icon: LucideIcon; tone?: CostTone; children: string; aside?: ReactNode }) {
  const bg = { slate: 'bg-slate-100 dark:bg-slate-800', sky: 'bg-sky-50 dark:bg-sky-950/40', amber: 'bg-amber-50 dark:bg-amber-950/40', emerald: 'bg-emerald-50 dark:bg-emerald-950/40', red: 'bg-red-50 dark:bg-red-950/40' }[tone]
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <h2 className="flex items-center gap-3 text-base font-semibold text-slate-900 dark:text-white"><span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', bg, costIconTones[tone])}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>{children}</h2>{aside}
  </div>
}

type Step = { label: string; detail: string; state: 'done' | 'pending' | 'blocked' }
const stepStyle: Record<Step['state'], { icon: LucideIcon; tone: CostTone; text: string }> = {
  done: { icon: CheckCircle2, tone: 'emerald', text: 'Completo' },
  pending: { icon: Clock3, tone: 'amber', text: 'Pendiente' },
  blocked: { icon: CircleDashed, tone: 'slate', text: 'En espera' },
}

export default function CostValidationDetailPage() {
  const { user, profile, loading } = useUser()
  const params = useParams<{ id: string }>()
  if (loading) return <DetailSkeleton />
  if (!user || !profile || !profile.is_active || profile.status !== 'Aprobado' || !['Admin', 'Finanzas', 'Contabilidad'].includes(profile.rol)) {
    return <div className="space-y-6"><FinancePageHeader eyebrow={pageEyebrow} icon={ClipboardCheck} title="Validación de Costos" />
      <FinanceEmptyState icon={ShieldOff} title="Acceso restringido" description="No tienes permiso para ver este módulo." /></div>
  }
  return <CostValidation key={user.id + ':' + profile.rol + ':' + params.id} quotationId={params.id} userId={user.id} />
}

function CostValidation({ quotationId, userId }: { quotationId: string; userId: string }) {
  const rawReturnTo = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('returnTo')
  const returnHref = rawReturnTo ? billingReturnHref(rawReturnTo) : '/cost-validation'
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

  if (loading) return <DetailSkeleton />
  if (error || !data) return <div className="space-y-6" role="alert">
    <FinancePageHeader eyebrow={pageEyebrow} icon={ClipboardCheck} title="Validación de Costos" actions={<Link className={financeActionClass} href={returnHref}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Volver</Link>} />
    <FinanceEmptyState icon={AlertTriangle} title="No se pudo cargar la validación" description={error || 'Reintenta la consulta.'}>
      <button className={cn(financeActionClass, 'mt-5')} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className="h-4 w-4" />Reintentar</button>
    </FinanceEmptyState>
  </div>

  const financiallyValidated = data.quotation.status === 'Ganada' && data.quotation.financial_validation_status === 'Validado'
  const ownZeroCostIds = ownCustomsZeroCostIds(data.quotation.service_product, data.pricing)
  const groups = analyzeCosts(data.pricing, data.invoices, financiallyValidated, ownZeroCostIds)
  const operationsComplete = operationsAreComplete(data.shipments)
  const canValidate = operationsComplete && data.quotation.status === 'Ganada' && groups.length > 0 && groups.every(g => g.reconciled)
  const validationReason = data.quotation.status !== 'Ganada' ? 'La cotización debe estar Ganada para validar.'
    : !operationsComplete ? 'Todas las operaciones activas de la cotización deben estar finalizadas antes de validar los costos.'
    : !canValidate ? 'Vincula los costos con sus cargos cotizados y revisa las monedas e importes antes de validar. Los cargos adicionales deben conciliarse con Pricing.'
    : 'Tener registros vinculados no confirma que todas las facturas hayan llegado; Finanzas debe revisar su alcance antes de validar.'

  const financialStatus = data.quotation.financial_validation_status || 'Pendiente'
  const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0)
  const coveredRows = groups.reduce((sum, g) => sum + g.rows.length - g.missing.length, 0)
  const unmatched = groups.reduce((sum, g) => sum + g.unmatched.length, 0)
  const costsReconciled = groups.length > 0 && groups.every(g => g.reconciled)
  const won = data.quotation.status === 'Ganada'
  const steps: Step[] = [
    { label: 'Cotización ganada', detail: `Estado actual: ${data.quotation.status}`, state: won ? 'done' : 'pending' },
    { label: 'Operaciones finalizadas', detail: data.shipments.length ? `${data.shipments.filter(s => s.operational_status === 'Finalizado' && s.closed_at).length} de ${data.shipments.length} cerradas` : 'Sin operación vinculada', state: operationsComplete ? 'done' : 'pending' },
    { label: 'Cargos conciliados', detail: `${coveredRows} de ${totalRows} con registro${unmatched ? ` · ${unmatched} sin conciliar` : ''}`, state: costsReconciled ? 'done' : 'pending' },
    { label: 'Validación financiera', detail: financiallyValidated ? 'Registrada por Finanzas' : canValidate ? 'Lista para confirmar' : 'Requiere los pasos anteriores', state: financiallyValidated ? 'done' : canValidate ? 'pending' : 'blocked' },
  ]
  const doneSteps = steps.filter(s => s.state === 'done').length
  const reviewTone: CostTone = financiallyValidated ? 'emerald' : canValidate ? 'sky' : 'amber'
  const currencies = [...new Set(['USD', 'HNL', ...data.pricing.map(p => costCurrency(p.currency))])].filter(c => c !== 'Sin moneda')

  return <div className="min-w-0 space-y-6">
    <FinancePageHeader
      eyebrow={pageEyebrow}
      icon={ClipboardCheck}
      title={<>Validación de Costos <span className="text-slate-400 dark:text-slate-500">·</span> {data.quotation.quotation_number}</>}
      description={<span className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-700 dark:text-slate-200">{data.quotation.clientName}</span>
        <CostStatusBadge tone={quotationStatusTone(data.quotation.status)}>Cotización {data.quotation.status}</CostStatusBadge>
        <CostStatusBadge tone={financialStatusTone(financialStatus)} icon={financialStatus === 'Validado' ? ShieldCheck : Clock3}>Estado financiero: {financialStatus}</CostStatusBadge></span>}
      actions={<>
        <Link className={financeActionClass} href={returnHref}><ArrowLeft aria-hidden="true" className="h-4 w-4" />{rawReturnTo ? 'Volver a Por facturar' : 'Volver a Validación'}</Link>
        <Link className={financeActionClass} href={'/quotations/' + quotationId}><FileText aria-hidden="true" className="h-4 w-4" />Ver cotización</Link>
        <button disabled={busy} className={financeActionClass} onClick={() => void refresh()}><RefreshCw aria-hidden="true" className={cn('h-4 w-4', busy && 'animate-spin motion-reduce:animate-none')} />Actualizar</button>
      </>}
    />

    <section className={cardClass} aria-labelledby="validation-route">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="validation-route" className="text-base font-semibold text-slate-900 dark:text-white">Ruta de validación</h2>
        <span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">{doneSteps} de {steps.length} completos</span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const style = stepStyle[step.state]
          return <li key={step.label} className={cn('flex items-start gap-3 rounded-xl border p-3', step.state === 'done' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20' : step.state === 'pending' ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40')}>
            <style.icon aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', costIconTones[style.tone])} />
            <div className="min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white"><span className="text-slate-400 dark:text-slate-500">{index + 1}.</span> {step.label}</p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{step.detail}</p><p className="sr-only">{style.text}</p></div>
          </li>
        })}
      </ol>
      {totalRows > 0 && <div className="mt-4"><CostProgress done={coveredRows} total={totalRows} label="Cargos con registro de proveedor" tone={costsReconciled ? 'emerald' : 'amber'} /></div>}
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${cardClass} space-y-4`}>
        <SectionTitle icon={Scale} tone="sky">Base de comparación</SectionTitle>
        <p className="text-sm text-slate-600 dark:text-slate-300">El detalle utiliza las líneas de Pricing actuales. La opción aceptada se conserva como referencia histórica independiente.</p>
        {data.options.map(option => <div key={option.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">Opción aceptada {option.option_code} — {option.label}<span className="text-xs font-normal text-slate-500 dark:text-slate-400">({formatDate(option.accepted_at)})</span></p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">Costo</dt><dd className="font-semibold tabular-nums">{costMoney(costNumber(option.cost_total), option.currency)}</dd></div>
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">Venta sin impuesto</dt><dd className="font-semibold tabular-nums text-sky-700 dark:text-sky-300">{costMoney(costNumber(option.sale_subtotal), option.currency)}</dd></div>
          </dl>
        </div>)}
        {!data.options.length && <p className="text-sm text-slate-500 dark:text-slate-400">Sin opción aceptada disponible.</p>}
        {data.quotation.status === 'Pendiente de Fijar Precios' && <CostNotice tone="amber" icon={AlertTriangle}>Cotización en revisión de precios. Los valores actuales pueden diferir del presupuesto aceptado.</CostNotice>}
      </section>
      <section className={`${cardClass} space-y-4`}>
        <SectionTitle icon={Ship} tone={operationsComplete ? 'emerald' : 'amber'}>Operaciones vinculadas</SectionTitle>
        {!data.shipments.length && <p className="text-sm text-slate-500 dark:text-slate-400">Sin operación vinculada.</p>}
        {data.shipments.map(shipment => <div key={shipment.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900 dark:text-white">{shipment.shipment_number}</p>
            <CostStatusBadge tone={operationalStatusTone(shipment.operational_status)}>{shipment.operational_status}</CostStatusBadge>
            <span className="text-xs text-slate-500 dark:text-slate-400">cierre {formatDate(shipment.closed_at)}</span></div>
          {shipment.bookings.length > 0 && <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">{shipment.bookings.map(booking => <li key={booking.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium">{booking.booking_number || booking.carrier_booking || 'Booking sin número'}</span>
            <span className="text-slate-600 dark:text-slate-300">{booking.carrier || 'Carrier pendiente'}</span>
            <CostStatusBadge tone={operationalStatusTone(booking.shipment_status)}>{booking.shipment_status || 'Estado pendiente'}</CostStatusBadge>
            {booking.booking_containers.length
              ? booking.booking_containers.map((c, i) => <span key={i} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-300">{c.quantity} × {c.container_type}</span>)
              : <span className="text-xs text-slate-500 dark:text-slate-400">Sin contenedores operativos registrados</span>}
            <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">ETD {formatDate(booking.etd)} · ETA {formatDate(booking.eta)}</span>
          </li>)}</ul>}
        </div>)}
        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Costos a nivel de cotización; no están asignados individualmente a bookings, BL o contenedores.</p>
      </section>
    </div>

    {ownZeroCostIds.length > 0 && <CostNotice tone="sky" icon={Info}>Los honorarios propios de aduanas tienen costo externo cero. Finanzas debe confirmar ese costo al validar; la entrega final y los cargos con costo requieren conciliación de proveedor.</CostNotice>}
    <CostAnalysisPanel pricing={data.pricing} invoices={data.invoices} containers={data.containers} agent={data.agent} validated={financiallyValidated} ownZeroCostIds={ownZeroCostIds} />

    <section className={cardClass}>
      <FormSection title="Registrar factura de proveedor" description="Selecciona el cargo cotizado y ajusta cantidad e importe a la factura recibida. Puedes registrar varias facturas por cargo.">
        <form onSubmit={saveInvoice} className="space-y-6">
          <div>
            <p className={subheadClass}>Cargo y documento</p>
            <div className="finance-field-row">
              <FormField label="Cargo cotizado" className="sm:!basis-[22rem]"><select className={fieldClassSm} value={form.pricing_item_id} disabled={busy} onChange={e => selectPricing(e.target.value)}>
                <option value="">Sin vínculo — pendiente de conciliación</option>
                {data.pricing.map(p => <option key={p.id} value={p.id}>{p.description} · {p.supplier || 'Sin proveedor'} · {p.currency}</option>)}
              </select></FormField>
              <FormField label="Proveedor"><input className={fieldClassSm} value={form.supplier} disabled={busy} onChange={e => setForm({ ...form, supplier: e.target.value })} /></FormField>
              <FormField label="Número de factura" className="sm:!max-w-[14rem]"><input className={fieldClassSm} value={form.invoice_number} disabled={busy} onChange={e => setForm({ ...form, invoice_number: e.target.value })} /></FormField>
              <FormField label="Fecha de factura"><input type="date" className={fieldClassSm} value={form.invoice_date} disabled={busy} onChange={e => setForm({ ...form, invoice_date: e.target.value })} /></FormField>
            </div>
          </div>
          <div>
            <p className={subheadClass}>Importe</p>
            <div className="finance-field-row">
              <FormField label="Descripción del cargo" required className="sm:!basis-[22rem]"><input required className={fieldClassSm} value={form.description} disabled={busy} onChange={e => setForm({ ...form, description: e.target.value })} /></FormField>
              <FormField label="Cantidad facturada" required><NumberInput numericKind="quantity" required type="number" min="0.000001" step="any" value={form.quantity} disabled={busy} onChange={e => setForm({ ...form, quantity: e.target.value })} /></FormField>
              <FormField label="Costo unitario sin impuesto" required><NumberInput numericKind="money" required type="number" min="0" step="any" value={form.unit_cost} disabled={busy} onChange={e => setForm({ ...form, unit_cost: e.target.value })} /></FormField>
              <FormField label="Moneda" financeSize="quantity" hint={form.pricing_item_id ? 'Del cargo cotizado' : undefined}><select className={fieldClassSm} value={form.currency} disabled={busy || !!form.pricing_item_id} onChange={e => setForm({ ...form, currency: e.target.value })}>
                {currencies.map(c => <option key={c}>{c}</option>)}
              </select></FormField>
            </div>
          </div>
          <div>
            <p className={subheadClass}>Impuesto y notas</p>
            <div className="finance-field-row">
              <FormField label="Impuesto de proveedor" as="div" financeSize="choice">
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"><input type="checkbox" className="h-4 w-4 accent-[#B3282D]" checked={form.is_taxable} disabled={busy} onChange={e => setForm({ ...form, is_taxable: e.target.checked })} />Aplicar impuesto</label>
              </FormField>
              <FormField label="Tasa de impuesto" required={form.is_taxable}><select className={fieldClassSm} value={form.tax_rate_id} disabled={busy || !form.is_taxable} onChange={e => setForm({ ...form, tax_rate_id: e.target.value })}>
                <option value="">Selecciona una tasa</option>
                {data.taxes.map(t => <option key={t.id} value={t.id}>{t.country} — {t.tax_name} ({t.percentage}%)</option>)}
              </select></FormField>
              <FormField label="Notas" className="sm:!basis-[22rem]"><textarea rows={2} className="min-h-[5rem] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950" value={form.notes} disabled={busy} onChange={e => setForm({ ...form, notes: e.target.value })} /></FormField>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" className={financeActionClass} disabled={busy} onClick={() => setForm(emptyForm)}>Limpiar</button>
            <button className={primaryActionClass} disabled={busy} type="submit">{busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden="true" className="h-4 w-4" />}{busy ? 'Guardando...' : 'Agregar costo de proveedor'}</button>
          </div>
        </form>
      </FormSection>
    </section>

    <section className={`${cardClass} space-y-4`}>
      <SectionTitle icon={Receipt} tone={unmatched ? 'red' : 'slate'} aside={<span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">{data.invoices.length} registro(s)</span>}>Facturas registradas y conciliación</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-300">Los registros sin vínculo no se emparejan por descripción. Selecciona su cargo para conciliar; cambiar el vínculo devuelve la validación a Pendiente.</p>
      {!data.invoices.length ? <FinanceEmptyState icon={Receipt} title="Sin facturas de proveedor" description="No hay costos de proveedor registrados." /> : <div className="relative overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700" tabIndex={0} role="region" aria-label="Facturas registradas, desplazamiento horizontal">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-900/60"><tr>
            {['Factura / proveedor', 'Concepto / fecha'].map(h => <th key={h} scope="col" className={th}>{h}</th>)}
            {['Cantidad', 'Costo unitario', 'Base', 'Impuesto', 'Total con impuesto'].map(h => <th key={h} scope="col" className={`${th} text-right`}>{h}</th>)}
            <th scope="col" className={th}>Cargo cotizado</th><th scope="col" className={`${th} text-right`}><span className="sr-only">Acción</span></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{data.invoices.map(item => {
            const currency = costCurrency(item.currency), base = costNumber(item.total_cost), tax = costNumber(item.tax_amount)
            const eligible = data.pricing.filter(p => costCurrency(p.currency) === currency)
            const isLinked = eligible.some(p => p.id === item.pricing_item_id)
            return <tr key={item.id} className={cn('align-top transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40', !isLinked && 'bg-red-50/40 dark:bg-red-950/10')}>
              <td className="px-3 py-3"><p className="font-medium text-slate-900 dark:text-white">{item.invoice_number || 'Sin número'}</p><p className="text-xs text-slate-500 dark:text-slate-400">{item.supplier || 'Sin proveedor'}</p></td>
              <td className="px-3 py-3">{item.description}<p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(item.invoice_date)}</p></td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{item.quantity}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{costMoney(costNumber(item.unit_cost), currency)}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{costMoney(base, currency)}</td>
              <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{costMoney(tax, currency)}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{costMoney(base === null || tax === null ? null : base + tax, currency)}</td>
              <td className="px-3 py-3"><div className="flex min-w-[15rem] flex-col gap-1.5">
                <select aria-label={'Cargo cotizado para ' + item.description + ' ' + (item.invoice_number || item.id)} className={cn(fieldClassSm, !isLinked && 'border-red-300 dark:border-red-800')} disabled={busy}
                  value={isLinked ? item.pricing_item_id! : ''}
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
                </select>
                {isLinked ? <CostStatusBadge tone="emerald" icon={CheckCircle2} className="self-start">Vinculado</CostStatusBadge> : <CostStatusBadge tone="red" icon={AlertTriangle} className="self-start">Sin conciliar</CostStatusBadge>}
              </div></td>
              <td className="px-3 py-3 text-right"><button className={dangerIconClass} disabled={busy} onClick={() => setDeleteId(item.id)} aria-label={'Eliminar ' + (item.invoice_number || item.description)} title="Eliminar"><Trash2 aria-hidden="true" className="h-4 w-4" /></button></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    </section>

    <section className={cn('rounded-2xl border p-6 shadow-sm', reviewTone === 'emerald' ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/20' : reviewTone === 'sky' ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/20' : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20')} aria-labelledby="financial-review">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 basis-80 items-start gap-3">
          {(() => { const Icon = financiallyValidated ? ShieldCheck : canValidate ? CheckCircle2 : Clock3; return <Icon aria-hidden="true" className={cn('mt-0.5 h-6 w-6 shrink-0', costIconTones[reviewTone])} /> })()}
          <div className="min-w-0"><h2 id="financial-review" className="text-base font-semibold text-slate-900 dark:text-white">Revisión financiera</h2><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{validationReason}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.quotation.financial_validation_status !== 'Validado' && <button className={primaryActionClass} disabled={busy || !canValidate} onClick={() => setConfirmValidation(true)}><ShieldCheck aria-hidden="true" className="h-4 w-4" />Marcar como validado</button>}
          {financiallyValidated && <Link className={successActionClass} href={data.customerInvoice ? '/invoicing/' + data.customerInvoice.id : '/invoicing/new?quotation=' + quotationId + '&returnTo=' + encodeURIComponent(returnHref)}>
            <Receipt aria-hidden="true" className="h-4 w-4" />{data.customerInvoice ? 'Ver factura ' + (data.customerInvoice.invoice_number || '') : 'Generar factura'}
          </Link>}
        </div>
      </div>
    </section>
    <ConfirmDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null) }} title="Eliminar costo de proveedor" description="Se eliminará este registro y se deberá revisar nuevamente la validación financiera." confirmLabel="Eliminar" danger onConfirm={() => {
      if (!deleteId) return
      const target = deleteId
      void mutate(async () => {
        const result = await supabase.from('provider_invoice_items').delete().eq('id', target).eq('quotation_id', quotationId).select('id').single()
        if (result.error || !result.data) throw new Error(result.error?.message || 'No se eliminó el registro.')
      }, 'Costo eliminado')
    }} />
    <ConfirmDialog open={confirmValidation} onOpenChange={setConfirmValidation} title="Confirmar revisión completa" description={ownZeroCostIds.length ? 'Confirma costo externo cero de los honorarios propios de aduanas y que todos los demás costos, facturas e impuestos están conciliados.' : 'Confirma que recibiste todas las facturas y revisaste cantidades, cargos adicionales e impuestos. La presencia de un registro por cargo no garantiza que la facturación esté completa.'} confirmLabel="Validar costos" onConfirm={() => {
      if (!canValidate) return
      void mutate(async () => {
        const result = await supabase.rpc('validate_quotation_financial_costs', {
          p_quotation_id: quotationId,
        })
        if (result.error || !result.data) throw new Error(result.error?.message || 'La cotización cambió; actualiza antes de validar.')
      }, 'Costos validados')
    }} />
  </div>
}
