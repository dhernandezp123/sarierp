'use client'

import {
  DEMO_DOCUMENT_NOTICE,
  IS_DEMO_ENVIRONMENT,
} from '@/src/lib/demo-environment'

export function DemoPrintWatermark() {
  if (!IS_DEMO_ENVIRONMENT) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999] hidden items-center justify-center print:flex"
    >
      <div className="-rotate-12 border-4 border-rose-500/25 px-12 py-8 text-center text-rose-600/25">
        <p className="text-5xl font-black tracking-[0.18em]">AMBIENTE DEMO</p>
        <p className="mt-3 max-w-3xl text-xl font-bold tracking-[0.08em]">
          {DEMO_DOCUMENT_NOTICE}
        </p>
      </div>
    </div>
  )
}
