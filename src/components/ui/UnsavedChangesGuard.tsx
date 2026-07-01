'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'

export const FORM_SAVED_EVENT = 'sari:form-saved'

/**
 * Marca el formulario actual como guardado para que el guard deje de avisar.
 * Llamar después de un guardado exitoso cuando la página no navega a otra ruta.
 */
export function markFormSaved() {
  window.dispatchEvent(new Event(FORM_SAVED_EVENT))
}

/**
 * Guard de cambios sin guardar (UX-003).
 *
 * Montado dentro de un formulario largo, detecta edición mediante eventos
 * `input`/`change` del documento y a partir de ahí:
 * - Muestra el aviso nativo del navegador al refrescar o cerrar la pestaña.
 * - Intercepta clics en links internos (sidebar, topbar, breadcrumbs) y pide
 *   confirmación con modal custom antes de abandonar la página.
 *
 * La navegación programática (`router.push` tras guardar) no se intercepta,
 * por lo que los flujos de guardado existentes no requieren cambios; si la
 * página guarda y permanece en la ruta, debe llamar a `markFormSaved()`.
 */
export function UnsavedChangesGuard({ active = true }: { active?: boolean }) {
  const router = useRouter()
  const [dirty, setDirty] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  const guarding = active && dirty

  useEffect(() => {
    if (!active) return

    const markDirty = () => setDirty(true)
    const resetDirty = () => setDirty(false)

    document.addEventListener('input', markDirty, true)
    document.addEventListener('change', markDirty, true)
    window.addEventListener(FORM_SAVED_EVENT, resetDirty)
    return () => {
      document.removeEventListener('input', markDirty, true)
      document.removeEventListener('change', markDirty, true)
      window.removeEventListener(FORM_SAVED_EVENT, resetDirty)
    }
  }, [active])

  useEffect(() => {
    if (!guarding) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [guarding])

  useEffect(() => {
    if (!guarding) return

    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href') || ''
      if (!href.startsWith('/')) return
      if (anchor.target && anchor.target !== '_self') return

      const current = window.location.pathname + window.location.search
      if (href === current) return

      event.preventDefault()
      event.stopPropagation()
      setPendingHref(href)
    }

    document.addEventListener('click', onClickCapture, true)
    return () => document.removeEventListener('click', onClickCapture, true)
  }, [guarding])

  return (
    <ConfirmDialog
      open={pendingHref !== null}
      onOpenChange={(open) => { if (!open) setPendingHref(null) }}
      title="Cambios sin guardar"
      description="Tienes cambios sin guardar en este formulario. Si sales ahora se perderán."
      confirmLabel="Salir sin guardar"
      cancelLabel="Seguir editando"
      danger
      onConfirm={() => {
        if (!pendingHref) return
        setDirty(false)
        router.push(pendingHref)
      }}
    />
  )
}
