import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/src/lib/utils'

export type CostTone = 'slate' | 'sky' | 'amber' | 'emerald' | 'red'

const badgeTones: Record<CostTone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200',
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
}

const noticeTones: Record<CostTone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
  sky: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
  red: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
}

export const costIconTones: Record<CostTone, string> = {
  slate: 'text-slate-500 dark:text-slate-400',
  sky: 'text-sky-600 dark:text-sky-300',
  amber: 'text-amber-600 dark:text-amber-300',
  emerald: 'text-emerald-600 dark:text-emerald-300',
  red: 'text-red-600 dark:text-red-300',
}

/** Estado con color, icono y texto: el color nunca es la única señal. */
export function CostStatusBadge({ tone, icon: Icon, children, className }: { tone: CostTone; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', badgeTones[tone], className)}>
    {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}<span className="min-w-0">{children}</span>
  </span>
}

export function CostNotice({ tone, icon: Icon, children, className, role }: { tone: CostTone; icon: LucideIcon; children: ReactNode; className?: string; role?: 'status' | 'alert' }) {
  return <div role={role} className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm leading-relaxed', noticeTones[tone], className)}>
    <Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', costIconTones[tone])} /><div className="min-w-0">{children}</div>
  </div>
}

/** Barra de avance con texto visible; el porcentaje también se anuncia. */
export function CostProgress({ done, total, label, tone }: { done: number; total: number; label: string; tone: CostTone }) {
  const percent = total > 0 ? Math.round(done / total * 100) : 0
  const bar = { slate: 'bg-slate-400', sky: 'bg-sky-500', amber: 'bg-amber-500', emerald: 'bg-emerald-500', red: 'bg-red-500' }[tone]
  return <div>
    <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-600 dark:text-slate-300"><span>{label}</span><span className="tabular-nums">{done} de {total}</span></div>
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} de ${total} (${percent}%)`}>
      <div className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', bar)} style={{ width: `${percent}%` }} />
    </div>
  </div>
}

export const financialStatusTone = (status: string | null | undefined): CostTone => status === 'Validado' ? 'emerald' : 'amber'

export function operationalStatusTone(status: string | null | undefined): CostTone {
  if (!status) return 'slate'
  if (['Finalizado', 'Finalizada', 'Entregado'].includes(status)) return 'emerald'
  if (['Cancelada', 'Cancelado'].includes(status)) return 'slate'
  if (/tr[aá]nsito|embarcado|arribado|zarpado/i.test(status)) return 'sky'
  return 'amber'
}

export const quotationStatusTone = (status: string | null | undefined): CostTone =>
  status === 'Ganada' ? 'emerald' : status === 'Perdida' ? 'red' : status === 'Pendiente de Fijar Precios' ? 'amber' : 'sky'
