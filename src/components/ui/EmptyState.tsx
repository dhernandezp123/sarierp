import type { ReactNode } from 'react'
import Link from 'next/link'
import { Inbox } from 'lucide-react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; href?: string; onClick?: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{description}</p>
        )}
      </div>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
