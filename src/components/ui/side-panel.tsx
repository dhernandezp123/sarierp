'use client'

import { useEffect, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'
import { FORM_SAVED_EVENT } from '@/src/components/ui/UnsavedChangesGuard'
import { cn } from '@/src/lib/utils'

type SidePanelProps = {
  open: boolean
  /** Se llama al cerrar con la X, Esc, clic fuera o tras confirmar descartar cambios. */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  eyebrow?: string
  /** Acciones fijas en la cabecera (por ejemplo, abrir en página completa). */
  actions?: ReactNode
  children: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

const widths = {
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
}

/**
 * Panel lateral sobre la pantalla de trabajo. El fondo queda desenfocado para
 * conservar el contexto; el panel es sólido para mantener el contraste de los
 * formularios. Si se editó un campo y no se guardó, pide confirmación antes de
 * cerrar. Los formularios internos marcan el guardado con `markFormSaved()`.
 */
export function SidePanel({ open, onClose, title, description, eyebrow, actions, children, size = 'xl' }: SidePanelProps) {
  // El portal monta el contenido después del primer render: se usa un ref de estado.
  const [body, setBody] = useState<HTMLDivElement | null>(null)
  const [dirty, setDirty] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const scope = body
    if (!open || !scope) return
    const markDirty = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-unsaved-ignore]')) return
      if (target.matches('input:not([readonly]):not([disabled]):not([type=file]), select:not([disabled]), textarea:not([readonly]):not([disabled])')) setDirty(true)
    }
    const reset = () => setDirty(false)
    scope.addEventListener('input', markDirty, true)
    scope.addEventListener('change', markDirty, true)
    window.addEventListener(FORM_SAVED_EVENT, reset)
    return () => {
      scope.removeEventListener('input', markDirty, true)
      scope.removeEventListener('change', markDirty, true)
      window.removeEventListener(FORM_SAVED_EVENT, reset)
    }
  }, [open, body])

  useEffect(() => {
    if (!open || !dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [open, dirty])

  const close = () => {
    setDirty(false)
    setConfirmOpen(false)
    onClose()
  }
  const requestClose = () => {
    if (dirty) setConfirmOpen(true)
    else close()
  }

  return <>
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-md duration-300 ease-drawer data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none dark:bg-black/50" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-white/40 bg-[#F5F7FA] shadow-2xl outline-none duration-300 ease-drawer data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right motion-reduce:animate-none dark:border-slate-700 dark:bg-[#060b16] sm:rounded-l-3xl',
            widths[size]
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-[#0b1220]/90 sm:rounded-tl-3xl sm:px-6">
            <div className="min-w-0">
              {eyebrow && <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#B3282D] dark:text-rose-300">{eyebrow}</p>}
              <DialogPrimitive.Title className="text-xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</DialogPrimitive.Title>
              {description
                ? <DialogPrimitive.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">Panel lateral</DialogPrimitive.Description>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <button type="button" onClick={requestClose} aria-label="Cerrar panel" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                <XIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </header>
          <div ref={setBody} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={(next) => { if (!next) setConfirmOpen(false) }}
      title="Cambios sin guardar"
      description="Tienes cambios sin guardar en este panel. Si lo cierras ahora se perderán."
      confirmLabel="Cerrar sin guardar"
      cancelLabel="Seguir editando"
      danger
      onConfirm={close}
    />
  </>
}
