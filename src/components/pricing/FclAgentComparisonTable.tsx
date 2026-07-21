'use client'

import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { toast } from 'sonner'

import { CarrierBadge } from '@/src/components/ui/CarrierBadge'
import { getCarrier } from '@/src/lib/constants/carriers'
import { cn } from '@/src/lib/utils'

type AgentQuote = any

type FclAgentComparisonTableProps = {
  agentQuotes: AgentQuote[]
  selectedQuote: any
  chargeOverrides: FclTableChargeOverrides
  bestCostQuoteId?: string | null
  fastestQuoteId?: string | null
  selectedAgentQuoteId?: string | null
  isPricingActionDisabled: boolean
  showCarrierInput: boolean
  getAgentQuoteBaseCost: (quote: AgentQuote) => number
  getAgentQuoteContainersQty: (quote: AgentQuote) => number
  getAgentQuoteProviderName: (quote?: AgentQuote | null) => string
  getValidTransitDays: (quote?: AgentQuote | null) => number | null
  formatCurrency: (value: number) => string
  formatDisplayDate: (date?: string | null) => string
  bankTransferFee: number
  taxRate: number
  onChargeOverridesChange: (
    updater: (current: FclTableChargeOverrides) => FclTableChargeOverrides
  ) => void
  onSaveTable: () => void
  onSelectQuote: (quote: AgentQuote) => void
}

type Row = {
  label: string
  getValue: (quote: AgentQuote) => ReactNode
  emphasis?: 'total' | 'cost' | 'transit'
}

export type FclEditableChargeKey =
  | 'mbl'
  | 'ps'
  | 'dthc'
  | 'localDelivery'
  | 'localDeliveryTaxable'
  | 'transshipment'
  | 'redestination'
  | 'redestinationTaxable'

export type FclTableChargeOverrides = Record<
  string,
  Partial<Record<FclEditableChargeKey, string>>
>

type EditableChargeConfig = {
  key: FclEditableChargeKey
  label: string
  getInitialValue: (quote: AgentQuote) => number
  multiplyByContainers?: boolean
  distributeAcrossContainers?: boolean
  sharedAcrossQuotes?: boolean
}

const firstFilledValue = (...values: Array<string | number | null | undefined>) =>
  values.find((value) => value !== null && value !== undefined && value !== '') ?? null

const toFiniteNumber = (value: string | number | null | undefined) => {
  const numericValue = Number(value || 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const firstNumericValue = (...values: Array<string | number | null | undefined>) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue

    const numericValue = Number(value)
    if (Number.isFinite(numericValue)) return numericValue
  }

  return 0
}

