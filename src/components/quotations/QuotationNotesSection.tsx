'use client'

import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import type { QuotationFieldChange, QuotationFormData } from '@/src/lib/quotation-form'

/** pricing_notes (internas, productos con Pricing) o client_notes (PDF, Miami). */
export function QuotationNotesSection({ formData, handleChange, isMiamiFlow, isCustomsFlow }: {
  formData: QuotationFormData
  handleChange: QuotationFieldChange
  isMiamiFlow: boolean
  isCustomsFlow: boolean
}) {
  return (
    <>
    {!isMiamiFlow && !isCustomsFlow && (
      <section className={cardClass}>
        <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Observaciones internas para Pricing
          </h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Notas internas que verá el equipo de Pricing al revisar la cotización.
          </p>
        </div>
        <textarea
          name="pricing_notes"
          value={formData.pricing_notes}
          onChange={handleChange}
          rows={4}
          placeholder="Ej: Cliente requiere tarifa urgente, manejar con APS Express..."
          className={`${fieldClass} min-h-28 resize-y`}
        />
      </section>
    )}

    {isMiamiFlow && (
      <section className={cardClass}>
        <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Observaciones para Cliente (PDF)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Estas observaciones aparecerán en la cotización enviada al cliente.
          </p>
        </div>
        <textarea
          name="client_notes"
          value={formData.client_notes}
          onChange={handleChange}
          rows={4}
          placeholder="Ej: Tarifa sujeta a disponibilidad, no incluye aduanas..."
          className={`${fieldClass} min-h-28 resize-y`}
        />
      </section>
    )}
    </>
  )
}
