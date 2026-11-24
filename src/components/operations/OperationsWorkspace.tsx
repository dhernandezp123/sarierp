import type { ReactNode } from 'react'
import {
  Anchor,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileClock,
  PackageCheck,
  Save,
  Ship,
  type LucideIcon,
} from 'lucide-react'
import { CostStatusBadge, costIconTones, type CostTone } from '@/src/components/pricing/CostStatus'
import { cn } from '@/src/lib/utils'

export type OperationTone = CostTone

const completed = new Set(['Finalizado', 'Finalizada', 'Entregado', 'Liberado', 'Emitido'])
const moving = new Set(['Embarcado', 'En Tránsito', 'Arribo Parcial', 'Arribo parcial', 'Arribado', 'En gestión aduanera'])
const confirmed = new Set(['Booking Confirmado', 'Parcialmente Confirmado', 'Parcialmente confirmado', 'Listo para Embarque', 'Validada', 'Listo para Booking'])
const waiting = new Set(['Pendiente Validación', 'Asignado', 'En Booking', 'Booking Solicitado', 'Documentación Pendiente', 'En proceso'])

/** Color e icono por estado; el texto del estado siempre se muestra. */
export function operationStatusPresentation(status: string | null | undefined): { tone: OperationTone; icon: LucideIcon } {
  const value = (status || '').trim()
  if (!value || value === 'Sin bookings') return { tone: 'slate', icon: CircleDashed }
  if (value === 'Cancelada' || value === 'Cancelado') return { tone: 'red', icon: Ban }
  if (completed.has(value)) return { tone: 'emerald', icon: CheckCircle2 }
  if (moving.has(value)) return { tone: 'sky', icon: value.startsWith('Arrib') ? Anchor : Ship }
  if (confirmed.has(value)) return { tone: 'emerald', icon: PackageCheck }
  if (value === 'Documentación Pendiente') return { tone: 'amber', icon: FileClock }
  if (waiting.has(value)) return { tone: 'amber', icon: Clock3 }
  return { tone: 'slate', icon: CircleDashed }
}

export function OperationStatusBadge({ status, fallback = 'Sin estado', className }: { status: string | null | undefined; fallback?: string; className?: string }) {
  const { tone, icon } = operationStatusPresentation(status)
  return <CostStatusBadge tone={tone} icon={icon} className={className}>{status || fallback}</CostStatusBadge>
}

export type OperationStep = {
  label: string
  state: 'done' | 'current' | 'pending' | 'blocked'
  detail?: string
}

const stepStyles: Record<OperationStep['state'], { dot: string; text: string; sr: string }> = {
  done: { dot: 'border-emerald-500 bg-emerald-500 text-white', text: 'text-slate-900 dark:text-white', sr: 'completado' },
  current: { dot: 'border-[#B3282D] bg-rose-50 text-[#B3282D] ring-4 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-950/40', text: 'text-[#B3282D] dark:text-rose-300', sr: 'paso actual' },
  pending: { dot: 'border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900', text: 'text-slate-500 dark:text-slate-400', sr: 'pendiente' },
  blocked: { dot: 'border-red-400 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300', text: 'text-red-700 dark:text-red-300', sr: 'detenido' },
}

/** Ruta de la operación: el paso actual se marca con color, número y texto. */
export function OperationStepper({ steps, label }: { steps: OperationStep[]; label: string }) {
  return <ol aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
    {steps.map((step, index) => {
      const style = stepStyles[step.state]
      return <li key={step.label} aria-current={step.state === 'current' ? 'step' : undefined} className="flex min-w-0 items-start gap-3">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums', style.dot)}>
          {step.state === 'done' ? <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> : index + 1}
        </span>
        <span className="min-w-0">
          <span className={cn('block text-sm font-semibold leading-tight', style.text)}>{step.label}<span className="sr-only"> ({style.sr})</span></span>
          {step.detail && <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-slate-400">{step.detail}</span>}
        </span>
      </li>
    })}
  </ol>
}

export function OperationSectionTitle({ icon: Icon, tone = 'slate', title, description, actions }: { icon: LucideIcon; tone?: OperationTone; title: string; description?: ReactNode; actions?: ReactNode }) {
  const surface = {
    slate: 'bg-slate-100 dark:bg-slate-800',
    sky: 'bg-sky-50 dark:bg-sky-950/40',
    amber: 'bg-amber-50 dark:bg-amber-950/40',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40',
    red: 'bg-red-50 dark:bg-red-950/40',
  }[tone]
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', surface, costIconTones[tone])}><Icon aria-hidden="true" className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0"><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>{description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}</div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
}

export const operationPrimaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#B3282D] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#9a2227] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950'

export const operationSecondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'

export const operationDangerButtonClass = 'inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/30'

/**
 * Barra fija con el único botón de guardado de la pantalla. Muestra si hay
 * cambios pendientes con texto e icono, no solo con color.
 */
export function OperationSaveBar({ dirty, saving, onSave, disabled, saveLabel = 'Guardar cambios', children }: { dirty: boolean; saving: boolean; onSave: () => void; disabled?: boolean; saveLabel?: string; children?: ReactNode }) {
  return <div data-unsaved-ignore className="sticky bottom-3 z-20 mt-6 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-700 dark:bg-[#0b1220]/95">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p role="status" className={cn('flex items-center gap-2 text-sm font-medium', dirty ? 'text-amber-800 dark:text-amber-200' : 'text-slate-500 dark:text-slate-400')}>
        {dirty ? <FileClock aria-hidden="true" className="h-4 w-4 text-amber-600 dark:text-amber-300" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />}
        {saving ? 'Guardando cambios...' : dirty ? 'Tienes cambios sin guardar' : 'Todos los cambios están guardados'}
      </p>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {children}
        <button type="button" onClick={onSave} disabled={disabled || saving || !dirty} className={operationSecondaryButtonClass}>
          <Save aria-hidden="true" className="h-4 w-4" />{saving ? 'Guardando...' : saveLabel}
        </button>
      </div>
    </div>
  </div>
}
