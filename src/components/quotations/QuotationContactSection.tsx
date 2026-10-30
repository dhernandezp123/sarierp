'use client'

import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import type { QuotationFieldChange, QuotationFormData } from '@/src/lib/quotation-form'

/** Contacto del cliente; se autocompleta al elegir el cliente y se puede ajustar. */
export function QuotationContactSection({ formData, handleChange }: {
  formData: QuotationFormData
  handleChange: QuotationFieldChange
}) {
  return (
    <section className={cardClass}>
      <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Contacto del Cliente
        </h2>
        {formData.cliente_id && (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Auto-llenado desde el perfil del cliente
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Nombre de contacto
          </label>
          <input
            name="contact_name"
            placeholder="Nombre del contacto"
            value={formData.contact_name}
            onChange={handleChange}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Email
          </label>
          <input
            name="contact_email"
            type="email"
            placeholder="email@empresa.com"
            value={formData.contact_email}
            onChange={handleChange}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Teléfono
          </label>
          <input
            name="contact_phone"
            placeholder="+504 0000-0000"
            value={formData.contact_phone}
            onChange={handleChange}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            País
          </label>
          <input
            name="contact_country"
            placeholder="País"
            value={formData.contact_country}
            disabled
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Departamento / Estado
          </label>
          <input
            name="contact_state"
            placeholder="Departamento / Estado"
            value={formData.contact_state || ''}
            disabled
            className={fieldClass}
          />
        </div>
      </div>
    </section>
  )
}
