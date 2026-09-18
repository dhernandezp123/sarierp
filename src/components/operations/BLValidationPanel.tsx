import { AlertTriangle, CheckCircle2, FileCheck2, RefreshCw, ShieldCheck, Undo2 } from 'lucide-react'
import type {
  BlConsistencyField,
  BlConsistencyWarning,
  BlReadinessItem,
  BlValidationException,
} from '@/src/lib/bl-document-workflow'
import { isBlValidationExceptionMatch } from '@/src/lib/bl-document-workflow'
import { cardClass } from '@/src/lib/ui-classes'

export function BLValidationPanel({
  transitionLabel,
  blocking,
  recommended,
  consistencyWarnings,
  validationExceptions,
  locked,
  canManageExceptions,
  onUseSource,
  onJustify,
  onRevoke,
}: {
  transitionLabel: string | null
  blocking: BlReadinessItem[]
  recommended: BlReadinessItem[]
  consistencyWarnings: BlConsistencyWarning[]
  validationExceptions: BlValidationException[]
  locked: boolean
  canManageExceptions: boolean
  onUseSource: (field: BlConsistencyField, value: string) => void
  onJustify: (warning: BlConsistencyWarning) => void
  onRevoke: (exception: BlValidationException) => void
}) {
  const hasBlocking = blocking.length > 0
  const warningExceptions = new Map(
    consistencyWarnings.map((warning) => [
      warning,
      validationExceptions.find((exception) =>
        isBlValidationExceptionMatch(exception, warning)
      ),
    ])
  )
  const unresolvedWarnings = consistencyWarnings.filter(
    (warning) => !warningExceptions.get(warning)
  )
  const justifiedWarnings = consistencyWarnings.filter(
    (warning) => warningExceptions.get(warning)
  )
  const hasWarnings = recommended.length > 0 || unresolvedWarnings.length > 0

  return (
    <section
      className={`${cardClass} border-l-4 ${
        hasBlocking
          ? 'border-l-red-500'
          : hasWarnings
            ? 'border-l-amber-500'
            : 'border-l-emerald-500'
      }`}
      aria-labelledby="bl-validation-title"
    >
      <div className="flex items-start gap-3">
        {hasBlocking || hasWarnings ? (
          <AlertTriangle
            className={`mt-0.5 h-5 w-5 shrink-0 ${hasBlocking ? 'text-red-500' : 'text-amber-500'}`}
          />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="bl-validation-title" className="font-semibold text-slate-900 dark:text-white">
                Validación documental
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {transitionLabel
                  ? `Preparación para: ${transitionLabel}`
                  : 'Revisión contra las fuentes operativas vigentes'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
              <span className={`rounded-full px-2.5 py-1 ${hasBlocking ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                {blocking.length} bloqueo(s)
              </span>
              <span className={`rounded-full px-2.5 py-1 ${hasWarnings ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {recommended.length + unresolvedWarnings.length} revisión(es)
              </span>
            </div>
          </div>

          {!hasBlocking && !hasWarnings && validationExceptions.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Los datos mínimos están completos y coinciden con las fuentes disponibles.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {hasBlocking && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
                    Debes completar antes de avanzar
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {blocking.map((item) => (
                      <li key={String(item.field)} className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {recommended.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Información recomendada
                  </p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {recommended.map((item) => item.label).join(', ')}.
                  </p>
                </div>
              )}

              {unresolvedWarnings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Diferencias que requieren revisión
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Pueden ser excepciones documentales válidas. Confirma antes de emitir; no se reemplazan automáticamente.
                  </p>
                  <div className="mt-3 space-y-2">
                    {unresolvedWarnings.map((warning) => (
                      <div
                        key={`${warning.kind}-${warning.field}-${warning.sourceLabel}`}
                        className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 text-sm">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {warning.label}
                            </p>
                            <p className="mt-1 break-words text-slate-600 dark:text-slate-300">
                              Documento: <span className="font-medium">{warning.documentValue}</span>
                            </p>
                            <p className="mt-0.5 break-words text-slate-500 dark:text-slate-400">
                              {warning.sourceLabel}: <span className="font-medium">{warning.sourceValue}</span>
                            </p>
                          </div>
                          {warning.kind === 'source_mismatch' && !locked && (
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => onUseSource(warning.field, warning.sourceValue)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:bg-slate-950 dark:text-amber-300 dark:hover:bg-amber-950/50"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Usar fuente
                              </button>
                              {canManageExceptions && (
                                <button
                                  type="button"
                                  onClick={() => onJustify(warning)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                                >
                                  <FileCheck2 className="h-3.5 w-3.5" />
                                  Justificar diferencia
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {justifiedWarnings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Excepciones vigentes
                  </p>
                  <div className="mt-2 space-y-2">
                    {justifiedWarnings.map((warning) => {
                      const exception = warningExceptions.get(warning)!
                      return (
                        <div
                          key={exception.id}
                          className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 text-sm">
                              <p className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
                                <FileCheck2 className="h-4 w-4" />
                                {warning.label}: excepción justificada
                              </p>
                              <p className="mt-1 break-words text-slate-700 dark:text-slate-300">
                                {exception.reason}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {exception.created_by_name} · {new Intl.DateTimeFormat('es-HN', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                }).format(new Date(exception.created_at))}
                              </p>
                            </div>
                            {!locked && canManageExceptions && (
                              <button
                                type="button"
                                onClick={() => onRevoke(exception)}
                                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Revocar
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {validationExceptions.length > 0 && (
                <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Historial de excepciones ({validationExceptions.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {validationExceptions.map((exception) => (
                      <div key={exception.id} className="text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">{exception.field_name}</span>
                        {' · '}
                        {exception.status === 'ACTIVE'
                          ? 'Vigente'
                          : exception.status === 'REVOKED'
                            ? 'Revocada'
                            : 'Reemplazada'}
                        {' · '}
                        {exception.created_by_name}
                        <p className="mt-0.5 break-words text-slate-500 dark:text-slate-400">
                          {exception.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