const formatNullableCurrency = (
  value: string | number | null | undefined,
  formatCurrency: (value: number) => string,
  currency = 'USD'
) => {
  const numericValue = toFiniteNumber(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'N/A'
  return `${currency} ${formatCurrency(numericValue)}`
}

export function FclAgentComparisonTable({
  agentQuotes,
  selectedQuote,
  chargeOverrides,
  bestCostQuoteId,
  fastestQuoteId,
  selectedAgentQuoteId,
  isPricingActionDisabled,
  showCarrierInput,
  getAgentQuoteBaseCost,
  getAgentQuoteContainersQty,
  getAgentQuoteProviderName,
  getValidTransitDays,
  formatCurrency,
  formatDisplayDate,
  bankTransferFee,
  taxRate,
  onChargeOverridesChange,
  onSaveTable,
  onSelectQuote,
}: FclAgentComparisonTableProps) {
  const printableTableRef = useRef<HTMLDivElement>(null)

  const getRouteValue = (quote: AgentQuote, type: 'pol' | 'pod') => {
    if (type === 'pol') {
      return (
        firstFilledValue(
          quote.pol,
          quote.port_of_loading,
          quote.puerto_origen,
          selectedQuote?.pol,
          selectedQuote?.port_of_loading,
          selectedQuote?.puerto_origen
        ) || 'N/A'
      )
    }

    return (
      firstFilledValue(
        quote.pod,
        quote.port_of_discharge,
        quote.puerto_destino,
        selectedQuote?.pod,
        selectedQuote?.port_of_discharge,
        selectedQuote?.puerto_destino
      ) || 'N/A'
    )
  }

  const editableCharges: EditableChargeConfig[] = [
    {
      key: 'mbl',
      label: 'MBL',
      getInitialValue: (quote) =>
        firstNumericValue(quote.mbl_amount, quote.mbl_cost, quote.mbl_fee),
      distributeAcrossContainers: true,
    },
    {
      key: 'ps',
      label: 'PS (Profit Share)',
      getInitialValue: (quote) =>
        firstNumericValue(
          quote.profit_per_container,
          quote.ps,
          quote.ps_fee,
          quote.port_security_fee
        ),
      multiplyByContainers: true,
    },
    {
      key: 'dthc',
      label: 'DTHC',
      getInitialValue: (quote) =>
        firstNumericValue(quote.dthc, quote.dthc_fee, quote.destination_thc),
    },
    {
      key: 'localDelivery',
      label: 'Entrega Local',
      getInitialValue: (quote) =>
        firstNumericValue(
          quote.local_delivery,
          quote.delivery_local,
          quote.entrega_local
        ),
      sharedAcrossQuotes: true,
    },
    {
      key: 'transshipment',
      label: 'Transbordo',
      getInitialValue: (quote) =>
        firstNumericValue(
          quote.transshipment_fee,
          quote.transbordo_fee,
          quote.transshipment_cost,
          quote.transbordo_cost
        ),
    },
    {
      key: 'redestination',
      label: 'Redestino',
      getInitialValue: (quote) =>
        firstNumericValue(
          quote.redestino,
          quote.redestination,
          quote.redestination_fee
        ),
      sharedAcrossQuotes: true,
    },
  ]

  const getEditableChargeValue = (
    quote: AgentQuote,
    config: EditableChargeConfig
  ) => {
    const overrideValue = chargeOverrides[quote.id]?.[config.key]
    if (overrideValue !== undefined) return toFiniteNumber(overrideValue)

    return config.getInitialValue(quote)
  }

  const getOptionalChargeTax = (
    quote: AgentQuote,
    chargeKey: 'localDelivery' | 'redestination',
    taxableKey: 'localDeliveryTaxable' | 'redestinationTaxable'
  ) => {
    const isTaxable = chargeOverrides[quote.id]?.[taxableKey] === 'true'
    if (!isTaxable) return 0

    const chargeConfig = editableCharges.find(
      (config) => config.key === chargeKey
    )
    if (!chargeConfig) return 0

    return getEditableChargeValue(quote, chargeConfig) * (taxRate / 100)
  }

  const getOptionalChargesTax = (quote: AgentQuote) =>
    getOptionalChargeTax(
      quote,
      'localDelivery',
      'localDeliveryTaxable'
    ) +
    getOptionalChargeTax(
      quote,
      'redestination',
      'redestinationTaxable'
    )

  const getAdjustedTotalCost = (quote: AgentQuote) => {
    const containersQty = Math.max(getAgentQuoteContainersQty(quote), 1)
    const oceanFreight = getAgentQuoteBaseCost(quote)
    const exwCost = firstNumericValue(
      quote.exw_amount,
      quote.exw_cost,
      quote.consolidation_fee
    )
    const editableChargesTotal = editableCharges.reduce(
      (sum, config) =>
        sum +
        getEditableChargeValue(quote, config) *
          (config.multiplyByContainers ? containersQty : 1),
      0
    )

    return Math.max(
      oceanFreight +
        exwCost +
        editableChargesTotal +
        getOptionalChargesTax(quote) +
        bankTransferFee,
      0
    )
  }

  const adjustedBestCostQuoteId = useMemo(() => {
    const validQuotes = agentQuotes.filter(
      (quote) => getAdjustedTotalCost(quote) > 0
    )

    if (validQuotes.length === 0) return bestCostQuoteId || null

    return validQuotes.reduce((best, current) =>
      getAdjustedTotalCost(current) < getAdjustedTotalCost(best)
        ? current
        : best
    ).id
  }, [agentQuotes, bestCostQuoteId, chargeOverrides])

  const updateChargeOverride = (
    quoteId: string,
    chargeKey: FclEditableChargeKey,
    value: string
  ) => {
    const config = editableCharges.find((charge) => charge.key === chargeKey)

    onChargeOverridesChange((current) => ({
      ...current,
      ...(config?.sharedAcrossQuotes
        ? Object.fromEntries(
            agentQuotes.map((quote) => [
              quote.id,
              {
                ...current[quote.id],
                [chargeKey]: value,
              },
            ])
          )
        : {
            [quoteId]: {
              ...current[quoteId],
              [chargeKey]: value,
            },
          }),
    }))
  }

  const renderEditableChargeInput = (
    quote: AgentQuote,
    config: EditableChargeConfig
  ) => {
    const currentValue = chargeOverrides[quote.id]?.[config.key]
    const displayValue =
      currentValue ?? String(config.getInitialValue(quote) || '')
    const isTransshipment = config.key === 'transshipment'
    const isLocalDelivery = config.key === 'localDelivery'
    const isRedestination = config.key === 'redestination'
    const taxableKey = isLocalDelivery
      ? 'localDeliveryTaxable'
      : 'redestinationTaxable'
    const containersQty = Math.max(getAgentQuoteContainersQty(quote), 1)
    const numericValue = toFiniteNumber(displayValue)
    const transshipmentNote = firstFilledValue(
      quote.transshipment,
      quote.transbordo
    )

    return (
      <div className="space-y-1.5">
        <label className="flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1.5 focus-within:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-slate-500">
          <span className="mr-1.5 text-xs font-semibold text-slate-400">USD</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={displayValue}
            onChange={(event) =>
              updateChargeOverride(quote.id, config.key, event.target.value)
            }
            className="w-24 bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
          />
        </label>
        {config.multiplyByContainers && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            x {containersQty} cont. = USD{' '}
            {formatCurrency(numericValue * containersQty)}
          </p>
        )}
        {config.distributeAcrossContainers && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            ÷ {containersQty} cont. = USD{' '}
            {formatCurrency(numericValue / containersQty)} por cont.
          </p>
        )}
        {(isLocalDelivery || isRedestination) && (
          <label className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={chargeOverrides[quote.id]?.[taxableKey] === 'true'}
              onChange={(event) =>
                updateChargeOverride(
                  quote.id,
                  taxableKey,
                  String(event.target.checked)
                )
              }
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Aplica ISV {taxRate}%
          </label>
        )}
        {isTransshipment && transshipmentNote && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ruta: {transshipmentNote}
          </p>
        )}
      </div>
    )
  }

  const rows: Row[] = [
    {
      label: 'Naviera / Carrier',
      getValue: (quote) =>
        showCarrierInput && quote.carrier ? (
          <CarrierBadge code={quote.carrier} size="sm" showName />
        ) : (
          firstFilledValue(quote.carrier, selectedQuote?.preferred_carrier) || 'N/A'
        ),
    },
    { label: 'POL', getValue: (quote) => getRouteValue(quote, 'pol') },
    { label: 'POD', getValue: (quote) => getRouteValue(quote, 'pod') },
    {
      label: 'Tiempo de transito',
      emphasis: 'transit',
      getValue: (quote) => {
        const transitDays = getValidTransitDays(quote)
        return transitDays ? `${transitDays} dias` : firstFilledValue(quote.transit_time, quote.transit) || 'N/A'
      },
    },
    {
      label: 'Dias libres',
      getValue: (quote) =>
        firstFilledValue(
          quote.free_days_destination,
          quote.free_days,
          quote.dias_libres
        ) || 'N/A',
    },
    {
      label: 'Ocean Freight',
      getValue: (quote) =>
        formatNullableCurrency(
          firstFilledValue(quote.ocean_freight, quote.base_cost, quote.costo),
          formatCurrency,
          quote.moneda || 'USD'
        ),
    },
    {
      label: 'EXW / Consolidation Fee',
      getValue: (quote) =>
        formatNullableCurrency(
          firstFilledValue(quote.exw_amount, quote.exw_cost, quote.consolidation_fee),
          formatCurrency
        ),
    },
    {
      label: editableCharges[0].label,
      getValue: (quote) => renderEditableChargeInput(quote, editableCharges[0]),
    },
    ...editableCharges.slice(1).map((config) => ({
      label: config.label,
      getValue: (quote: AgentQuote) => renderEditableChargeInput(quote, config),
    })),
    {
      label: 'Bank Transfer Fee',
      getValue: () => `USD ${formatCurrency(bankTransferFee)}`,
    },
    {
      label: 'Costo',
      emphasis: 'cost',
      getValue: (quote) => `USD ${formatCurrency(getAgentQuoteBaseCost(quote))}`,
    },
    {
      label: `ISV ${taxRate}%`,
      getValue: (quote) => {
        const storedTax = firstNumericValue(quote.isv, quote.tax_amount, quote.tax)
        const optionalChargesTax = getOptionalChargesTax(quote)

        return formatNullableCurrency(
          storedTax + optionalChargesTax,
          formatCurrency
        )
      },
    },
    {
      label: 'Total',
      emphasis: 'total',
      getValue: (quote) => (
        <div>
          <p>USD {formatCurrency(getAdjustedTotalCost(quote))}</p>
          <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Ajustado en tabla
          </p>
        </div>
      ),
    },
    {
      label: 'Validez',
      getValue: (quote) => formatDisplayDate(quote.valid_until || quote.validity_date),
    },
    { label: 'ETD', getValue: (quote) => formatDisplayDate(quote.etd) },
  ]

  const handlePrintAgentCosts = () => {
    if (!printableTableRef.current) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('El navegador bloqueo la ventana de impresion.')
      return
    }

    const printableTable = printableTableRef.current.cloneNode(true) as HTMLDivElement
    const sourceInputs = printableTableRef.current.querySelectorAll('input')
    const clonedInputs = printableTable.querySelectorAll('input')

    clonedInputs.forEach((input, index) => {
      const value = (sourceInputs[index] as HTMLInputElement | undefined)?.value || '0'
      const amount = document.createElement('span')
      amount.className = 'print-amount'
      amount.textContent = `USD ${formatCurrency(toFiniteNumber(value))}`
      input.closest('label')?.replaceWith(amount)
    })

    agentQuotes.forEach((quote, index) => {
      const columnNumber = index + 2
      const columnCells = printableTable.querySelectorAll(
        `thead th:nth-child(${columnNumber}), tbody td:nth-child(${columnNumber})`
      )

      if (quote.id === adjustedBestCostQuoteId) {
        columnCells.forEach((cell) => cell.classList.add('print-best-cost'))
      }
      if (quote.id === fastestQuoteId) {
        columnCells.forEach((cell) => cell.classList.add('print-fastest'))
      }
      if (quote.id === selectedAgentQuoteId || quote.is_selected) {
        columnCells.forEach((cell) => cell.classList.add('print-selected'))
      }
    })

    printableTable.querySelectorAll('span.rounded-full').forEach((badge) => {
      const label = badge.textContent?.trim().toLowerCase()
      if (label === 'mejor costo') badge.classList.add('print-best-badge')
      if (label === 'mas rapido') badge.classList.add('print-fastest-badge')
      if (label === 'seleccionada') badge.classList.add('print-selected-badge')
    })

    printableTable.querySelectorAll('tbody > tr').forEach((row) => {
      const rowLabel = row.querySelector('th')?.textContent?.trim().toLowerCase()
      if (rowLabel === 'total') row.classList.add('print-total-row')

      if (rowLabel === 'naviera / carrier') {
        agentQuotes.forEach((quote, index) => {
          const carrier = getCarrier(String(quote.carrier || ''))
          const cell = row.querySelector(`td:nth-child(${index + 2})`)
          if (!cell || !carrier) return

          const carrierLabel = document.createElement('span')
          carrierLabel.className = 'print-carrier-label'
          carrierLabel.textContent = carrier.name
          carrierLabel.style.backgroundColor = carrier.bg
          carrierLabel.style.color = carrier.text
          cell.replaceChildren(carrierLabel)
        })
      }
    })

    printableTable.querySelector('tbody > tr:last-child')?.remove()

    const quotationReference = firstFilledValue(
      selectedQuote?.quotation_number,
      selectedQuote?.quote_number,
      selectedQuote?.numero_cotizacion
    )
    const title = quotationReference
      ? `Costos de agentes - ${quotationReference}`
      : 'Costos de agentes'

    printWindow.document.open()
    printWindow.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title></title>
          <style>
            @page { size: A4 landscape; margin: 8mm; }
            * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            body {
              width: min(1120px, calc(100vw - 32px));
              margin: 24px auto;
              color: #0f172a;
              font-family: Arial, sans-serif;
            }
            h1 { margin: 0 0 2mm; color: #0f3d66; font-size: 14pt; }
            .meta { margin: 0 0 4mm; color: #475569; font-size: 8pt; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5pt; }
            th, td { border: 0.25mm solid #b8c9dc; padding: 1.8mm 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
            th:first-child { width: 34mm; background: #eaf1f8 !important; color: #173b61; text-align: right; text-transform: uppercase; font-size: 6.7pt; }
            thead th { background: #edf3f9 !important; color: #102f50; font-weight: 700; }
            .print-best-cost { background: #e3f7ec !important; }
            .print-fastest:not(.print-best-cost) { background: #fff3d6 !important; }
            thead .print-selected { box-shadow: inset 0 0 0 0.6mm #60a5fa; }
            p { margin: 0; }
            .space-y-1\\.5 > * + *, .space-y-2 > * + * { margin-top: 1mm; }
            .flex { display: flex; }
            .flex-wrap { flex-wrap: wrap; }
            .gap-1\\.5 { gap: 1mm; }
            span.rounded-full { display: inline-block; border-radius: 999px; padding: 0.5mm 1.4mm; font-size: 6pt; font-weight: 700; }
            .print-best-badge { border: 0.2mm solid #6ee7a8; background: #bff0d3 !important; color: #08643a; }
            .print-fastest-badge { border: 0.2mm solid #f2c55c; background: #ffe3a3 !important; color: #8a4b08; }
            .print-selected-badge { border: 0.2mm solid #8bbcf5; background: #cfe5ff !important; color: #174f91; }
            .print-carrier-label { display: inline-block; border-radius: 1mm; padding: 0.6mm 1.5mm; font-weight: 700; }
            .print-amount { display: block; font-weight: 700; }
            .print-total-row > th,
            .print-total-row > td {
              border-top: 0.55mm solid #37688f;
              border-bottom: 0.55mm solid #37688f;
              background: #dceaf6 !important;
              color: #092f52;
              font-size: 8pt;
              font-weight: 800;
            }
            .print-total-row p { font-weight: 800 !important; }
            .print-total-row p + p { color: #315a7a; font-size: 6.5pt; }
            img { max-width: 12mm; max-height: 4mm; object-fit: contain; }
            tr { break-inside: avoid; }
            @media print {
              body { width: auto; margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1></h1>
          <p class="meta">Comparativo interno de costos FCL</p>
          <main></main>
        </body>
      </html>`)
    printWindow.document.close()
    printWindow.document.title = title
    printWindow.document.querySelector('h1')!.textContent = title
    printWindow.document.querySelector('main')!.appendChild(printableTable)
    printWindow.focus()
    window.setTimeout(() => printWindow.print(), 250)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handlePrintAgentCosts}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          <Printer className="h-4 w-4" />
          Imprimir Costos Agentes
        </button>
        <button
          type="button"
          onClick={onSaveTable}
          className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          Guardar tabla
        </button>
      </div>

      <div
        ref={printableTableRef}
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      >
        <table className="min-w-max border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 w-52 border-b border-r border-slate-200 bg-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              Concepto
            </th>
            {agentQuotes.map((quote) => {
              const isBestCost = quote.id === adjustedBestCostQuoteId
              const isFastest = quote.id === fastestQuoteId
              const isSelected = quote.id === selectedAgentQuoteId || quote.is_selected

              return (
                <th
                  key={quote.id}
                  className={cn(
                    'min-w-52 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 align-top dark:border-slate-800 dark:bg-slate-900/70',
                    isBestCost && 'bg-emerald-50 dark:bg-emerald-950/30',
                    isFastest && !isBestCost && 'bg-amber-50 dark:bg-amber-950/30',
                    isSelected && 'ring-2 ring-inset ring-blue-300 dark:ring-blue-700'
                  )}
                >
                  <div className="space-y-2">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {getAgentQuoteProviderName(quote)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isSelected && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                          Seleccionada
                        </span>
                      )}
                      {isBestCost && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                          Mejor costo
                        </span>
                      )}
                      {isFastest && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-200">
                          Mas rapido
                        </span>
                      )}
                    </div>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th className="sticky left-0 z-10 w-52 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {row.label}
              </th>
              {agentQuotes.map((quote) => {
                const isBestCost = quote.id === adjustedBestCostQuoteId
                const isFastest = quote.id === fastestQuoteId

                return (
                  <td
                    key={`${quote.id}-${row.label}`}
                    className={cn(
                      'border-b border-r border-slate-200 px-4 py-3 text-slate-700 dark:border-slate-800 dark:text-slate-200',
                      isBestCost && 'bg-emerald-50/70 dark:bg-emerald-950/20',
                      isFastest && !isBestCost && 'bg-amber-50/70 dark:bg-amber-950/20',
                      row.emphasis === 'total' && 'text-base font-bold text-slate-950 dark:text-white',
                      row.emphasis === 'cost' && 'font-semibold',
                      row.emphasis === 'transit' && isFastest && 'font-semibold text-amber-800 dark:text-amber-200'
                    )}
                  >
                    {row.getValue(quote)}
                  </td>
                )
              })}
            </tr>
          ))}

          <tr>
            <th className="sticky left-0 z-10 w-52 border-r border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              Accion
            </th>
            {agentQuotes.map((quote) => {
              const isSelected = quote.id === selectedAgentQuoteId || quote.is_selected

              return (
                <td
                  key={`${quote.id}-action`}
                  className="border-r border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <button
                    type="button"
                    disabled={isPricingActionDisabled || isSelected}
                    onClick={() => onSelectQuote(quote)}
                    className={cn(
                      'w-full rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                      isSelected
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'
                    )}
                  >
                    {isSelected ? 'Tarifa seleccionada' : 'Seleccionar tarifa'}
                  </button>
                </td>
              )
            })}
          </tr>
        </tbody>
        </table>
      </div>
    </div>
  )
}
