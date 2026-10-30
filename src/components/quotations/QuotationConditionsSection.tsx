'use client'

import { FormField, FormSection } from '@/src/components/ui/form-field'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import { INCOTERMS, type QuotationFieldChange, type QuotationFormData } from '@/src/lib/quotation-form'
import type { ProductTransportRule } from '@/src/lib/quotation-products'

const dateFieldClass = `${fieldClass} md:max-w-[220px]`

/** Transporte, modalidad, Incoterm y la única fecha de validez de la cotización. */
export function QuotationConditionsSection({
  formData,
  handleChange,
  isMiamiFlow,
  isCustomsFlow,
  productTransportRule,
  availableQuoteTypes,
  requestTransportChange,
  requestQuoteTypeChange,
  reqClass,
  todayString,
}: {
  formData: QuotationFormData
  handleChange: QuotationFieldChange
  isMiamiFlow: boolean
  isCustomsFlow: boolean
  productTransportRule: ProductTransportRule | null
  availableQuoteTypes: string[]
  requestTransportChange: (value: string) => void
  requestQuoteTypeChange: (value: string) => void
  reqClass: (value: string) => string
  todayString: string
}) {
  return (
    <FormSection
      title="Condiciones del servicio"
      description={
        isCustomsFlow
          ? 'Vigencia de la cotización de aduanas.'
          : productTransportRule
            ? productTransportRule.modalities.length === 1
              ? 'Transporte y modalidad definidos por el producto seleccionado.'
              : 'Transporte definido por el producto. Elige la modalidad.'
            : isMiamiFlow
              ? 'Transporte y modalidad definidos por el producto Miami.'
              : undefined
      }
      className={cardClass}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!isMiamiFlow && !isCustomsFlow && (
          <>
            <FormField label="Tipo de transporte" required>
              <select
                data-field="tipo_transporte"
                className={`${fieldClass} ${reqClass(formData.tipo_transporte)}`}
                value={formData.tipo_transporte}
                onChange={(e) => requestTransportChange(e.target.value)}
                disabled={Boolean(productTransportRule)}
              >
                <option value="">Seleccionar transporte</option>
                <option value="Aéreo">Aéreo</option>
                <option value="Marítima">Marítima</option>
                <option value="Terrestre">Terrestre</option>
              </select>
            </FormField>

            <FormField label="Modalidad" required>
              <select
                data-field="quote_type"
                className={`${fieldClass} ${reqClass(formData.quote_type)}`}
                value={formData.quote_type}
                onChange={(e) => requestQuoteTypeChange(e.target.value)}
                disabled={
                  !formData.tipo_transporte ||
                  productTransportRule?.modalities.length === 1
                }
              >
                <option value="">Seleccionar tipo</option>
                {availableQuoteTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </FormField>
          </>
        )}

        {!isCustomsFlow && (
          <FormField label="Incoterm" required>
            <select
              name="incoterm"
              value={formData.incoterm}
              onChange={handleChange}
              className={`${fieldClass} ${reqClass(formData.incoterm)}`}
            >
              <option value="">Seleccionar Incoterm</option>
              {INCOTERMS.map((incoterm) => (
                <option key={incoterm} value={incoterm}>{incoterm}</option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="Válida hasta" required={isCustomsFlow}>
          <input
            type="date"
            name="valid_until"
            value={formData.valid_until}
            min={todayString}
            onChange={handleChange}
            className={`${dateFieldClass} ${isCustomsFlow ? reqClass(formData.valid_until) : ''}`}
          />
        </FormField>
      </div>
    </FormSection>
  )
}
