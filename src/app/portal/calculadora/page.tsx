'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Calculator, RotateCcw } from 'lucide-react'

type Unit = 'in' | 'cm'

export default function CalculadoraPage() {
  const router = useRouter()
  const [unit, setUnit] = useState<Unit>('in')
  const [dims, setDims] = useState({ l: '', w: '', h: '', weight: '' })

  const l = parseFloat(dims.l) || 0
  const w = parseFloat(dims.w) || 0
  const h = parseFloat(dims.h) || 0
  const weightLbs = parseFloat(dims.weight) || 0

  // Conversions
  const toIn = (v: number) => unit === 'cm' ? v / 2.54 : v
  const li = toIn(l), wi = toIn(w), hi = toIn(h)

  const ft3  = li && wi && hi ? (li * wi * hi) / 1728 : null
  const cbm  = li && wi && hi ? (li * wi * hi) * 0.000016387064 : null
  const weightKg = weightLbs ? weightLbs * 0.453592 : null

  // Dimensional weight (using 139 divisor standard for air)
  const dimWeightKg = cbm ? cbm * 167 : null

  const reset = () => setDims({ l: '', w: '', h: '', weight: '' })

  const fieldClass = 'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-center text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300 placeholder:font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400'

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Calculadora de Volumen</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">FT³ y CBM en tiempo real</p>
        </div>
      </div>

      {/* Unit toggle */}
      <div className="flex items-center justify-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
        {(['in', 'cm'] as Unit[]).map(u => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
              unit === u
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {u === 'in' ? 'Pulgadas (in)' : 'Centímetros (cm)'}
          </button>
        ))}
      </div>

      {/* Dimensions input */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Dimensiones
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {(['l', 'w', 'h'] as const).map((key, i) => (
            <div key={key}>
              <label className="mb-1.5 block text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {['Largo', 'Ancho', 'Alto'][i]}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={dims[key]}
                onChange={e => setDims(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder="0"
                className={fieldClass}
              />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            Peso real (lbs)
          </label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={dims.weight}
            onChange={e => setDims(prev => ({ ...prev, weight: e.target.value }))}
            placeholder="0"
            className={fieldClass}
          />
        </div>

        <button
          type="button"
          onClick={reset}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpiar
        </button>
      </div>

      {/* Results */}
      {(ft3 !== null || weightLbs > 0) ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ResultCard
              label="Volumen FT³"
              value={ft3 !== null ? ft3.toFixed(4) : '—'}
              sub="pies cúbicos"
              highlight
            />
            <ResultCard
              label="Volumen CBM"
              value={cbm !== null ? cbm.toFixed(4) : '—'}
              sub="metros cúbicos"
              highlight
            />
          </div>

          {weightLbs > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <ResultCard
                label="Peso real"
                value={`${weightLbs.toFixed(2)} lbs`}
                sub={weightKg ? `${weightKg.toFixed(2)} kg` : ''}
              />
              {dimWeightKg !== null && (
                <ResultCard
                  label="Peso volumétrico"
                  value={`${dimWeightKg.toFixed(2)} kg`}
                  sub="CBM × 167"
                />
              )}
            </div>
          )}

          {dimWeightKg !== null && weightKg !== null && (
            <div className={`rounded-2xl border px-5 py-4 ${
              dimWeightKg > weightKg
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
            }`}>
              <p className={`text-sm font-semibold ${
                dimWeightKg > weightKg
                  ? 'text-amber-800 dark:text-amber-200'
                  : 'text-emerald-800 dark:text-emerald-200'
              }`}>
                {dimWeightKg > weightKg
                  ? `⚠ Se cobrará peso volumétrico (${dimWeightKg.toFixed(2)} kg)`
                  : `✓ Se cobrará peso real (${weightKg.toFixed(2)} kg)`
                }
              </p>
              <p className={`mt-0.5 text-xs ${
                dimWeightKg > weightKg ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                Se factura el mayor entre peso real y peso volumétrico
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
          <Calculator className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Ingresa las dimensiones para ver el cálculo</p>
        </div>
      )}

      {/* Formula reference */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/60">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Referencia de fórmulas</h3>
        <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
          <p><strong className="text-slate-700 dark:text-slate-300">FT³</strong> = (L × W × H en pulgadas) ÷ 1,728</p>
          <p><strong className="text-slate-700 dark:text-slate-300">CBM</strong> = (L × W × H en pulgadas) × 0.0000164</p>
          <p><strong className="text-slate-700 dark:text-slate-300">Peso vol.</strong> = CBM × 167 (kg) — estándar aéreo IATA</p>
          <p><strong className="text-slate-700 dark:text-slate-300">1 pulgada</strong> = 2.54 cm &nbsp;|&nbsp; <strong className="text-slate-700 dark:text-slate-300">1 lb</strong> = 0.4536 kg</p>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      highlight
        ? 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20'
        : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
    }`}>
      <p className={`text-xs font-medium ${highlight ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? 'text-blue-900 dark:text-blue-100' : 'text-slate-900 dark:text-white'}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${highlight ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}
