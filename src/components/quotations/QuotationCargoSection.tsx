'use client'

import type { Dispatch, SetStateAction } from 'react'
import { FormField, FormSection } from '@/src/components/ui/form-field'
import { CargoLinesEditor } from '@/src/components/quotations/CargoLinesEditor'
import { ContainerLinesEditor } from '@/src/components/quotations/ContainerLinesEditor'
import { cardClass, fieldClass } from '@/src/lib/ui-classes'
import {
  type CargoDimensionLine,
  type CargoLineIssue,
  getAirChargeableWeights,
} from '@/src/lib/quotation-cargo'
import {
  FCL_PACKAGE_TYPES,
  type ContainerLine,
  type QuotationFieldChange,
  type QuotationFormData,
} from '@/src/lib/quotation-form'
import { getCargoStructure } from '@/src/lib/quotation-products'

/**
 * Carga según la modalidad: FCL/FTL usan contenedores (quotation_containers) y
 * la carga suelta usa líneas (quotation_cargo_lines). Sin modalidad no se captura carga.
 */
export function QuotationCargoSection({
  formData,
  handleChange,
  setFormData,
  reqClass,
  containerTypes,
  containerLines,
  setContainerLines,
  cargoLines,
  setCargoLines,
  cargoLineIssues,
  airWeights,
}: {
  formData: QuotationFormData
  handleChange: QuotationFieldChange
  setFormData: Dispatch<SetStateAction<QuotationFormData>>
  reqClass: (value: string) => string
  containerTypes: { id: string; name: string }[]
  containerLines: ContainerLine[]
  setContainerLines: Dispatch<SetStateAction<ContainerLine[]>>
  cargoLines: CargoDimensionLine[]
  setCargoLines: Dispatch<SetStateAction<CargoDimensionLine[]>>
  cargoLineIssues: Record<string, CargoLineIssue[]>
  airWeights: ReturnType<typeof getAirChargeableWeights> | null
}) {
  const structure = getCargoStructure(formData.quote_type)

  return (
    <FormSection title="Carga" className={cardClass}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {structure === 'containers' && (
          <ContainerLinesEditor
            containerTypes={containerTypes}
            lines={containerLines}
            setLines={setContainerLines}
          />
        )}

        {structure === 'loose' && (
          <CargoLinesEditor
            lines={cargoLines}
            setLines={setCargoLines}
            issuesByLine={cargoLineIssues}
            airWeights={airWeights}
          />
        )}

        {structure === 'none' && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Selecciona el producto y la modalidad para ingresar contenedores o líneas de carga.
          </div>
        )}

        {structure === 'containers' && (
          <>
            <FormField label="Tipo de empaque">
              <select
                className={fieldClass}
                value={formData.package_type}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, package_type: e.target.value }))
                }
              >
                <option value="">Seleccionar</option>
                {FCL_PACKAGE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Peso KG">
              <input name="peso_kg" placeholder="0.00" value={formData.peso_kg} onChange={handleChange} className={fieldClass} />
            </FormField>

            <FormField label="Peso bruto">
              <input name="gross_weight" placeholder="0.00" value={formData.gross_weight} onChange={handleChange} className={fieldClass} />
            </FormField>

            <FormField label="CBM">
              <input name="volumen_cbm" placeholder="0.000" value={formData.volumen_cbm} onChange={handleChange} className={fieldClass} />
            </FormField>

            <FormField label="Bultos">
              <input name="cantidad_bultos" placeholder="0" value={formData.cantidad_bultos} onChange={handleChange} className={fieldClass} />
            </FormField>
          </>
        )}

        <FormField label="Mercancía / Commodity" required>
          <input
            name="commodity"
            placeholder="Descripción de la mercancía"
            value={formData.commodity}
            onChange={handleChange}
            className={`${fieldClass} ${reqClass(formData.commodity)}`}
          />
        </FormField>

        <FormField label="Detalles del empaque / observaciones de carga" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={`${fieldClass} min-h-24`}
            placeholder="Dimensiones, notas de embalaje, condiciones especiales..."
            value={formData.package_details}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, package_details: e.target.value }))
            }
          />
        </FormField>
      </div>
    </FormSection>
  )
}
