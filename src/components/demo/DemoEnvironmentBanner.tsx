'use client'

import { FlaskConical } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import {
  DEMO_NOTICE,
  IS_DEMO_ENVIRONMENT,
} from '@/src/lib/demo-environment'

export function DemoEnvironmentBanner({
  className,
}: {
  className?: string
}) {
  if (!IS_DEMO_ENVIRONMENT) return null

  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 border-y border-amber-300/70 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/45 dark:text-amber-100',
        className
      )}
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{DEMO_NOTICE}</span>
    </div>
  )
}
