'use client'

import type React from 'react'

import type { MiamiQuotationState } from '@/src/hooks/useMiamiQuotation'

export type MiamiCargoDimensionLine = {
  id: string
  quantity: string
  packageType: 'Caja' | 'Pallet' | 'Pieza'
  length: string
  width: string
  height: string
  dimensionUnit: 'in' | 'cm' | 'mm' | 'm'
  weight: string
  weightUnit?: 'lbs' | 'kg'
  volumeMode?: 'dimensions' | 'manual'
  manualCbm?: string | number
}

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
  todayString: string
  cargoLines: MiamiCargoDimensionLine[]
  setCargoLines: React.Dispatch<React.SetStateAction<MiamiCargoDimensionLine[]>>
  calculateLineCbm: (line: MiamiCargoDimensionLine) => number
  calculateLineFt3: (line: MiamiCargoDimensionLine) => number
  totalCargoFt3: number
  totalCargoCbm: number
  totalCargoWeight: number
  formatNumber: (value: number, decimals?: number) => string
  miami: MiamiQuotationState
}

export function MiamiQuotationSection({
  formData,
  handleChange,
  fieldClass,
  cardClass,
  todayString,
  cargoLines,
  setCargoLines,
  calculateLineCbm,
  calculateLineFt3,
  totalCargoFt3,
  totalCargoCbm,
  totalCargoWeight,
  formatNumber,
  miami,
}: MiamiQuotationSectionProps) {
  const getCargoWeightUnit = (line: MiamiCargoDimensionLine) =>
    line.weightUnit || 'lbs'

  const getCargoVolumeMode = (line: MiamiCargoDimensionLine) =>
    line.volumeMode || 'dimensions'

  const hasLineVolume = (line: MiamiCargoDimensionLine) => {
    if (getCargoVolumeMode(line) === 'manual') {
      return Number(line.manualCbm || 0) > 0
    }

    return (
      Number(line.length || 0) > 0 &&
      Number(line.width || 0) > 0 &&
      Number(line.height || 0) > 0
    )
  }

  const getLineUnitWeightLbs = (line: MiamiCargoDimensionLine) => {
    const weight = Number(line.weight || 0)
    return getCargoWeightUnit(line) === 'kg' ? weight * 2.20462 : weight
  }

  const getLineUnitWeightKg = (line: MiamiCargoDimensionLine) => {
    const weight = Number(line.weight || 0)
    return getCargoWeightUnit(line) === 'kg' ? weight : weight / 2.20462
  }

  const totalCargoKg = totalCargoWeight / 2.20462

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

      {miami.canUseMiamiCalculator && (
        <div className="mt-4 space-y-5 rounded-2xl border border-blue-200 bg-blue-50/60 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className={cardClass}>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Datos del embarque Miami
            </h3>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <input
                list="originPorts"
                name="puerto_origen"
                placeholder="Puerto origen"
                value={formData.puerto_origen}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                list="destinationPorts"
                name="puerto_destino"
                placeholder="Puerto destino"
                value={formData.puerto_destino}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                list="countries"
                name="destino"
                placeholder="Destino final"
                value={formData.destino}
                onChange={handleChange}
                className={fieldClass}
              />

              <input
                name="transit_time"
                value={formData.transit_time}
                onChange={handleChange}
                placeholder="Tránsito estimado, ej. 8-12 días"
                className={fieldClass}
              />

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Válida hasta
                </label>

                <input
                  type="date"
                  name="valid_until"
                  value={formData.valid_until}
                  min={todayString}
                  onChange={handleChange}
                  className={fieldClass}
                />

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  La cotización será válida hasta esta fecha.
                </p>
              </div>

              <input
                name="commodity"
                placeholder="Commodity / descripción"
                value={formData.commodity}
                onChange={handleChange}
                className={fieldClass}
              />

              <textarea
                name="observaciones"
                placeholder="Observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                className={`${fieldClass} min-h-24 md:col-span-2`}
              />
            </div>
          </div>

          <div className={`space-y-4 ${cardClass}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Detalle de carga
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ingresa cajas, pallets o piezas para calcular volumen y peso.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCargoLines((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      quantity: '1',
                      packageType: 'Caja',
                      length: '',
                      width: '',
                      height: '',
                      dimensionUnit: 'in',
                      weight: '',
                      weightUnit: 'lbs',
                      volumeMode: 'dimensions',
                      manualCbm: '',
                    },
                  ])
                }
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Agregar línea
              </button>
            </div>

            {cargoLines.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                Sin líneas de carga. Haz clic en "Agregar línea" para comenzar.
              </div>
            )}

            {cargoLines.length > 0 && (
              <div className="space-y-3">
                {cargoLines.map((line, idx) => {
                  const isLineComplete =
                    Number(line.quantity || 0) > 0 &&
                    hasLineVolume(line) &&
                    Number(line.weight || 0) > 0

                  const lineFt3 = calculateLineFt3(line)
                  const lineCbm = calculateLineCbm(line)
                  const lineWeightUnit = getCargoWeightUnit(line)
                  const lineVolumeMode = getCargoVolumeMode(line)
                  const lineTotalLbs =
                    getLineUnitWeightLbs(line) * Number(line.quantity || 0)
                  const lineTotalKg =
                    getLineUnitWeightKg(line) * Number(line.quantity || 0)

                  return (
                    <div
                      key={line.id}
                      className={`overflow-hidden rounded-2xl border transition-colors ${
                        isLineComplete
                          ? 'border-emerald-200 dark:border-emerald-900/50'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/40">
                        <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                          #{idx + 1}
                        </span>

                        <select
                          value={line.packageType}
                          onChange={(e) =>
                            setCargoLines((prev) =>
                              prev.map((item) =>
                                item.id === line.id
                                  ? {
                                      ...item,
                                      packageType:
                                        e.target.value as MiamiCargoDimensionLine['packageType'],
                                    }
                                  : item
                              )
                            )
                          }
                          className="flex-1 border-none bg-transparent text-sm font-medium text-slate-700 focus:outline-none focus:ring-0 dark:text-slate-200"
                        >
                          <option>Caja</option>
                          <option>Pallet</option>
                          <option>Pieza</option>
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            setCargoLines((prev) =>
                              prev.filter((item) => item.id !== line.id)
                            )
                          }
                          className="ml-auto flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 text-xs text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:border-red-900/50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                          </svg>
                          Quitar
                        </button>
                      </div>

                      <div
                        className={`space-y-3 p-4 ${
                          isLineComplete
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                            : 'bg-white dark:bg-slate-950/40'
                        }`}
                      >
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Cant.
                            </label>
                            <input
                              type="number"
                              value={line.quantity}
                              onChange={(e) =>
                                setCargoLines((prev) =>
                                  prev.map((item) =>
                                    item.id === line.id
                                      ? { ...item, quantity: e.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="1"
                              min="1"
                              className={`${fieldClass} h-10 w-full`}
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Volumen
                            </label>
                            <select
                              value={lineVolumeMode}
                              onChange={(e) =>
                                setCargoLines((prev) =>
                                  prev.map((item) =>
                                    item.id === line.id
                                      ? {
                                          ...item,
                                          volumeMode:
                                            e.target.value as MiamiCargoDimensionLine['volumeMode'],
                                        }
                                      : item
                                  )
                                )
                              }
                              className={`${fieldClass} h-10 w-full text-sm`}
                            >
                              <option value="dimensions">Calcular por dimensiones</option>
                              <option value="manual">Ingresar CBM manual</option>
                            </select>
                          </div>

                          {lineVolumeMode === 'dimensions' ? (
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Unidad
                              </label>
                              <select
                                value={line.dimensionUnit}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? {
                                            ...item,
                                            dimensionUnit:
                                              e.target.value as MiamiCargoDimensionLine['dimensionUnit'],
                                          }
                                        : item
                                    )
                                  )
                                }
                                className={`${fieldClass} h-10 w-full text-sm`}
                              >
                                <option value="in">Pulgadas (in)</option>
                                <option value="cm">Centímetros (cm)</option>
                                <option value="mm">Milímetros (mm)</option>
                                <option value="m">Metros (m)</option>
                              </select>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                CBM total de la línea
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={line.manualCbm || ''}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? { ...item, manualCbm: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder="CBM total de la línea"
                                className={`${fieldClass} h-10 w-full`}
                              />
                            </div>
                          )}

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Peso unit. {lineWeightUnit}
                            </label>
                            <div className="grid grid-cols-[1fr_82px] gap-2">
                              <input
                                type="number"
                                value={line.weight}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? { ...item, weight: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder={`Peso unit. ${lineWeightUnit}`}
                                className={`${fieldClass} h-10 w-full`}
                              />

                              <select
                                value={lineWeightUnit}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? {
                                            ...item,
                                            weightUnit:
                                              e.target.value as MiamiCargoDimensionLine['weightUnit'],
                                          }
                                        : item
                                    )
                                  )
                                }
                                className={`${fieldClass} h-10 w-full`}
                              >
                                <option value="lbs">LBS</option>
                                <option value="kg">KG</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {lineVolumeMode === 'dimensions' && (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Largo
                              </label>
                              <input
                                type="number"
                                value={line.length}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? { ...item, length: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder="0"
                                className={`${fieldClass} h-10`}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Ancho
                              </label>
                              <input
                                type="number"
                                value={line.width}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? { ...item, width: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder="0"
                                className={`${fieldClass} h-10`}
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Alto
                              </label>
                              <input
                                type="number"
                                value={line.height}
                                onChange={(e) =>
                                  setCargoLines((prev) =>
                                    prev.map((item) =>
                                      item.id === line.id
                                        ? { ...item, height: e.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder="0"
                                className={`${fieldClass} h-10`}
                              />
                            </div>
                          </div>
                        )}

                        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                          KG {formatNumber(lineTotalKg, 2)} · LBS{' '}
                          {formatNumber(lineTotalLbs, 0)} · FT3{' '}
                          {formatNumber(lineFt3, 2)} · CBM{' '}
                          {formatNumber(lineCbm, 3)}
                        </div>

                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/50">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Total kg
                            </p>
                            <p
                              className={`mt-0.5 text-sm font-semibold transition-colors ${
                                lineTotalKg > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {formatNumber(lineTotalKg, 2)}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/50">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              Total lbs
                            </p>
                            <p
                              className={`mt-0.5 text-sm font-semibold transition-colors ${
                                lineTotalLbs > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {formatNumber(lineTotalLbs, 0)}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/50">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              FT³
                            </p>
                            <p
                              className={`mt-0.5 text-sm font-semibold transition-colors ${
                                lineFt3 > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {formatNumber(lineFt3, 2)}
                            </p>
                          </div>

                          <div className="rounded-xl bg-white/80 p-2.5 dark:bg-slate-950/50">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                              CBM
                            </p>
                            <p
                              className={`mt-0.5 text-sm font-semibold transition-colors ${
                                lineCbm > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {formatNumber(lineCbm, 3)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {cargoLines.length > 0 && (
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Peso total kg
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                    {formatNumber(totalCargoKg, 2)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Peso total lbs
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                    {formatNumber(totalCargoWeight, 0)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    FT³ total
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                    {formatNumber(totalCargoFt3, 2)}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950/70">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    CBM total
                  </p>
                  <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
                    {formatNumber(totalCargoCbm, 3)}
                  </p>
                </div>

              </div>
            )}
          </div>

          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Flujo rápido Miami Consolidado
            </h2>
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

              <div className="grid gap-5 md:grid-cols-2">
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
                  className={fieldClass}
                />

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
                  className={fieldClass}
                />
              </div>

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
                    <input
                      type="number"
                      value={miami.manualPickupAmount}
                      onChange={(e) =>
                        miami.setManualPickupAmount(Number(e.target.value || 0))
                      }
                      placeholder="Monto pickup manual USD"
                      className={`${fieldClass} mt-3 w-full`}
                    />
                  )}
                </div>
              )}

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
                      ISV 15% en Documentos / Manejo y Desconsolidación
                    </span>
                  </label>
                </div>

                {miami.miamiLclResult.isMinimum && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    No aplican cargos estándar cuando el flete se calcula por mínimo.
                  </p>
                )}

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={miami.miamiOptions.isHazmat}
                      onChange={(e) =>
                        miami.setMiamiOptions({
                          ...miami.miamiOptions,
                          isHazmat: e.target.checked,
                        })
                      }
                    />
                    Hazmat IMO Charge Line
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={miami.miamiOptions.isImo}
                      onChange={(e) =>
                        miami.setMiamiOptions({
                          ...miami.miamiOptions,
                          isImo: e.target.checked,
                        })
                      }
                    />
                    Declaración IMO
                  </label>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={miami.miamiOptions.includeImoCertificate}
                      onChange={(e) =>
                        miami.setMiamiOptions({
                          ...miami.miamiOptions,
                          includeImoCertificate: e.target.checked,
                        })
                      }
                    />
                    Certificado IMO
                  </label>
                </div>
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

              <div className="grid gap-5 md:grid-cols-2">
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
                  className={fieldClass}
                />
              </div>

              <div className="mt-4 rounded-xl bg-blue-50 p-4 dark:bg-blue-950/30">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Flete estimado
                </p>
                <p className="mt-1 text-lg font-bold text-blue-900 dark:text-blue-100">
                  USD {miami.airEstimated.toFixed(2)}
                </p>
              </div>
            </div>
          )}

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
                      className={`grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_160px_140px_100px] ${
                        isChargeComplete
                          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40'
                      }`}
                    >
                      <input
                        value={charge.description}
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

                      <input
                        type="number"
                        value={charge.amount}
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
                        className={fieldClass}
                      />

                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={charge.taxable}
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
                        ISV 15%
                      </label>

                      <button
                        type="button"
                        onClick={() =>
                          miami.setDestinationCharges((prev) =>
                            prev.filter((item) => item.id !== charge.id)
                          )
                        }
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
        </div>
      )}
    </>
  )
}
