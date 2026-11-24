'use client'

import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import { DialogContent } from '@/src/components/ui/dialog'
import { costIconTones } from '@/src/components/pricing/CostStatus'
import type { OperationTone } from '@/src/components/operations/OperationsWorkspace'
import { cn } from '@/src/lib/utils'

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-3xl',
}

const iconSurfaces: Record<OperationTone, string> = {
  slate: 'bg-slate-100 dark:bg-slate-800',
  sky: 'bg-sky-50 dark:bg-sky-950/40',
  amber: 'bg-amber-50 dark:bg-amber-950/40',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40',
  red: 'bg-red-50 dark:bg-red-950/40',
}

/**
 * Contenedor común de los diálogos cortos de Operaciones. Mantiene la API de
 * `DialogContent` (cabecera, título, descripción y pie siguen siendo los de
 * `ui/dialog`) y les da el mismo aspecto: fondo desenfocado, panel sólido,
 * icono con tono semántico, eyebrow y pie fijo al final del contenido.
 */
export function OperationDialogContent({
  className,
  size = 'md',
  icon: Icon,
  tone = 'slate',
  eyebrow = 'Operaciones',
  children,
  ...props
}: ComponentProps<typeof DialogContent> & {
  size?: keyof typeof sizes
  icon: LucideIcon
  tone?: OperationTone
  eyebrow?: string
}) {
  return (
    <DialogContent
      overlayClassName="bg-slate-950/30 backdrop-blur-md dark:bg-black/50"
      className={cn(
        'max-h-[90vh] gap-4 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl ring-0 dark:border-slate-700 dark:bg-[#0b1220] dark:text-white',
        sizes[size],
        '[&_[data-slot=dialog-title]]:text-lg [&_[data-slot=dialog-title]]:font-bold [&_[data-slot=dialog-title]]:leading-tight [&_[data-slot=dialog-title]]:text-slate-950 dark:[&_[data-slot=dialog-title]]:text-white',
        '[&_[data-slot=dialog-description]]:text-sm [&_[data-slot=dialog-description]]:leading-relaxed [&_[data-slot=dialog-description]]:text-slate-500 dark:[&_[data-slot=dialog-description]]:text-slate-400',
        '[&_[data-slot=dialog-footer]]:sticky [&_[data-slot=dialog-footer]]:bottom-[-1.5rem] [&_[data-slot=dialog-footer]]:-mx-6 [&_[data-slot=dialog-footer]]:-mb-6 [&_[data-slot=dialog-footer]]:mt-2 [&_[data-slot=dialog-footer]]:rounded-b-2xl [&_[data-slot=dialog-footer]]:border-slate-200 [&_[data-slot=dialog-footer]]:bg-slate-50/95 [&_[data-slot=dialog-footer]]:px-6 [&_[data-slot=dialog-footer]]:py-4 [&_[data-slot=dialog-footer]]:backdrop-blur dark:[&_[data-slot=dialog-footer]]:border-slate-800 dark:[&_[data-slot=dialog-footer]]:bg-slate-900/95',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5 pr-8">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', iconSurfaces[tone], costIconTones[tone])}>
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3282D] dark:text-rose-300">{eyebrow}</p>
      </div>
      {children}
    </DialogContent>
  )
}
