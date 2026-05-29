'use client'

import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

export function useDropdownPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>
) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  useEffect(() => {
    if (!open || !triggerRef.current) return

    function update() {
      const rect = triggerRef.current!.getBoundingClientRect()

      setPos({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, triggerRef])

  return pos
}
