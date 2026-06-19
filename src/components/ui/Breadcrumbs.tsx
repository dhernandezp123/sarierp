import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type BreadcrumbItem = {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-600" />
          )}
          {item.href && i < items.length - 1 ? (
            <Link
              href={item.href}
              className="transition hover:text-slate-900 dark:hover:text-white"
            >
              {item.label}
            </Link>
          ) : (
            <span
              className={
                i === items.length - 1
                  ? 'font-medium text-slate-900 dark:text-white'
                  : ''
              }
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}
