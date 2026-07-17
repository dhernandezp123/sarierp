'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileText, Printer } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import {
  calculateInsuranceDeclaration,
  INSURANCE_COST_RATE_PERCENT,
  INSURANCE_SURCHARGE_PERCENT,
} from '@/src/lib/insurance-calculator'

type InsuranceCalculationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotation: any
  pricingItems: any[]
}

const normalizeText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const toAmount = (value: string | number | null | undefined) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

const formatAmount = (value: number) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const isInsuranceItem = (item: any) =>
  normalizeText(item.item_type) === 'seguro' ||
  normalizeText(item.description).includes('seguro de carga')

export function InsuranceCalculationDialog({
  open,
  onOpenChange,
  quotation,
  pricingItems,
}: InsuranceCalculationDialogProps) {
  const insuranceItem = pricingItems.find(isInsuranceItem)
  const commercialServiceItems = useMemo(
    () => pricingItems.filter((item) => !isInsuranceItem(item)),
    [pricingItems]
  )
  const commercialServiceCost = commercialServiceItems.reduce(
    (sum, item) =>
      sum + toAmount(item.cost_amount) * Math.max(toAmount(item.quantity), 1),
    0
  )
  const commercialServiceSale = commercialServiceItems.reduce(
    (sum, item) =>
      sum + toAmount(item.sale_amount) * Math.max(toAmount(item.quantity), 1),
    0
  )
  const clientSaleRate = toAmount(quotation?.clientes?.seguro_porcentaje) || 0
  const defaultInvoiceValue = toAmount(
    quotation?.commercial_value || quotation?.fob_value
  )

  const [invoiceValue, setInvoiceValue] = useState('')
  const [freightValue, setFreightValue] = useState('')
  const [includeAdditionalExpenses, setIncludeAdditionalExpenses] = useState(true)
  const [includeOperationalExpenses, setIncludeOperationalExpenses] = useState(false)

  useEffect(() => {
    if (!open) return
    setInvoiceValue(String(defaultInvoiceValue || ''))
    setFreightValue(String(commercialServiceSale || ''))
    setIncludeAdditionalExpenses(true)
    setIncludeOperationalExpenses(false)
  }, [open, defaultInvoiceValue, commercialServiceSale])

  const invoice = toAmount(invoiceValue)
  const freight = toAmount(freightValue)
  const saleDeclaration = calculateInsuranceDeclaration({
    invoiceValue: invoice,
    freightValue: freight,
    nationalTaxes: 0,
    includeAdditionalExpenses,
    includeOperationalExpenses,
    saleRatePercent: clientSaleRate,
  })
  const costDeclaration = calculateInsuranceDeclaration({
    invoiceValue: invoice,
    freightValue: commercialServiceCost,
    nationalTaxes: 0,
    includeAdditionalExpenses,
    includeOperationalExpenses,
    saleRatePercent: clientSaleRate,
  })
  const {
    subtotal,
    additionalExpenses,
    operationalExpenses,
    insuredValue,
    insuranceSale,
  } = saleDeclaration
  const insuranceCost = costDeclaration.insuranceCost
  const storedCost = toAmount(insuranceItem?.cost_amount)
  const storedSale = toAmount(insuranceItem?.sale_amount)
  const costDifference = storedCost - insuranceCost
  const saleDifference = storedSale - insuranceSale
  const commercialCostInsuredBase = costDeclaration.insuredValue
  const commercialSaleInsuredBase = saleDeclaration.insuredValue
  const hasDifference =
    Math.abs(costDifference) >= 0.01 || Math.abs(saleDifference) >= 0.01

  const printCalculation = () => {
    if (invoice <= 0) {
      toast.error('Ingresa el valor de factura antes de imprimir.')
      return
    }
    if (clientSaleRate <= 0) {
      toast.error('El cliente no tiene porcentaje de venta de seguro configurado.')
      return
    }

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('El navegador bloqueó la pestaña de impresión.')
      return
    }

    printWindow.document.open()
    printWindow.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Cálculo para aseguradora</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            body { width: min(1000px, calc(100vw - 32px)); margin: 24px auto; color: #0f172a; font-family: Arial, sans-serif; }
            header { margin-bottom: 18px; border-bottom: 3px solid #075f9e; padding-bottom: 10px; }
            h1 { margin: 0; color: #075f9e; font-size: 22px; }
            .meta { margin-top: 5px; color: #475569; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th { background: #075f9e; color: white; padding: 9px; text-align: left; }
            td { border: 1px solid #94a3b8; padding: 8px; }
            td:last-child { text-align: right; font-weight: 700; }
            .total td { border-top: 3px solid #075f9e; background: #e6f1f8; font-size: 15px; }
            .premium { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; }
            .card { border: 1px solid #94a3b8; border-radius: 8px; padding: 14px; }
            .card h2 { margin: 0 0 10px; color: #075f9e; font-size: 15px; }
            .row { display: flex; justify-content: space-between; margin-top: 7px; }
            .notice { margin-top: 18px; padding: 10px; background: #fff7d6; border: 1px solid #e5b93d; font-size: 11px; }
            @media print { body { width: auto; margin: 0; } }
          </style>
        </head>
        <body>
          <header><h1>Cálculo de valor asegurado</h1><div class="meta" id="meta"></div></header>
          <table>
            <thead><tr><th>Concepto</th><th>Aplicación</th><th>Valor USD</th></tr></thead>
            <tbody>
              <tr><td>1. Valor factura / FOB</td><td>Obligatorio</td><td id="invoice"></td></tr>
              <tr><td>2. Servicios full cover declarados</td><td>Sin seguro ni ISV</td><td id="freight"></td></tr>
              <tr><td>3. Impuestos nacionales</td><td>Excluidos</td><td id="taxes"></td></tr>
              <tr><td>Subtotal (FOB + servicios)</td><td></td><td id="subtotal"></td></tr>
              <tr><td>4. Gastos adicionales (10%)</td><td id="additional-status"></td><td id="additional"></td></tr>
              <tr><td>5. Gastos operacionales (10%)</td><td id="operational-status"></td><td id="operational"></td></tr>
              <tr class="total"><td>VALOR TOTAL ASEGURADO</td><td></td><td id="insured"></td></tr>
            </tbody>
          </table>
          <div class="premium">
            <div class="card"><h2>Costo de seguro</h2><div class="row"><span id="cost-formula"></span><strong id="cost"></strong></div></div>
            <div class="card"><h2>Venta de seguro</h2><div class="row"><span id="sale-formula"></span><strong id="sale"></strong></div></div>
          </div>
          <div class="notice">Documento de apoyo para completar la solicitud de la aseguradora. Verifique que el FOB y todos los servicios full cover declarados coincidan con la cotización; no incluya seguro ni ISV.</div>
        </body>
      </html>`)
    printWindow.document.close()

    const setText = (id: string, value: string) => {
      const element = printWindow.document.getElementById(id)
      if (element) element.textContent = value
    }
    const money = (value: number) => `USD ${formatAmount(value)}`
    setText(
      'meta',
      `${quotation?.quotation_number || 'Cotización'} · ${quotation?.clientes?.nombre || 'Cliente'}`
    )
    setText('invoice', money(invoice))
    setText('freight', money(freight))
    setText('taxes', money(0))
    setText('subtotal', money(subtotal))
    setText('additional-status', includeAdditionalExpenses ? 'Sí' : 'No')
    setText('additional', money(additionalExpenses))
    setText('operational-status', includeOperationalExpenses ? 'Sí' : 'No')
    setText('operational', money(operationalExpenses))
    setText('insured', money(insuredValue))
    setText('cost-formula', `${formatAmount(commercialCostInsuredBase)} × ${INSURANCE_COST_RATE_PERCENT}%`)
    setText('cost', money(insuranceCost))
    setText('sale-formula', `${formatAmount(insuredValue)} × ${clientSaleRate}%`)
    setText('sale', money(insuranceSale))
    printWindow.focus()
    window.setTimeout(() => printWindow.print(), 250)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Cálculo para aseguradora
          </DialogTitle>
          <DialogDescription>
            Base separada del cálculo comercial para completar el formato de valor asegurado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Valor factura / FOB
            <input
              type="number"
              min="0"
              step="0.01"
              value={invoiceValue}
              onChange={(event) => setInvoiceValue(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Servicios full cover declarados
            <input
              type="number"
              min="0"
              step="0.01"
              value={freightValue}
              onChange={(event) => setFreightValue(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
            Impuestos nacionales (excluidos)
            <input
              type="number"
              value="0"
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-semibold">Servicios incluidos en full cover: USD {formatAmount(commercialServiceSale)}</p>
          {commercialServiceItems.length > 0 ? (
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {commercialServiceItems.map((item) => (
                <li key={item.id || item.description}>
                  {item.description}: USD{' '}
                  {formatAmount(
                    toAmount(item.sale_amount) * Math.max(toAmount(item.quantity), 1)
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">No se encontraron servicios para la base full cover.</p>
          )}
          <p className="mt-2">Se incluyen todos los servicios excepto el seguro y el ISV. El campo es editable para corregir el valor declarado antes de imprimir.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <span>Gastos adicionales ({INSURANCE_SURCHARGE_PERCENT}%)</span>
            <input
              type="checkbox"
              checked={includeAdditionalExpenses}
              onChange={(event) => setIncludeAdditionalExpenses(event.target.checked)}
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
            <span>Gastos operacionales ({INSURANCE_SURCHARGE_PERCENT}%)</span>
            <input
              type="checkbox"
              checked={includeOperationalExpenses}
              onChange={(event) => setIncludeOperationalExpenses(event.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-[1fr_auto] gap-3 border-b bg-slate-50 px-4 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
            <span>Subtotal (FOB + servicios, sin impuestos)</span><strong>USD {formatAmount(subtotal)}</strong>
            <span>Gastos adicionales</span><strong>USD {formatAmount(additionalExpenses)}</strong>
            <span>Gastos operacionales</span><strong>USD {formatAmount(operationalExpenses)}</strong>
          </div>
          <div className="flex items-center justify-between bg-blue-50 px-4 py-3 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100">
            <strong>Valor asegurado de venta</strong>
            <strong className="text-lg">USD {formatAmount(insuredValue)}</strong>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs text-slate-500">Costo aseguradora ({INSURANCE_COST_RATE_PERCENT}%)</p>
            <p className="mt-1 text-xl font-bold">USD {formatAmount(insuranceCost)}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Base: USD {formatAmount(commercialCostInsuredBase)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <p className="text-xs text-slate-500">Venta cliente ({clientSaleRate}%)</p>
            <p className="mt-1 text-xl font-bold">USD {formatAmount(insuranceSale)}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Base: USD {formatAmount(commercialSaleInsuredBase)}
            </p>
          </div>
        </div>

        {insuranceItem && hasDifference && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">La línea comercial no coincide con esta base asegurada.</p>
            <p className="mt-1">
              Guardado: costo USD {formatAmount(storedCost)}, venta USD {formatAmount(storedSale)}.
              Diferencia: costo USD {formatAmount(costDifference)}, venta USD {formatAmount(saleDifference)}.
            </p>
          </div>
        )}

        <details className="group overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <summary className="flex cursor-pointer list-none items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-100">
            Ver detalle de FOB + servicios full cover
            <span className="text-xs font-normal text-slate-500 group-open:hidden">
              Mostrar
            </span>
            <span className="hidden text-xs font-normal text-slate-500 group-open:inline">
              Ocultar
            </span>
          </summary>

          <div className="space-y-3 p-4">
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              El full cover incluye todos los servicios sin seguro. Para el costo
              toma{' '}
              <strong>cost_amount × cantidad</strong>; para la venta toma{' '}
              <strong>sale_amount × cantidad</strong>. El ISV no forma parte de
              ninguna base.
            </p>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-2">Servicio incluido</th>
                    <th className="px-3 py-2 text-center">QTY</th>
                    <th className="px-3 py-2 text-right">Costo total</th>
                    <th className="px-3 py-2 text-right">Venta total</th>
                  </tr>
                </thead>
                <tbody>
                  {commercialServiceItems.map((item) => {
                    const quantity = Math.max(toAmount(item.quantity), 1)
                    return (
                      <tr
                        key={item.id || item.description}
                        className="border-t border-slate-200 dark:border-slate-700"
                      >
                        <td className="px-3 py-2">{item.description || 'Servicio'}</td>
                        <td className="px-3 py-2 text-center">{quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          USD {formatAmount(toAmount(item.cost_amount) * quantity)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          USD {formatAmount(toAmount(item.sale_amount) * quantity)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-400 bg-slate-50 font-bold dark:bg-slate-900">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>Total servicios</td>
                    <td className="px-3 py-2 text-right">USD {formatAmount(commercialServiceCost)}</td>
                    <td className="px-3 py-2 text-right">USD {formatAmount(commercialServiceSale)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900">
                <p className="font-semibold">Base full cover de costo</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  (FOB {formatAmount(invoice)} + costos {formatAmount(commercialServiceCost)}) × 1.10
                </p>
                <p className="mt-1 font-bold">USD {formatAmount(commercialCostInsuredBase)}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-900">
                <p className="font-semibold">Base full cover de venta</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  (FOB {formatAmount(invoice)} + ventas {formatAmount(commercialServiceSale)}) × 1.10
                </p>
                <p className="mt-1 font-bold">USD {formatAmount(commercialSaleInsuredBase)}</p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
              <p className="font-semibold">Valores que Operaciones debe validar antes de enviar</p>
              <p className="mt-1">
                FOB declarado: USD {formatAmount(invoice)}. Servicios de venta sin
                seguro ni ISV: USD {formatAmount(freight)}. Valor full cover de
                venta: USD {formatAmount(commercialSaleInsuredBase)}.
              </p>
            </div>
          </div>
        </details>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={printCalculation}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Printer className="h-4 w-4" />
            Imprimir / Guardar PDF
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
