import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/src/lib/utils'

export const financeActionClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'

export const financeLinkClass = 'font-semibold text-[#B3282D] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 dark:text-rose-300'

/** Cabecera única de Finanzas y Contabilidad: el eyebrow identifica el área. */
export function FinancePageHeader({ title, description, icon: Icon, actions, eyebrow = 'Finanzas' }: { title: ReactNode; description?: ReactNode; icon: LucideIcon; actions?: ReactNode; eyebrow?: string }) {
  // Las acciones bajan de línea antes de comprimir el título (Facturación tiene seis).
  return <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
    <div className="flex min-w-0 flex-1 basis-80 items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-[#B3282D] dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"><Icon aria-hidden="true" className="h-6 w-6" /></div>
      <div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3282D] dark:text-rose-300">{eyebrow}</p><h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}</div>
    </div>{actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
  </header>
}

const tones = {
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  rose: 'bg-rose-50 text-[#B3282D] dark:bg-rose-950/40 dark:text-rose-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
}
export function FinanceMetric({ label, value, detail, icon: Icon, tone = 'slate' }: { label: string; value: string; detail?: string; icon: LucideIcon; tone?: keyof typeof tones }) {
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p><span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', tones[tone])}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span></div>
    <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-950 tabular-nums dark:text-white">{value}</p>{detail && <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>}
  </div>
}

export function FinanceEmptyState({ title, description, icon: Icon, children }: { title: string; description: string; icon: LucideIcon; children?: ReactNode }) {
  return <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900/30 sm:px-8 sm:py-14">
    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-rose-50 text-[#B3282D] ring-8 ring-rose-50/50 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-950/10"><Icon aria-hidden="true" className="h-7 w-7" /></span>
    <h2 className="mt-6 text-lg font-bold text-slate-900 dark:text-white">{title}</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>{children}
  </section>
}
