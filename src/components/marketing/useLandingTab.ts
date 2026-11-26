'use client'

import { useEffect, useState } from 'react'

// A fragment identifies both the scroll destination and its selected tab.
export function useLandingTab(prefix: string, items: readonly { id: string }[]) {
  const [value, setValue] = useState(items[0].id)
  useEffect(() => {
    function readFragment() {
      const item = items.find(item => window.location.hash === `#${prefix}-${item.id}`)
      if (item) setValue(item.id)
    }
    readFragment()
    window.addEventListener('hashchange', readFragment)
    return () => window.removeEventListener('hashchange', readFragment)
  }, [prefix, items])

  function select(id: string) {
    setValue(id)
    window.history.replaceState(window.history.state, '', `#${prefix}-${id}`)
  }
  return [value, select] as const
}
