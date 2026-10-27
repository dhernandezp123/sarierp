'use client'

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

export function useDropdownPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  fitViewport = false
) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 360, above: false })

  useEffect(() => {
    if (!open || !triggerRef.current) return

    function update() {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      const viewport = window.visualViewport
      const viewportTop = viewport?.offsetTop || 0
      const viewportLeft = viewport?.offsetLeft || 0
      const viewportWidth = viewport?.width || window.innerWidth
      const viewportBottom = viewportTop + (viewport?.height || window.innerHeight)
      const below = viewportBottom - rect.bottom - 12
      const aboveSpace = rect.top - viewportTop - 12
      const above = fitViewport && below < 240 && aboveSpace > below
      const width = fitViewport ? Math.min(rect.width, viewportWidth - 24) : rect.width

      const next = {
        top: (above ? rect.top - 6 : rect.bottom + 6) + window.scrollY,
        left: (fitViewport ? Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + viewportWidth - width - 12)) : rect.left) + window.scrollX,
        width,
        maxHeight: fitViewport ? Math.max(0, Math.min(360, above ? aboveSpace : below)) : 360,
        above,
      }
      setPos(current => current.top === next.top && current.left === next.left && current.width === next.width && current.maxHeight === next.maxHeight && current.above === next.above ? current : next)
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [fitViewport, open, triggerRef])

  return pos
}
