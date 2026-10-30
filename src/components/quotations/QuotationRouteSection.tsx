'use client'

import type { Dispatch, SetStateAction } from 'react'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { NumberInput } from '@/src/components/ui/NumberInput'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import {
  DELIVERY_INCOTERMS,
  PICKUP_INCOTERMS,
  getRouteLabels,
  type QuotationFieldChange,
  type QuotationFormData,
} from '@/src/lib/quotation-form'

const moneyFieldClass = `${fieldClass} md:max-w-[180px]`

/**
 * Ruta con etiquetas según el transporte. Las direcciones dependen del Incoterm;
 * si ya tienen texto se siguen mostrando.
 * Requiere los datalist `countries`, `originPorts` y `destinationPorts` en la página.
 */
export function QuotationRouteSection({ formData, handleChange, setFormData }: {
  formData: QuotationFormData
  handleChange: QuotationFieldChange
  setFormData: Dispatch<SetStateAction<QuotationFormData>>
}) {
  const routeLabels = getRouteLabels(formData.tipo_transporte)
  const showPickupAddress =
    PICKUP_INCOTERMS.includes(formData.incoterm) || Boolean(formData.pickup_address)
  const showDeliveryAddress =
    DELIVERY_INCOTERMS.includes(formData.incoterm) || Boolean(formData.delivery_address)

  return (
    <FormSection title="Ruta" className={cardClass}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="País de origen">
          <input
            list="countries"
            name="origen"
            placeholder="Ej. China"
            value={formData.origen}
            onChange={handleChange}
            className={fieldClass}
          />
        </FormField>

        <FormField label="País de destino">
          <input
            list="countries"
            name="destino"
            placeholder="Ej. Honduras"
            value={formData.destino}
            onChange={handleChange}
            className={fieldClass}
          />
        </FormField>

        <FormField label={`${routeLabels.place} origen`}>
          <input
            list="originPorts"
            name="puerto_origen"
            placeholder={routeLabels.originExample}
            value={formData.puerto_origen}
            onChange={handleChange}
            className={fieldClass}
          />
        </FormField>

        <FormField label={`${routeLabels.place} destino`}>
          <input
            list="destinationPorts"
            name="puerto_destino"
            placeholder={routeLabels.destinationExample}
            value={formData.puerto_destino}
            onChange={handleChange}
            className={fieldClass}
          />
        </FormField>

        <FormField label={routeLabels.carrierLabel}>
          <input
            name="preferred_carrier"
            placeholder={routeLabels.carrierExample}
            value={formData.preferred_carrier || ''}
            onChange={handleChange}
            className={fieldClass}
          />
        </FormField>

        <FormField label="Target rate (USD)">
          <NumberInput
            type="number"
            min="0"
            step="0.01"
            name="target_rate"
            placeholder="0.00"
            value={formData.target_rate || ''}
            onChange={handleChange}
            className={moneyFieldClass}
          />
        </FormField>

        {showPickupAddress && (
          <FormField
            label={`Dirección de recolección${formData.incoterm ? ` (${formData.incoterm})` : ''}`}
            className="sm:col-span-2 lg:col-span-3"
          >
            <textarea
              className={`${fieldClass} min-h-20`}
              placeholder="Dirección completa de recolección"
              value={formData.pickup_address}
              onChange={(e) =>
                setFormData({ ...formData, pickup_address: e.target.value })
              }
            />
          </FormField>
        )}

        {showDeliveryAddress && (
          <FormField
            label={`Dirección de entrega${formData.incoterm ? ` (${formData.incoterm})` : ''}`}
            className="sm:col-span-2 lg:col-span-3"
          >
            <textarea
              className={`${fieldClass} min-h-20`}
              placeholder="Dirección completa de entrega"
              value={formData.delivery_address}
              onChange={(e) =>
                setFormData({ ...formData, delivery_address: e.target.value })
              }
            />
          </FormField>
        )}
      </div>
    </FormSection>
  )
}
