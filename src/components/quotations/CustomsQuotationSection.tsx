'use client'

import type { Dispatch, SetStateAction } from 'react'
import { type CustomsCharge, buildCustomsPricingItems } from '@/src/lib/customs-quotation'
import { fieldClass, cardClass, fieldLabelClass } from '@/src/lib/ui-classes'

type CustomsData = { commodity: string; puerto_destino: string; delivery_address: string; valid_until: string; client_notes: string; pricing_notes: string }

export function CustomsQuotationSection({ data, onChange, charges, setCharges, taxRate }: {
  data: CustomsData; onChange: (field: keyof CustomsData, value: string) => void
  charges: CustomsCharge[]; setCharges: Dispatch<SetStateAction<CustomsCharge[]>>; taxRate: number
}) {
  const delivery = charges.some(item => item.code === 'customs_delivery')
  const update = (index: number, patch: Partial<CustomsCharge>) => setCharges(previous =>
    previous.map((item, i) => i === index ? { ...item, ...patch } : item))
  const total = buildCustomsPricingItems('preview', charges, taxRate, '').reduce((sum, item) => sum + item.total_amount, 0)
  return <section className={cardClass}>
    <h2 className="text-lg font-semibold">Servicio de Aduanas</h2>
    <p className="mt-2 text-sm text-slate-500">Cotiza los honorarios propios y, si corresponde, la entrega final. Define en las condiciones comerciales los impuestos aduaneros y gastos incluidos.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {([
        ['puerto_destino', 'Aduana de despacho', 'text'],
        ['commodity', 'Mercancía / descripción', 'text'],
        ['valid_until', 'Válida hasta', 'date'],
      ] as const).map(([field, label, type]) => <label key={field} className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className={fieldLabelClass}>{label} *</span><input className={fieldClass} type={type} value={data[field]} onChange={event => onChange(field, event.target.value)} />
      </label>)}
    </div>
    <label className="my-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={delivery} onChange={event => {
      if (event.target.checked) setCharges(previous => [...previous, { code: 'customs_delivery', description: 'Entrega final', cost: '0', sale: '', taxable: true }])
      else { setCharges(previous => previous.filter(item => item.code !== 'customs_delivery')); onChange('delivery_address', '') }
    }} /> Incluir entrega final</label>
    {delivery && <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Dirección de entrega *</span><input className={fieldClass} value={data.delivery_address} onChange={event => onChange('delivery_address', event.target.value)} /></label>}
    <div className="space-y-4">{charges.map((item, index) => <div key={item.code} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3 dark:border-slate-700">
      <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Servicio</span><input className={fieldClass} value={item.description} onChange={event => update(index, { description: event.target.value })} /></label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Costo externo (USD)</span><input type="number" min="0" step="0.01" className={fieldClass} value={item.cost} onChange={event => update(index, { cost: event.target.value })} /></label>
      <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Precio de venta (USD) *</span><input type="number" min="0" step="0.01" className={fieldClass} value={item.sale} onChange={event => update(index, { sale: event.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.taxable} onChange={event => update(index, { taxable: event.target.checked })} /> Aplicar ISV ({item.taxRate ?? taxRate}%)</label>
    </div>)}</div>
    <p className="my-4 font-semibold">Total: USD {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
    <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Notas internas de rentabilidad (no aparecen en PDF)</span><textarea className={fieldClass} value={data.pricing_notes} onChange={event => onChange('pricing_notes', event.target.value)} placeholder="Justificación obligatoria cuando el margen sea menor al 5%." /></label>
    <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Condiciones comerciales para el PDF</span><textarea className={`${fieldClass} min-h-28`} value={data.client_notes} onChange={event => onChange('client_notes', event.target.value)} placeholder="Alcance del despacho, documentos necesarios, impuestos y gastos incluidos o excluidos..." /></label>
  </section>
}
