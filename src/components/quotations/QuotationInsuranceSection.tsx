'use client'

import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import type { withMiamiInsurance } from '@/src/lib/miami-insurance'
import type { QuotationFieldChange, QuotationFormData } from '@/src/lib/quotation-form'

const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

/** Solicitud de seguro; en Miami muestra la prima calculada que se guardará con los cargos. */
export function QuotationInsuranceSection({
  formData,
  handleChange,
  isMiamiFlow,
  requiresCargoInsurance,
  clientInsuranceDefault,
  insurancePreview,
}: {
  formData: QuotationFormData
  handleChange: QuotationFieldChange
  isMiamiFlow: boolean
  requiresCargoInsurance: boolean
  clientInsuranceDefault: boolean
  insurancePreview: ReturnType<typeof withMiamiInsurance>
}) {
  return (
    <section className={cardClass}>
      <div className="mb-5 border-b border-slate-100 pb-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Seguro de Carga
        </h2>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
        <input
          type="checkbox"
          name="requires_insurance"
          checked={requiresCargoInsurance}
          onChange={handleChange}
          className="h-4 w-4 rounded border-slate-300"
        />
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            Cliente solicita seguro de carga
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {isMiamiFlow ? 'Se incluirá el seguro Full Cover en los cargos y el PDF de la cotización.' : 'Pricing calculará el seguro sobre el valor comercial / FOB ingresado.'}
          </p>
        </div>
      </label>

      {requiresCargoInsurance && (
        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Valor comercial / Valor FOB (USD)
          </label>
          <input
            name="commercial_value"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={formData.commercial_value}
            onChange={handleChange}
            className={fieldClass}
          />
        </div>
      )}
      {isMiamiFlow && requiresCargoInsurance && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          {clientInsuranceDefault && <p className="mb-2 text-xs text-slate-500">El cliente tiene seguro por defecto. Puedes desmarcarlo si esta carga no requiere seguro.</p>}
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              name="insurance_taxable"
              checked={formData.insurance_taxable}
              onChange={handleChange}
              className="h-4 w-4 rounded border-slate-300"
            />
            Aplicar ISV al seguro de carga
          </label>
          {insurancePreview.error ? <p role="status" className="text-amber-700 dark:text-amber-300">{insurancePreview.error}</p> : insurancePreview.insurance && <>
            <p>Prima del seguro: USD {formatNumber(insurancePreview.insurance.sale_amount)}</p>
            <p>{insurancePreview.insurance.taxable ? `ISV (${insurancePreview.insurance.tax_rate}%): USD ${formatNumber(insurancePreview.insurance.tax_amount)}` : 'ISV: no aplicado'}</p>
            <p className="mt-1 font-semibold">Total del seguro: USD {formatNumber(insurancePreview.insurance.total_amount)}</p>
            <p className="mt-2 text-xs text-slate-500">Este cargo se guardará junto con los demás cargos de Miami.</p>
          </>}
        </div>
      )}
    </section>
  )
}
