'use client'

/** Barra fija con el resumen de la cotización y sus acciones. */
export function QuotationActionBar({
  quotationSummary,
  isMiamiFlow,
  isCustomsFlow,
  canUseMiamiCalculator,
  loading,
  handlePreviewMiamiPdf,
  handleSubmit,
}: {
  quotationSummary: string[]
  isMiamiFlow: boolean
  isCustomsFlow: boolean
  canUseMiamiCalculator: boolean
  loading: boolean
  handlePreviewMiamiPdf: () => void
  handleSubmit: (status: string) => void
}) {
  return (
    <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-700/60 dark:bg-[#0b1220]/95">
      <div className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
        {quotationSummary.length > 0 ? (
          <p className="truncate font-medium text-slate-700 dark:text-slate-200">
            {quotationSummary.join(' · ')}
          </p>
        ) : (
          <p>Selecciona cliente y producto para comenzar.</p>
        )}
        <p className="mt-0.5 text-slate-400 dark:text-slate-500">
          El número de cotización se genera automáticamente al guardar.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
      {(isMiamiFlow || isCustomsFlow) && (
        <button
          type="button"
          onClick={handlePreviewMiamiPdf}
          disabled={!isCustomsFlow && !canUseMiamiCalculator}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Previsualizar PDF
        </button>
      )}

      <button
        type="button"
        onClick={() => handleSubmit('Borrador')}
        disabled={loading}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Guardar borrador
      </button>

      <button
        type="button"
        onClick={() => handleSubmit('Pendiente de Fijar Precios')}
        disabled={loading}
        className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        {loading
          ? 'Guardando...'
          : isMiamiFlow || isCustomsFlow
            ? 'Crear cotización aprobada'
            : 'Enviar a Pricing'}
      </button>
      </div>
    </div>
  )
}
