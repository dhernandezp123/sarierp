'use client'

import { NumberInput } from '@/src/components/ui/NumberInput'

import type React from 'react'
import { useState } from 'react'

import type { MiamiQuotationState } from '@/src/hooks/useMiamiQuotation'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { CargoLinesEditor } from '@/src/components/quotations/CargoLinesEditor'
import type { CargoDimensionLine } from '@/src/lib/quotation-cargo'
import {
  getAvailableClientRate,
  MIAMI_LCL_OPTIONAL_CHARGES,
} from '@/src/lib/miami-pricing-items'

type MiamiQuotationFormData = {
  cliente_id: string
  service_product: string
  incoterm: string
  puerto_origen: string
  puerto_destino: string
  destino: string
  transit_time: string
  valid_until: string
  commodity: string
  observaciones: string
}

type MiamiQuotationSectionProps = {
  formData: MiamiQuotationFormData
  handleChange: (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => void
  fieldClass: string
  cardClass: string
  cargoLines: CargoDimensionLine[]
  setCargoLines: React.Dispatch<React.SetStateAction<CargoDimensionLine[]>>
  formatNumber: (value: number, decimals?: number) => string
  miami: MiamiQuotationState
}

export function MiamiQuotationSection({
  formData,
  handleChange,
  fieldClass,
  cardClass,
  cargoLines,
  setCargoLines,
  formatNumber,
  miami,
}: MiamiQuotationSectionProps) {
  const [pendingRemoval, setPendingRemoval] = useState<{
    kind: 'origin' | 'destination'
    id: string
    label: string
  } | null>(null)
  const fieldLabelClass =
    'text-xs font-medium text-slate-500 dark:text-slate-400'
  const compactFieldClass = `${fieldClass} md:max-w-[180px]`
  const moneyFieldClass = `${fieldClass} md:max-w-[220px]`
  const routeFieldClass = `${fieldClass} md:max-w-[260px]`
  const mediumFieldClass = `${fieldClass} md:max-w-xl`

  const confirmRemoval = () => {
    if (!pendingRemoval) return
    if (pendingRemoval.kind === 'origin') {
      miami.setOriginCharges((prev) => prev.filter((item) => item.id !== pendingRemoval.id))
    } else {
      miami.setDestinationCharges((prev) => prev.filter((item) => item.id !== pendingRemoval.id))
    }
    setPendingRemoval(null)
  }

  if (!miami.isMiamiFlow) return null

  return (
    <>
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
        Este producto usa tarifas automáticas del cliente y no requiere comparación manual de agentes.
      </div>

      {miami.clientRates.length > 0 && (
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/50 dark:bg-blue-950/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-100">
                Tarifas activas del cliente
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {miami.clientRates.length} tarifas disponibles para esta cotización.
              </p>
            </div>

            <button
              type="button"
              onClick={() => miami.setShowClientRates(!miami.showClientRates)}
              className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
            >
              {miami.showClientRates ? 'Ocultar tarifas' : 'Ver tarifas'}
            </button>
          </div>

          {miami.showClientRates && (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {miami.clientRates.map((rate) => (
                <div
                  key={rate.rate_code}
                  className="space-y-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-blue-900/40 dark:bg-slate-950/70"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {rate.rate_label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    USD {Number(rate.amount || 0).toFixed(2)} / {rate.unit || 'flat'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!formData.cliente_id && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          Selecciona primero un cliente para cargar sus tarifas Miami.
        </div>
      )}

      {formData.cliente_id && !miami.canUseMiamiCalculator && (
        <p role="status" className="mt-4 rounded-xl border border-amber-200 p-4 text-sm text-amber-800 dark:text-amber-200">
          Este cliente no tiene tarifas Miami activas. Puedes completar la carga, pero para calcular y guardar la tarifa necesita tarifas activas.
        </p>
      )}
      {miami.isMiamiFlow && (
        <div className="mt-4 space-y-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Datos del embarque Miami
            </h3>

            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Puerto origen
                </label>
              <input
                list="originPorts"
                name="puerto_origen"
                placeholder="Puerto origen"
                value={formData.puerto_origen}
                onChange={handleChange}
                className={routeFieldClass}
              />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Puerto destino
                </label>
              <input
                list="destinationPorts"
                name="puerto_destino"
                placeholder="Puerto destino"
                value={formData.puerto_destino}
                onChange={handleChange}
                className={routeFieldClass}
              />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Destino final
                </label>
              <input
                list="countries"
                name="destino"
                placeholder="Destino final"
                value={formData.destino}
                onChange={handleChange}
                className={routeFieldClass}
              />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Tránsito estimado
                </label>
              <input
                name="transit_time"
                value={formData.transit_time}
                onChange={handleChange}
                placeholder="Tránsito estimado, ej. 8-12 días"
                className={compactFieldClass}
              />
              </div>


              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Commodity / descripción
                </label>
              <input
                name="commodity"
                placeholder="Commodity / descripción"
                value={formData.commodity}
                onChange={handleChange}
                className={routeFieldClass}
              />
              </div>

              <div className="flex flex-col gap-1.5 md:col-span-3">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Observaciones
                </label>
              <textarea
                name="observaciones"
                placeholder="Observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                className={`${fieldClass} min-h-24 md:col-span-2`}
              />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <CargoLinesEditor lines={cargoLines} setLines={setCargoLines} />
          </div>

          {formData.service_product === 'miami_lcl' && (
            <div className={`mt-4 ${cardClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Cargos opcionales Miami LCL
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Selecciona los cargos que aplican. Solo se agregarán cuando el cliente tenga una tarifa activa con monto mayor a cero.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {MIAMI_LCL_OPTIONAL_CHARGES.map((charge) => {
                  const rate = getAvailableClientRate(
                    miami.clientRates,
                    charge.rateCode
                  )
                  const isAvailable = Boolean(formData.cliente_id && rate)
                  const availabilityLabel = !formData.cliente_id
                    ? 'Selecciona un cliente'
                    : rate
                      ? `${rate.currency || 'USD'} ${formatNumber(Number(rate.amount), 2)}`
                      : 'Tarifa no configurada'

                  return (
                    <label
                      key={charge.rateCode}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                        isAvailable
                          ? 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-200'
                          : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={
                          isAvailable &&
                          Boolean(miami.miamiOptions[charge.optionKey])
                        }
                        disabled={!isAvailable}
                        onChange={(e) =>
                          miami.setMiamiOptions({
                            ...miami.miamiOptions,
                            [charge.optionKey]: e.target.checked,
                          })
                        }
                      />
                      <span>
                        <span className="block font-medium">{charge.label}</span>
                        <span className="mt-1 block text-xs">{availabilityLabel}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {miami.canUseMiamiCalculator && <>
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Flujo rápido Miami Consolidado
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Usa las tarifas activas del cliente para calcular y generar la cotización automáticamente.
            </p>
          </div>

          {formData.service_product === 'miami_lcl' && (
            <div className={`mt-4 space-y-5 ${cardClass}`}>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Calculadora Miami LCL
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Calcula el flete tomando el mayor entre FT3, libras y el mínimo aplicable.
              </p>

              <div className="flex flex-wrap gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>FT3</label>
                  <input
                    type="number"
                    value={miami.miamiCalc.ft3}
                    onChange={(e) =>
                      miami.setMiamiCalc({
                        ...miami.miamiCalc,
                        ft3: e.target.value,
                      })
                    }
                    placeholder="FT3"
                    className={compactFieldClass}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>Libras</label>
                  <input
                    type="number"
                    value={miami.miamiCalc.lbs}
                    onChange={(e) =>
                      miami.setMiamiCalc({
                        ...miami.miamiCalc,
                        lbs: e.target.value,
                      })
                    }
                    placeholder="Libras"
                    className={compactFieldClass}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                FT3 y libras se calculan automáticamente desde las líneas de carga. Puedes editarlos manualmente si necesitas ajustar.
              </p>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        miami.shouldApplyStandardCharges &&
                        miami.miamiOptions.applyStandardCharges
                      }
                      disabled={!miami.shouldApplyStandardCharges}
                      onChange={(e) =>
                        miami.setMiamiOptions({
                          ...miami.miamiOptions,
                          applyStandardCharges: e.target.checked,
                        })
                      }
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Aplicar cargos estándar: BL, SED, Documentos / Manejo,
                      Desconsolidación
                    </span>
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={
                        miami.applyStandardCharges &&
                        miami.miamiOptions.taxStandardDestinationCharges
                      }
                      disabled={!miami.applyStandardCharges}
                      onChange={(e) =>
                        miami.setMiamiOptions({
                          ...miami.miamiOptions,
                          taxStandardDestinationCharges: e.target.checked,
                        })
                      }
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      ISV {miami.taxRatePercent}% en Documentos / Manejo y
                      Desconsolidación
                    </span>
                  </label>
                </div>

                {miami.miamiLclResult.isMinimum && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    No aplican cargos estándar cuando el flete se calcula por mínimo.
                  </p>
                )}

              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-5">
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Por FT3
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    USD {miami.lclByFt3.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Por LBS
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    USD {miami.lclByLbs.toFixed(2)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Mínimo aplicado
                  </p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    USD {miami.miamiLclResult.minimumApplied.toFixed(2)}
                  </p>
                </div>

                {miami.bunkerRule && (
                  <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      {miami.bunkerRule.label}
                    </p>
                    <p className="mt-1 font-semibold text-amber-900 dark:text-amber-100">
                      USD {miami.bunkerAmount.toFixed(2)}
                    </p>
                  </div>
                )}

                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Total estimado
                  </p>
                  <p className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-100">
                    USD {miami.miamiLclTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {formData.service_product === 'miami_air' && (
            <div className={`mt-4 space-y-5 ${cardClass}`}>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Calculadora Miami Aéreo
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Calcula el flete aéreo usando la tarifa por KG.
              </p>

              <div className="grid gap-4 md:grid-cols-[220px_minmax(240px,360px)] md:items-end">
                <div className="flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>Kilogramos</label>
                  <input
                    type="number"
                    value={miami.miamiCalc.kg}
                    onChange={(e) =>
                      miami.setMiamiCalc({
                        ...miami.miamiCalc,
                        kg: e.target.value,
                      })
                    }
                    placeholder="Kilogramos"
                    className={compactFieldClass}
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Calculado desde las líneas de carga. Editable.
                  </p>
                </div>
                <div className="rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Flete estimado
                  </p>
                  <p className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-100">
                    USD {miami.airEstimated.toFixed(2)}
                  </p>
                </div>
              </div>

              <label className="flex max-w-xl items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950/70">
                <span>
                  <span className="block font-medium text-slate-700 dark:text-slate-200">
                    Agregar Documentos/Manejo
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {miami.airDocumentsHandlingRate
                      ? `Tarifa cliente: USD ${Number(
                          miami.airDocumentsHandlingRate.amount || 0
                        ).toFixed(2)}`
                      : 'El cliente no tiene esta tarifa activa.'}
                  </span>
                </span>

                <input
                  type="checkbox"
                  checked={Boolean(
                    miami.miamiOptions.includeAirDocumentsHandling
                  )}
                  disabled={
                    !miami.airDocumentsHandlingRate ||
                    Number(miami.airDocumentsHandlingRate.amount || 0) <= 0
                  }
                  onChange={(e) =>
                    miami.setMiamiOptions({
                      ...miami.miamiOptions,
                      includeAirDocumentsHandling: e.target.checked,
                    })
                  }
                  className="h-4 w-4 shrink-0 rounded border-slate-300"
                />
              </label>
            </div>
          )}

          {formData.incoterm === 'EXW' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-950/70">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Tipo de Pickup
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pickup_mode"
                    checked={miami.pickupMode === 'standard'}
                    onChange={() => miami.setPickupMode('standard')}
                  />
                  <span>Pickup Miami estándar</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pickup_mode"
                    checked={miami.pickupMode === 'manual'}
                    onChange={() => miami.setPickupMode('manual')}
                  />
                  <span>Pickup manual</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="pickup_mode"
                    checked={miami.pickupMode === 'none'}
                    onChange={() => miami.setPickupMode('none')}
                  />
                  <span>Sin pickup</span>
                </label>
              </div>

              {miami.pickupMode === 'standard' && (
                <p className="mt-3 font-semibold text-slate-900 dark:text-white">
                  USD {miami.pickupRate.toFixed(2)}
                </p>
              )}

              {miami.pickupMode === 'manual' && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <label className={fieldLabelClass}>
                    Monto pickup manual (USD)
                  </label>
                  <NumberInput
                    type="number"
                    value={miami.manualPickupAmount}
                    onChange={(e) =>
                      miami.setManualPickupAmount(Number(e.target.value || 0))
                    }
                    placeholder="Monto pickup manual USD"
                    className={moneyFieldClass}
                  />
                </div>
              )}
            </div>
          )}

          <div className={`mt-4 space-y-5 ${cardClass}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Cargos adicionales en origen
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Selecciona una tarifa activa del cliente o agrega un concepto
                  manual.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  miami.setOriginCharges((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      rateCode: '',
                      description: '',
                      amount: '',
                      taxable: false,
                      isManual: false,
                    },
                  ])
                }
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                Agregar cargo
              </button>
            </div>

            <div className="space-y-5">
              {miami.originCharges.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No hay cargos adicionales en origen. Puedes elegir una tarifa
                  del cliente o registrar otro cargo manualmente.
                </p>
              ) : (
                miami.originCharges.map((charge) => {
                  const isChargeComplete =
                    (charge.isManual
                      ? charge.description.trim().length > 0
                      : (charge.rateCode || '').trim().length > 0) &&
                    Number(charge.amount || 0) > 0

                  return (
                    <div
                      key={charge.id}
                      className={`grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_160px_140px_100px] md:items-end ${
                        isChargeComplete
                          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40'
                      }`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <label className={fieldLabelClass}>
                          {charge.isManual ? 'Tipo de cargo' : 'Tarifa'}
                        </label>
                        <select
                          value={
                            charge.isManual ? '__manual__' : charge.rateCode || ''
                          }
                          onChange={(e) => {
                            if (e.target.value === '__manual__') {
                              miami.setOriginCharges((prev) =>
                                prev.map((item) =>
                                  item.id === charge.id
                                    ? {
                                        ...item,
                                        rateCode: 'manual',
                                        description: '',
                                        amount: '',
                                        isManual: true,
                                      }
                                    : item
                                )
                              )
                              return
                            }

                            const selectedRate = miami.originChargeRates.find(
                              (rate) => rate.rate_code === e.target.value
                            )

                            miami.setOriginCharges((prev) =>
                              prev.map((item) =>
                                item.id === charge.id
                                  ? {
                                      ...item,
                                      rateCode: selectedRate?.rate_code || '',
                                      description: selectedRate?.rate_label || '',
                                      amount: selectedRate
                                        ? String(selectedRate.amount || '')
                                        : '',
                                      isManual: false,
                                    }
                                  : item
                              )
                            )
                          }}
                          className={fieldClass}
                        >
                          <option value="">Seleccionar tarifa</option>
                          {miami.originChargeRates.map((rate) => (
                            <option key={rate.rate_code} value={rate.rate_code}>
                              {rate.rate_label} - USD{' '}
                              {Number(rate.amount || 0).toFixed(2)}
                            </option>
                          ))}
                          <option value="__manual__">Otro cargo (manual)</option>
                        </select>

                        {charge.isManual && (
                          <div className="mt-2 flex flex-col gap-1.5">
                            <label className={fieldLabelClass}>Concepto</label>
                            <input
                              value={charge.description || ''}
                              onChange={(e) =>
                                miami.setOriginCharges((prev) =>
                                  prev.map((item) =>
                                    item.id === charge.id
                                      ? { ...item, description: e.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="Ej. Almacenaje, inspección, etiquetado..."
                              className={fieldClass}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={fieldLabelClass}>Monto (USD)</label>
                        <input
                          type="number"
                          value={charge.amount || ''}
                          onChange={(e) =>
                            miami.setOriginCharges((prev) =>
                              prev.map((item) =>
                                item.id === charge.id
                                  ? {
                                      ...item,
                                      amount: e.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                          placeholder="Monto"
                          className={moneyFieldClass}
                        />
                      </div>

                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={Boolean(charge.taxable)}
                          onChange={(e) =>
                            miami.setOriginCharges((prev) =>
                              prev.map((item) =>
                                item.id === charge.id
                                  ? {
                                      ...item,
                                      taxable: e.target.checked,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                        ISV {miami.taxRatePercent}%
                      </label>

                      <button
                        type="button"
                        onClick={() => setPendingRemoval({
                          kind: 'origin',
                          id: charge.id,
                          label: charge.description || 'cargo de origen',
                        })}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Quitar
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className={`mt-4 space-y-5 ${cardClass}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Cargos adicionales en destino
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Agrega cargos como aduanas, entrega local u otros servicios.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  miami.setDestinationCharges((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      description: '',
                      amount: '',
                      taxable: false,
                    },
                  ])
                }
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
              >
                Agregar cargo
              </button>
            </div>

            <div className="space-y-5">
              {miami.destinationCharges.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No hay cargos adicionales en destino.
                </p>
              ) : (
                miami.destinationCharges.map((charge) => {
                  const isChargeComplete =
                    charge.description.trim().length > 0 &&
                    Number(charge.amount || 0) > 0

                  return (
                    <div
                      key={charge.id}
                      className={`grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_160px_140px_100px] md:items-end ${
                        isChargeComplete
                          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40'
                      }`}
                    >
                      <div className="flex flex-col gap-1.5">
                        <label className={fieldLabelClass}>Descripción</label>
                        <input
                          value={charge.description || ''}
                          onChange={(e) =>
                            miami.setDestinationCharges((prev) =>
                              prev.map((item) =>
                                item.id === charge.id
                                  ? {
                                      ...item,
                                      description: e.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                          placeholder="Descripción"
                          className={fieldClass}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className={fieldLabelClass}>Monto (USD)</label>
                        <input
                          type="number"
                          value={charge.amount || ''}
                          onChange={(e) =>
                            miami.setDestinationCharges((prev) =>
                              prev.map((item) =>
                                item.id === charge.id
                                  ? {
                                      ...item,
                                      amount: e.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                          placeholder="Monto"
                          className={moneyFieldClass}
                        />
                      </div>

                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={Boolean(charge.taxable)}
                          onChange={(e) =>
                            miami.setDestinationCharges((prev) =>
                              prev.map((item) =>
                                item.id === charge.id
                                  ? {
                                      ...item,
                                      taxable: e.target.checked,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                        ISV {miami.taxRatePercent}%
                      </label>

                      <button
                        type="button"
                        onClick={() => setPendingRemoval({
                          kind: 'destination',
                          id: charge.id,
                          label: charge.description || 'cargo de destino',
                        })}
                        className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Quitar
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          </>}
        </div>
      )}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}
        title="Quitar cargo adicional"
        description={pendingRemoval
          ? `¿Deseas quitar ${pendingRemoval.label}? Se descartarán todos los valores ingresados en esta línea.`
          : undefined}
        confirmLabel="Quitar"
        danger
        onConfirm={confirmRemoval}
      />
    </>
  )
}
