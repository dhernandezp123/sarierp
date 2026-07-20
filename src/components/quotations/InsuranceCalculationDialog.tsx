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
  DEFAULT_INSURANCE_COST_RATE_PERCENT,
  INSURANCE_SURCHARGE_PERCENT,
} from '@/src/lib/insurance-calculator'
import {
  isInsurancePricingItem,
  partitionInsuranceCoverage,
} from '@/src/lib/insurance-coverage'

type InsuranceCalculationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotation: any
  pricingItems: any[]
  insuranceCostRatePercent?: number
  insuranceExclusionPatterns?: string[]
  insuranceInclusionPatterns?: string[]
}

const toAmount = (value: string | number | null | undefined) => {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

const formatAmount = (value: number) =>
  Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

export function InsuranceCalculationDialog({
  open,
  onOpenChange,
  quotation,
  pricingItems,
  insuranceCostRatePercent = DEFAULT_INSURANCE_COST_RATE_PERCENT,
  insuranceExclusionPatterns = [],
  insuranceInclusionPatterns,
}: InsuranceCalculationDialogProps) {
  const insuranceItem = pricingItems.find(isInsurancePricingItem)
  const insuranceCoverage = useMemo(
    () =>
      partitionInsuranceCoverage(
        pricingItems,
        insuranceExclusionPatterns,
        insuranceInclusionPatterns
      ),
    [pricingItems, insuranceExclusionPatterns, insuranceInclusionPatterns]
  )
  const commercialServiceItems = insuranceCoverage.included
  const excludedServiceItems = insuranceCoverage.excluded
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
    costRatePercent: insuranceCostRatePercent,
    saleRatePercent: clientSaleRate,
  })
  const costDeclaration = calculateInsuranceDeclaration({
    invoiceValue: invoice,
    freightValue: commercialServiceCost,
    nationalTaxes: 0,
    includeAdditionalExpenses,
    includeOperationalExpenses,
    costRatePercent: insuranceCostRatePercent,
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
  const storedTax = toAmount(insuranceItem?.tax_amount)
  const insuranceTaxRate = insuranceItem?.taxable
    ? toAmount(insuranceItem?.tax_rate) ||
      (storedSale > 0 ? (storedTax / storedSale) * 100 : 0)
    : 0
  const calculatedInsuranceTax =
    insuranceSale * (insuranceTaxRate / 100)
  const insuranceSaleWithTax = insuranceSale + calculatedInsuranceTax
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
            body { width: min(1100px, calc(100vw - 32px)); margin: 24px auto; color: #0f172a; font-family: Arial, sans-serif; }
            header { margin-bottom: 14px; border-bottom: 3px solid #075f9e; padding-bottom: 10px; }
            h1 { margin: 0; color: #075f9e; font-size: 22px; }
            .meta { margin-top: 5px; color: #475569; font-size: 12px; }
            .intro { margin: 0 0 14px; color: #475569; font-size: 12px; }
            .section { margin-top: 16px; break-inside: avoid; }
            .section-title { margin: 0 0 8px; color: #075f9e; font-size: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background: #075f9e; color: white; padding: 7px; text-align: left; }
            td { border: 1px solid #94a3b8; padding: 6px 7px; }
            .money { text-align: right; font-weight: 700; white-space: nowrap; }
            .center { text-align: center; }
            tfoot td { background: #f1f5f9; font-weight: 700; border-top: 2px solid #075f9e; }
            .calculation-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
            .calculation-card { overflow: hidden; border: 1px solid #94a3b8; border-radius: 8px; break-inside: avoid; }
            .calculation-card h2 { margin: 0; padding: 9px 11px; background: #e6f1f8; color: #075f9e; font-size: 14px; }
            .calculation-card table td:first-child { width: 66%; }
            .calculation-card .base td { border-top: 2px solid #075f9e; background: #f1f5f9; font-weight: 700; }
            .calculation-card .premium-result td { border-top: 3px solid #075f9e; background: #dbeafe; color: #075f9e; font-size: 13px; font-weight: 700; }
            .formula-note { padding: 8px 11px; background: #f8fafc; color: #475569; font-size: 10px; }
            .declared-adjustment { display: none; margin-top: 8px; padding: 8px; background: #fff7d6; border: 1px solid #e5b93d; font-size: 10px; }
            .excluded-services { display: none; margin-top: 12px; }
            .excluded-services th { background: #92400e; }
            .excluded-services tfoot td { background: #fffbeb; border-top-color: #d97706; }
            .insurer-section { margin-top: 18px; break-inside: avoid; }
            .insurer-section td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
            .total td { border-top: 3px solid #075f9e; background: #e6f1f8; font-size: 15px; }
            .notice { margin-top: 18px; padding: 10px; background: #fff7d6; border: 1px solid #e5b93d; font-size: 11px; }
            @media print { body { width: auto; margin: 0; } }
          </style>
        </head>
        <body>
          <header><h1>Detalle de cálculo del seguro de carga</h1><div class="meta" id="meta"></div></header>
          <p class="intro">El seguro Full Cover utiliza los servicios permitidos por la política de la empresa. Siempre excluye la propia línea de seguro y el ISV; también excluye las líneas que coincidan con las reglas configuradas. El costo usa los costos internos y la venta usa los valores ofrecidos al cliente.</p>

          <section class="section">
            <h2 class="section-title">1. Servicios incluidos en la base Full Cover</h2>
            <table>
              <thead><tr><th>Servicio</th><th class="center">QTY</th><th class="money">Costo total</th><th class="money">Venta total</th></tr></thead>
              <tbody id="services-body"></tbody>
              <tfoot><tr><td colspan="2">Total servicios incluidos, sin seguro ni ISV</td><td class="money" id="services-cost-total"></td><td class="money" id="services-sale-total"></td></tr></tfoot>
            </table>
            <div class="declared-adjustment" id="declared-adjustment"></div>
            <div class="excluded-services" id="excluded-services-section">
              <h2 class="section-title">Servicios excluidos por política de empresa</h2>
              <table>
                <thead><tr><th>Servicio excluido</th><th>Regla aplicada</th><th class="money">Costo no incluido</th><th class="money">Venta no incluida</th></tr></thead>
                <tbody id="excluded-services-body"></tbody>
              </table>
            </div>
          </section>

          <div class="calculation-grid">
            <section class="calculation-card">
              <h2>2. Cálculo del costo del seguro</h2>
              <table>
                <tbody>
                  <tr><td>Valor factura / FOB</td><td class="money" id="cost-invoice"></td></tr>
                  <tr><td>Costos internos de servicios</td><td class="money" id="cost-services"></td></tr>
                  <tr><td>Subtotal costo (FOB + servicios)</td><td class="money" id="cost-subtotal"></td></tr>
                  <tr><td id="cost-additional-label"></td><td class="money" id="cost-additional"></td></tr>
                  <tr><td id="cost-operational-label"></td><td class="money" id="cost-operational"></td></tr>
                  <tr class="base"><td>Base asegurada de costo</td><td class="money" id="cost-insured-base"></td></tr>
                  <tr class="premium-result"><td id="cost-premium-label"></td><td class="money" id="cost-premium"></td></tr>
                </tbody>
              </table>
              <div class="formula-note" id="cost-formula-detail"></div>
            </section>

            <section class="calculation-card">
              <h2>3. Cálculo de la venta del seguro</h2>
              <table>
                <tbody>
                  <tr><td>Valor factura / FOB</td><td class="money" id="sale-invoice"></td></tr>
                  <tr><td>Venta de servicios declarada</td><td class="money" id="sale-services"></td></tr>
                  <tr><td>Subtotal venta (FOB + servicios)</td><td class="money" id="sale-subtotal"></td></tr>
                  <tr><td id="sale-additional-label"></td><td class="money" id="sale-additional"></td></tr>
                  <tr><td id="sale-operational-label"></td><td class="money" id="sale-operational"></td></tr>
                  <tr class="base"><td>Base asegurada de venta</td><td class="money" id="sale-insured-base"></td></tr>
                  <tr><td id="sale-premium-label"></td><td class="money" id="sale-premium"></td></tr>
                  <tr><td id="sale-tax-label"></td><td class="money" id="sale-tax"></td></tr>
                  <tr class="premium-result"><td>Total seguro cobrado al cliente</td><td class="money" id="sale-total-with-tax"></td></tr>
                </tbody>
              </table>
              <div class="formula-note" id="sale-formula-detail"></div>
            </section>
          </div>

          <section class="insurer-section">
            <h2 class="section-title">4. Datos para completar el formato de la aseguradora</h2>
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
          </section>
          <div class="notice">Documento de apoyo para completar la solicitud de la aseguradora. Verifique el FOB, los servicios incluidos y las exclusiones aplicadas por la política de empresa. El seguro y el ISV no forman parte de la base.</div>
        </body>
      </html>`)
    printWindow.document.close()

    const setText = (id: string, value: string) => {
      const element = printWindow.document.getElementById(id)
      if (element) element.textContent = value
    }
    const money = (value: number) => `USD ${formatAmount(value)}`
    const servicesBody = printWindow.document.getElementById('services-body')

    commercialServiceItems.forEach((item) => {
      if (!servicesBody) return

      const quantity = Math.max(toAmount(item.quantity), 1)
      const row = printWindow.document.createElement('tr')
      const values = [
        `${item.description || 'Servicio'}${
          item.insurance_coverage_override === true
            ? ' (Inclusión excepcional)'
            : ''
        }`,
        String(quantity),
        money(toAmount(item.cost_amount) * quantity),
        money(toAmount(item.sale_amount) * quantity),
      ]

      values.forEach((value, index) => {
        const cell = printWindow.document.createElement('td')
        cell.textContent = value

        if (index === 1) cell.className = 'center'
        if (index >= 2) cell.className = 'money'

        row.appendChild(cell)
      })

      servicesBody.appendChild(row)
    })

    if (servicesBody && commercialServiceItems.length === 0) {
      const row = printWindow.document.createElement('tr')
      const cell = printWindow.document.createElement('td')
      cell.colSpan = 4
      cell.textContent = 'No se encontraron servicios incluidos.'
      row.appendChild(cell)
      servicesBody.appendChild(row)
    }

    const excludedServicesSection = printWindow.document.getElementById(
      'excluded-services-section'
    )
    const excludedServicesBody = printWindow.document.getElementById(
      'excluded-services-body'
    )

    if (
      excludedServicesSection &&
      excludedServicesBody &&
      excludedServiceItems.length > 0
    ) {
      excludedServicesSection.style.display = 'block'

      excludedServiceItems.forEach(({ item, matchedPattern }) => {
        const quantity = Math.max(toAmount(item.quantity), 1)
        const row = printWindow.document.createElement('tr')
        const values = [
          item.description || item.rate_code || 'Servicio',
          matchedPattern,
          money(toAmount(item.cost_amount) * quantity),
          money(toAmount(item.sale_amount) * quantity),
        ]

        values.forEach((value, index) => {
          const cell = printWindow.document.createElement('td')
          cell.textContent = value
          if (index >= 2) cell.className = 'money'
          row.appendChild(cell)
        })

        excludedServicesBody.appendChild(row)
      })
    }

    setText(
      'meta',
      `${quotation?.quotation_number || 'Cotización'} · ${quotation?.clientes?.nombre || 'Cliente'}`
    )
    setText('services-cost-total', money(commercialServiceCost))
    setText('services-sale-total', money(commercialServiceSale))

    const declaredAdjustment = printWindow.document.getElementById(
      'declared-adjustment'
    )
    if (
      declaredAdjustment &&
      Math.abs(freight - commercialServiceSale) >= 0.01
    ) {
      declaredAdjustment.style.display = 'block'
      declaredAdjustment.textContent =
        `La venta total de servicios de la cotización es ${money(commercialServiceSale)}, ` +
        `pero para el formato se declaró manualmente ${money(freight)}. ` +
        `El cálculo de venta utiliza el valor declarado.`
    }

    setText('cost-invoice', money(invoice))
    setText('cost-services', money(commercialServiceCost))
    setText('cost-subtotal', money(costDeclaration.subtotal))
    setText(
      'cost-additional-label',
      `Gastos adicionales (${INSURANCE_SURCHARGE_PERCENT}%) - ${
        includeAdditionalExpenses ? 'Sí' : 'No'
      }`
    )
    setText('cost-additional', money(costDeclaration.additionalExpenses))
    setText(
      'cost-operational-label',
      `Gastos operacionales (${INSURANCE_SURCHARGE_PERCENT}%) - ${
        includeOperationalExpenses ? 'Sí' : 'No'
      }`
    )
    setText('cost-operational', money(costDeclaration.operationalExpenses))
    setText('cost-insured-base', money(costDeclaration.insuredValue))
    setText(
      'cost-premium-label',
      `Costo del seguro (${insuranceCostRatePercent}%)`
    )
    setText('cost-premium', money(insuranceCost))
    setText(
      'cost-formula-detail',
      `Base: (${money(invoice)} + ${money(commercialServiceCost)}) + ` +
        `${money(costDeclaration.additionalExpenses)} + ${money(costDeclaration.operationalExpenses)} ` +
        `= ${money(costDeclaration.insuredValue)}. Prima: ${money(costDeclaration.insuredValue)} × ` +
        `${insuranceCostRatePercent}% = ${money(insuranceCost)}.`
    )

    setText('sale-invoice', money(invoice))
    setText('sale-services', money(freight))
    setText('sale-subtotal', money(saleDeclaration.subtotal))
    setText(
      'sale-additional-label',
      `Gastos adicionales (${INSURANCE_SURCHARGE_PERCENT}%) - ${
        includeAdditionalExpenses ? 'Sí' : 'No'
      }`
    )
    setText('sale-additional', money(saleDeclaration.additionalExpenses))
    setText(
      'sale-operational-label',
      `Gastos operacionales (${INSURANCE_SURCHARGE_PERCENT}%) - ${
        includeOperationalExpenses ? 'Sí' : 'No'
      }`
    )
    setText('sale-operational', money(saleDeclaration.operationalExpenses))
    setText('sale-insured-base', money(saleDeclaration.insuredValue))
    setText('sale-premium-label', `Venta del seguro (${clientSaleRate}%)`)
    setText('sale-premium', money(insuranceSale))
    setText(
      'sale-tax-label',
      insuranceTaxRate > 0
        ? `ISV sobre el seguro (${formatAmount(insuranceTaxRate)}%)`
        : 'ISV sobre el seguro - No aplicado'
    )
    setText('sale-tax', money(calculatedInsuranceTax))
    setText('sale-total-with-tax', money(insuranceSaleWithTax))
    setText(
      'sale-formula-detail',
      `Base: (${money(invoice)} + ${money(freight)}) + ` +
        `${money(saleDeclaration.additionalExpenses)} + ${money(saleDeclaration.operationalExpenses)} ` +
        `= ${money(saleDeclaration.insuredValue)}. Prima: ${money(saleDeclaration.insuredValue)} × ` +
        `${clientSaleRate}% = ${money(insuranceSale)}. ` +
        `Total cliente: ${money(insuranceSale)} + ISV ${money(calculatedInsuranceTax)} ` +
        `= ${money(insuranceSaleWithTax)}.`
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
          <p className="font-semibold">Servicios incluidos en Full Cover: USD {formatAmount(commercialServiceSale)}</p>
          {commercialServiceItems.length > 0 ? (
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {commercialServiceItems.map((item) => (
                <li key={item.id || item.description}>
                  {item.description}: USD{' '}
                  {formatAmount(
                    toAmount(item.sale_amount) * Math.max(toAmount(item.quantity), 1)
                  )}
                  {item.insurance_coverage_override === true
                    ? ' — inclusión excepcional solicitada por el cliente'
                    : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">No se encontraron servicios para la base full cover.</p>
          )}
          <p className="mt-2">Se incluyen los servicios que no coinciden con las exclusiones configuradas por la empresa. El seguro y el ISV nunca forman parte de la base. El campo es editable para corregir el valor declarado antes de imprimir.</p>
        </div>

        {excludedServiceItems.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold">Servicios excluidos por política</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {excludedServiceItems.map(({ item, matchedPattern }) => (
                <li key={item.id || `${item.description}-${matchedPattern}`}>
                  {item.description || item.rate_code || 'Servicio'} — regla:{' '}
                  {matchedPattern}
                </li>
              ))}
            </ul>
          </div>
        )}

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
            <p className="text-xs text-slate-500">Costo aseguradora ({insuranceCostRatePercent}%)</p>
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
              El Full Cover incluye únicamente los servicios permitidos por la
              política de empresa. Para el costo toma{' '}
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
                        <td className="px-3 py-2">
                          {item.description || 'Servicio'}
                          {item.insurance_coverage_override === true && (
                            <span className="ml-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                              (inclusión excepcional)
                            </span>
                          )}
                        </td>
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
                FOB declarado: USD {formatAmount(invoice)}. Servicios incluidos de
                venta, sin seguro ni ISV: USD {formatAmount(freight)}. Valor Full Cover de
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
