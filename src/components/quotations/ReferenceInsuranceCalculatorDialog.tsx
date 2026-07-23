'use client'

import { useEffect, useState } from 'react'
import { Calculator, RotateCcw } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import {
  calculateInsuranceDeclaration,
  DEFAULT_INSURANCE_COST_RATE_PERCENT,
  INSURANCE_SURCHARGE_PERCENT,
} from '@/src/lib/insurance-calculator'

type ReferenceInsuranceCalculatorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const initialValues = {
  invoiceValue: '',
  freightValue: '',
  nationalTaxes: '',
  ratePercent: String(DEFAULT_INSURANCE_COST_RATE_PERCENT),
}

const toAmount = (value: string) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0
}

const formatAmount = (value: number) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export default function ReferenceInsuranceCalculatorDialog({
  open,
  onOpenChange,
}: ReferenceInsuranceCalculatorDialogProps) {
  const [values, setValues] = useState(initialValues)
  const [includeAdditionalExpenses, setIncludeAdditionalExpenses] = useState(true)
  const [includeOperationalExpenses, setIncludeOperationalExpenses] = useState(false)

  const reset = () => {
    setValues(initialValues)
    setIncludeAdditionalExpenses(true)
    setIncludeOperationalExpenses(false)
  }

  useEffect(() => {
    if (open) reset()
  }, [open])

  const calculation = calculateInsuranceDeclaration({
    invoiceValue: toAmount(values.invoiceValue),
    freightValue: toAmount(values.freightValue),
    nationalTaxes: toAmount(values.nationalTaxes),
    includeAdditionalExpenses,
    includeOperationalExpenses,
    saleRatePercent: toAmount(values.ratePercent),
  })

  const updateValue = (field: keyof typeof initialValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
  }

  const inputClassName =
    'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-blue-600" />
            Calculadora de Seguro
          </DialogTitle>
          <DialogDescription>
            Estima el valor asegurado y la prima de un seguro de carga.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Valor de mercancía / FOB (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.invoiceValue}
              onChange={(event) => updateValue('invoiceValue', event.target.value)}
              placeholder="0.00"
              className={inputClassName}
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Flete y servicios (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.freightValue}
              onChange={(event) => updateValue('freightValue', event.target.value)}
              placeholder="0.00"
              className={inputClassName}
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Impuestos nacionales (USD)
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.nationalTaxes}
              onChange={(event) => updateValue('nationalTaxes', event.target.value)}
              placeholder="0.00"
              className={inputClassName}
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Tarifa de seguro (%)
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.ratePercent}
              onChange={(event) => updateValue('ratePercent', event.target.value)}
              className={inputClassName}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <span>Gastos adicionales ({INSURANCE_SURCHARGE_PERCENT}%)</span>
            <input
              type="checkbox"
              checked={includeAdditionalExpenses}
              onChange={(event) => setIncludeAdditionalExpenses(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <span>Gastos operacionales ({INSURANCE_SURCHARGE_PERCENT}%)</span>
            <input
              type="checkbox"
              checked={includeOperationalExpenses}
              onChange={(event) => setIncludeOperationalExpenses(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 bg-slate-50 px-4 py-3 text-sm dark:bg-slate-900">
            <span>Subtotal</span>
            <strong>USD {formatAmount(calculation.subtotal)}</strong>
            <span>Gastos adicionales</span>
            <strong>USD {formatAmount(calculation.additionalExpenses)}</strong>
            <span>Gastos operacionales</span>
            <strong>USD {formatAmount(calculation.operationalExpenses)}</strong>
          </div>
          <div className="grid gap-3 border-t border-blue-200 bg-blue-50 px-4 py-4 sm:grid-cols-2 dark:border-blue-900/60 dark:bg-blue-950/30">
            <div>
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Valor asegurado
              </p>
              <p className="mt-1 text-xl font-bold text-blue-950 dark:text-blue-100">
                USD {formatAmount(calculation.insuredValue)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                Prima estimada ({formatAmount(toAmount(values.ratePercent))}%)
              </p>
              <p className="mt-1 text-xl font-bold text-blue-950 dark:text-blue-100">
                USD {formatAmount(calculation.insuranceSale)}
              </p>
            </div>
          </div>
        </div>

        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          Cálculo únicamente de referencia. No guarda información ni sustituye la
          cotización, condiciones, exclusiones o aprobación de la aseguradora.
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
