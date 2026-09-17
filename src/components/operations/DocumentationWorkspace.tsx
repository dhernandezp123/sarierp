import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileStack,
  LockKeyhole,
} from 'lucide-react'
import type {
  DocumentationWorkspaceItem,
  DocumentationWorkspaceStatus,
} from '@/src/lib/documentation-workspace'
import { cardClass } from '@/src/lib/ui-classes'
import { cn } from '@/src/lib/utils'

const statusPresentation: Record<
  DocumentationWorkspaceStatus,
  {
    label: string
    icon: typeof CheckCircle2
    badgeClass: string
    iconClass: string
  }
> = {
  complete: {
    label: 'Completo',
    icon: CheckCircle2,
    badgeClass:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    iconClass: 'text-emerald-500',
  },
  in_progress: {
    label: 'En curso',
    icon: Clock3,
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    iconClass: 'text-blue-500',
  },
  missing: {
    label: 'Falta información',
    icon: AlertTriangle,
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    iconClass: 'text-amber-500',
  },
  blocked: {
    label: 'Bloqueado',
    icon: LockKeyhole,
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    iconClass: 'text-red-500',
  },
  not_started: {
    label: 'Por iniciar',
    icon: CircleDashed,
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    iconClass: 'text-slate-400',
  },
}

export function DocumentationWorkspace({
  items,
  reference,
}: {
  items: DocumentationWorkspaceItem[]
  reference: string
}) {
  const completeCount = items.filter((item) => item.status === 'complete').length
  const attentionCount = items.filter((item) =>
    ['missing', 'blocked'].includes(item.status)
  ).length
  const actionOrder: DocumentationWorkspaceItem['id'][] = [
    'shipping_instruction',
    'booking',
    'readiness',
    'mbl',
    'hbl',
    'attachments',
    'arrival_notice',
  ]
  const nextItem = actionOrder
    .map((id) => items.find((item) => item.id === id))
    .find((item) => item && item.status !== 'complete')

  return (
    <section className={cn(cardClass, 'border-blue-100 dark:border-blue-900/50')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <FileStack className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">
              Documentation Workspace
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              Expediente documental · {reference}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Revisa el estado del embarque y continúa cada documento sin buscar la información en otras pantallas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            {completeCount} completos
          </span>
          <span
            className={cn(
              'rounded-full px-3 py-1.5',
              attentionCount > 0
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            {attentionCount} requieren atención
          </span>
        </div>
      </div>

      {nextItem?.action && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/70 dark:bg-blue-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">
              Siguiente acción sugerida
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {nextItem.label}: {nextItem.summary}
            </p>
          </div>
          <Link
            href={nextItem.action.href}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {nextItem.action.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const presentation = statusPresentation[item.status]
          const StatusIcon = presentation.icon

          return (
            <article
              key={item.id}
              className="flex min-h-56 flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="flex items-start justify-between gap-3">
                <StatusIcon className={cn('mt-0.5 h-5 w-5 shrink-0', presentation.iconClass)} />
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', presentation.badgeClass)}>
                  {presentation.label}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">
                {item.label}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {item.summary}
              </p>
              <p className="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">
                Responsable: {item.owner}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {item.details.map((detail) => (
                  <li key={detail} className="line-clamp-2">
                    · {detail}
                  </li>
                ))}
              </ul>
              {item.action && (
                <Link
                  href={item.action.href}
                  className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:text-blue-200"
                >
                  {item.action.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
