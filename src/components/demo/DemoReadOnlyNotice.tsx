'use client'

import { LockKeyhole } from 'lucide-react'
import { IS_DEMO_ENVIRONMENT } from '@/src/lib/demo-environment'

export function DemoReadOnlyNotice({
  label = 'Esta configuración es visible, pero sus cambios están bloqueados en el ambiente demo.',
}: {
  label?: string
}) {
  if (!IS_DEMO_ENVIRONMENT) return null

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 dark:border-blue-500/30 dark:bg-blue-950/35 dark:text-blue-100">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Solo lectura — Ambiente Demo</p>
        <p className="mt-0.5 text-xs leading-5 text-blue-800 dark:text-blue-200">
          {label}
        </p>
      </div>
    </div>
  )
}
