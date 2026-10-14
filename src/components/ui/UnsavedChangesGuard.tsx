'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'

export const FORM_SAVED_EVENT = 'sari:form-saved'
const NAVIGATION_EVENT = 'sari:request-navigation'

/** Call only after the server confirms the write. */
export function markFormSaved() {
  window.dispatchEvent(new Event(FORM_SAVED_EVENT))
}

/** Use for cancel/back buttons; successful saves can navigate directly. */
export function requestFormNavigation(action: () => void) {
  const event = new CustomEvent(NAVIGATION_EVENT, { cancelable: true, detail: action })
  if (window.dispatchEvent(event)) action()
}

type TraverseEvent = Event & {
  navigationType: string
  canIntercept: boolean
  destination: { key: string; url: string }
}
type BrowserNavigation = EventTarget & { traverseTo: (key: string) => unknown }

/** Auto detection is scoped to the marker's parent, normally the page wrapper.
 * Controlled editors pass their own dirty state and keep their replacement dialog.
 * Browser history uses the Navigation API when available; beforeunload covers reload.
 */
export function UnsavedChangesGuard({ active = true, dirty: controlledDirty }: { active?: boolean; dirty?: boolean }) {
  const router = useRouter()
  const marker = useRef<HTMLSpanElement>(null)
  const [dirty, setDirty] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const guarding = active && (controlledDirty ?? dirty)

  useEffect(() => {
    if (!active || controlledDirty !== undefined) return
    const scope = marker.current?.parentElement
    if (!scope) return
    const markDirty = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element) || !scope.contains(target)
        || target.closest('[data-unsaved-ignore]')) return
      if (target.matches('input:not([readonly]):not([disabled]), select:not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable="true"]')) setDirty(true)
    }
    const resetDirty = () => setDirty(false)
    scope.addEventListener('input', markDirty, true)
    scope.addEventListener('change', markDirty, true)
    window.addEventListener(FORM_SAVED_EVENT, resetDirty)
    return () => {
      scope.removeEventListener('input', markDirty, true)
      scope.removeEventListener('change', markDirty, true)
      window.removeEventListener(FORM_SAVED_EVENT, resetDirty)
    }
  }, [active, controlledDirty])

  useEffect(() => {
    if (!guarding) return
    const ask = (action: () => void) => setPendingAction(() => action)
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const onRequest = (event: Event) => {
      if (event.defaultPrevented) return
      event.preventDefault()
      ask((event as CustomEvent<() => void>).detail)
    }
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin
        || url.pathname + url.search === window.location.pathname + window.location.search) return
      event.preventDefault()
      event.stopPropagation()
      ask(() => router.push(url.pathname + url.search + url.hash))
    }
    const navigation = (window as Window & { navigation?: BrowserNavigation }).navigation
    let allowTraverse = false
    const onNavigate = (event: Event) => {
      const traverse = event as TraverseEvent
      if (allowTraverse) { allowTraverse = false; return }
      if (traverse.navigationType !== 'traverse' || !traverse.canIntercept || !event.cancelable) return
      event.preventDefault()
      ask(() => { allowTraverse = true; navigation?.traverseTo(traverse.destination.key) })
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener(NAVIGATION_EVENT, onRequest)
    document.addEventListener('click', onClick, true)
    navigation?.addEventListener('navigate', onNavigate)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener(NAVIGATION_EVENT, onRequest)
      document.removeEventListener('click', onClick, true)
      navigation?.removeEventListener('navigate', onNavigate)
    }
  }, [guarding, router])

  return <>
    <span ref={marker} hidden aria-hidden="true" />
    <ConfirmDialog open={pendingAction !== null} onOpenChange={open => { if (!open) setPendingAction(null) }}
      title="Cambios sin guardar" description="Tienes cambios sin guardar en este formulario. Si sales ahora se perderán."
      confirmLabel="Salir sin guardar" cancelLabel="Seguir editando" danger
      onConfirm={() => { const action = pendingAction; setPendingAction(null); action?.() }} />
  </>
}
