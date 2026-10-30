'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { fieldClass } from '@/src/lib/ui-classes'
import {
  AIR_VOLUMETRIC_KG_PER_CBM,
  type CargoDimensionLine,
  type CargoLineIssue,
  calculateLineCbm,
  calculateLineFt3,
  cargoLineIssueLabels,
  createEmptyCargoLine,
  getAirChargeableWeights,
  getCargoVolumeMode,
  getCargoWeightUnit,
  getLineTotalWeightKg,
  getLineTotalWeightLbs,
  hasLineVolume,
} from '@/src/lib/quotation-cargo'

const formatNumber = (value: number, decimals = 2) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const lineLabelClass =
  'text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500'
const lineFieldClass = `${fieldClass} h-10 w-full`

type AirWeights = ReturnType<typeof getAirChargeableWeights>

/**
 * Líneas de carga suelta (LCL, LTL, Consolidado, Courier) con totales.
 * Quitar una línea con datos pide confirmación; una línea vacía se quita directo.
 */
export function CargoLinesEditor({
  lines,
  setLines,
  issuesByLine = {},
  airWeights = null,
}: {
  lines: CargoDimensionLine[]
  setLines: Dispatch<SetStateAction<CargoDimensionLine[]>>
  issuesByLine?: Record<string, CargoLineIssue[]>
  airWeights?: AirWeights | null
}) {
  const [pendingRemoval, setPendingRemoval] = useState<CargoDimensionLine | null>(null)

  const updateLine = (id: string, patch: Partial<CargoDimensionLine>) =>
    setLines((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const removeLine = (id: string) =>
    setLines((prev) => prev.filter((item) => item.id !== id))

  const totalKg = lines.reduce((sum, line) => sum + getLineTotalWeightKg(line), 0)
  const totalLbs = lines.reduce((sum, line) => sum + getLineTotalWeightLbs(line), 0)
  const totalFt3 = lines.reduce((sum, line) => sum + calculateLineFt3(line), 0)
  const totalCbm = lines.reduce((sum, line) => sum + calculateLineCbm(line), 0)

  return (
    <div data-field="cargo" className="col-span-full space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Detalle de carga
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ingresa paquetes, peso y dimensiones para calcular totales informativos.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, createEmptyCargoLine()])}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Agregar línea
        </button>
      </div>

      {lines.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
          Sin líneas de carga.
        </div>
      )}

      {lines.length > 0 && (
        <div className="space-y-3">
          {lines.map((line, idx) => {
            const lineWeightUnit = getCargoWeightUnit(line)
            const lineVolumeMode = getCargoVolumeMode(line)
            const isLineComplete =
              Number(line.quantity || 0) > 0 &&
              hasLineVolume(line) &&
              Number(line.weight || 0) > 0
            const lineIssues = issuesByLine[line.id] || []

            return (
              <div
                key={line.id}
                data-field={`cargo-line-${line.id}`}
                className={`overflow-hidden rounded-2xl border transition-colors ${
                  lineIssues.length > 0
                    ? 'border-red-400 ring-1 ring-red-300 dark:border-red-500 dark:ring-red-700'
                    : isLineComplete
                      ? 'border-sky-300 dark:border-sky-800/70'
                      : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/40">
                  <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    #{idx + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Línea de carga
                  </span>
                  {lineIssues.length > 0 && (
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Falta {lineIssues.map((issue) => cargoLineIssueLabels[issue]).join(', ')}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const hasMeaningfulData = Boolean(
                        line.length || line.width || line.height || line.weight || line.manualCbm
                      )
                      if (hasMeaningfulData) setPendingRemoval(line)
                      else removeLine(line.id)
                    }}
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
                      ? 'bg-sky-50/80 dark:bg-sky-950/25'
                      : 'bg-white dark:bg-slate-950/40'
                  }`}
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="flex flex-col gap-1">
                      <label className={lineLabelClass}>Cant.</label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        className={lineFieldClass}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className={lineLabelClass}>Bulto</label>
                      <select
                        value={line.packageType}
                        onChange={(e) =>
                          updateLine(line.id, {
                            packageType: e.target.value as CargoDimensionLine['packageType'],
                          })
                        }
                        className={`${lineFieldClass} text-sm`}
                      >
                        <option value="Caja">Caja</option>
                        <option value="Pallet">Pallet</option>
                        <option value="Pieza">Pieza</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className={lineLabelClass}>Volumen</label>
                      <select
                        value={lineVolumeMode}
                        onChange={(e) =>
                          updateLine(line.id, {
                            volumeMode: e.target.value as CargoDimensionLine['volumeMode'],
                          })
                        }
                        className={`${lineFieldClass} text-sm`}
                      >
                        <option value="dimensions">Calcular por dimensiones</option>
                        <option value="manual">Ingresar CBM manual</option>
                      </select>
                    </div>

                    {lineVolumeMode === 'dimensions' ? (
                      <div className="flex flex-col gap-1">
                        <label className={lineLabelClass}>Unidad</label>
                        <select
                          value={line.dimensionUnit}
                          onChange={(e) =>
                            updateLine(line.id, {
                              dimensionUnit: e.target.value as CargoDimensionLine['dimensionUnit'],
                            })
                          }
                          className={`${lineFieldClass} text-sm`}
                        >
                          <option value="in">Pulgadas (in)</option>
                          <option value="cm">Centímetros (cm)</option>
                          <option value="mm">Milímetros (mm)</option>
                          <option value="m">Metros (m)</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <label className={lineLabelClass}>CBM total de la línea</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="CBM total de la línea"
                          value={line.manualCbm || ''}
                          onChange={(e) => updateLine(line.id, { manualCbm: e.target.value })}
                          className={lineFieldClass}
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1">
                      <label className={lineLabelClass}>Peso unit. {lineWeightUnit}</label>
                      <div className="grid grid-cols-[1fr_82px] gap-2">
                        <input
                          type="number"
                          step="any"
                          placeholder={`Peso unit. ${lineWeightUnit}`}
                          value={line.weight}
                          onChange={(e) => updateLine(line.id, { weight: e.target.value })}
                          className={lineFieldClass}
                        />

                        <select
                          value={lineWeightUnit}
                          onChange={(e) =>
                            updateLine(line.id, {
                              weightUnit: e.target.value as CargoDimensionLine['weightUnit'],
                            })
                          }
                          className={lineFieldClass}
                        >
                          <option value="lbs">LBS</option>
                          <option value="kg">KG</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {lineVolumeMode === 'dimensions' && (
                    <div className="grid grid-cols-3 gap-3">
                      {(
                        [
                          ['length', 'Largo'],
                          ['width', 'Ancho'],
                          ['height', 'Alto'],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex flex-col gap-1">
                          <label className={lineLabelClass}>{label}</label>
                          <input
                            type="number"
                            step="any"
                            placeholder="0"
                            value={line[key]}
                            onChange={(e) => updateLine(line.id, { [key]: e.target.value })}
                            className={`${fieldClass} h-10`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    KG {formatNumber(getLineTotalWeightKg(line), 2)} · LBS{' '}
                    {formatNumber(getLineTotalWeightLbs(line), 0)} · FT3{' '}
                    {formatNumber(calculateLineFt3(line), 2)} · CBM{' '}
                    {formatNumber(calculateLineCbm(line), 3)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className={`grid gap-3 sm:grid-cols-2 ${airWeights ? 'lg:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-4'}`}>
        <TotalCard label="Peso KG" value={formatNumber(totalKg, 2)} />
        <TotalCard label="Peso LBS" value={formatNumber(totalLbs, 0)} />
        <TotalCard label="FT3" value={formatNumber(totalFt3, 2)} />
        <TotalCard label="CBM" value={formatNumber(totalCbm, 3)} />
        {airWeights && (
          <>
            <TotalCard
              label="Peso volumétrico KG"
              value={formatNumber(airWeights.volumetricWeightKg, 2)}
              hint={`CBM × ${formatNumber(AIR_VOLUMETRIC_KG_PER_CBM, 2)}`}
            />
            <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950/30">
              <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">
                Peso cobrable KG
              </p>
              <p className="mt-1 text-lg font-semibold text-sky-900 dark:text-sky-100">
                {formatNumber(airWeights.chargeableWeightKg, 2)}
              </p>
              <p className="text-xs text-sky-700/80 dark:text-sky-300/80">
                Mayor entre peso real y volumétrico
              </p>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}
        title="Quitar línea de carga"
        description={pendingRemoval
          ? `¿Deseas descartar ${pendingRemoval.quantity || 0} ${pendingRemoval.packageType} y todos sus valores?`
          : undefined}
        confirmLabel="Quitar línea"
        danger
        onConfirm={() => {
          if (pendingRemoval) removeLine(pendingRemoval.id)
          setPendingRemoval(null)
        }}
      />
    </div>
  )
}

function TotalCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  )
}
