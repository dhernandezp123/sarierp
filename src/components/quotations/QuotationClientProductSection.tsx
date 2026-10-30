'use client'

import type { ChangeEvent } from 'react'
import { ClienteCombobox } from '@/src/components/ui/ClienteCombobox'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import type { QuotationFieldChange, QuotationFormData } from '@/src/lib/quotation-form'
import { tradeDirections } from '@/src/lib/quotation-products'

/** Primer bloque: el producto define las secciones y el flujo de aprobación. */
export function QuotationClientProductSection({
  clientes,
  formData,
  handleChange,
  onClientChange,
  onServiceProductChange,
  serviceProductOptions,
  reqClass,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientes: any[]
  formData: QuotationFormData
  handleChange: QuotationFieldChange
  onClientChange: (clienteId: string) => void
  onServiceProductChange: (event: ChangeEvent<HTMLSelectElement>) => void
  serviceProductOptions: { value: string; label: string }[]
  reqClass: (value: string) => string
}) {
  return (
    <FormSection
      title="Cliente y producto"
      description="El producto define las secciones, la modalidad y el flujo de aprobación."
      className={cardClass}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField as="div" label="Cliente" required className="sm:col-span-2">
          <div data-field="cliente_id">
            <ClienteCombobox
              clientes={clientes}
              value={formData.cliente_id}
              onChange={onClientChange}
              placeholder="Seleccionar cliente"
              className={`${fieldClass} ${reqClass(formData.cliente_id)}`}
            />
          </div>
        </FormField>

        <FormField label="Dirección comercial" required>
          <select
            name="trade_direction"
            value={formData.trade_direction}
            onChange={handleChange}
            className={`${fieldClass} ${reqClass(formData.trade_direction)}`}
          >
            <option value="">Seleccionar dirección</option>
            {tradeDirections.map((direction) => (
              <option key={direction.value} value={direction.value}>
                {direction.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Producto / Servicio" required>
          <select
            name="service_product"
            value={formData.service_product}
            onChange={onServiceProductChange}
            className={`${fieldClass} ${reqClass(formData.service_product)}`}
          >
            <option value="">Seleccionar producto</option>
            {serviceProductOptions.map((product) => (
              <option key={product.value} value={product.value}>
                {product.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
    </FormSection>
  )
}
