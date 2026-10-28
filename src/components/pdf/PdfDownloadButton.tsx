'use client'

import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from 'react'
import { pdf, type DocumentProps } from '@react-pdf/renderer'
import { toast } from 'sonner'

type PdfDownloadButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'onClick'> & {
  document: ReactElement<DocumentProps>
  fileName: string
  children: ReactNode | ((state: { loading: boolean }) => ReactNode)
}

/** Generates the current document on click, without PDF work while a form is edited. */
export function PdfDownloadButton({ document: pdfDocument, fileName, children, disabled, ...props }: PdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const urls = useRef(new Map<string, number>())

  useEffect(() => {
    mounted.current = true
    const ownedUrls = urls.current
    return () => {
      mounted.current = false
      for (const [url, timer] of ownedUrls) {
        window.clearTimeout(timer)
        URL.revokeObjectURL(url)
      }
      ownedUrls.clear()
    }
  }, [])

  const download = async () => {
    if (disabled || inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      // Keep document and filename from the same click, even if the user keeps editing.
      const blob = await pdf(pdfDocument).toBlob()
      if (!mounted.current) return
      const url = URL.createObjectURL(blob)
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url)
        urls.current.delete(url)
      }, 60000)
      urls.current.set(url, timer)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      try { link.click() } finally { link.remove() }
    } catch (error) {
      if (mounted.current) toast.error('No se pudo generar el PDF. Intenta nuevamente.', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }

  return (
    <button {...props} type="button" disabled={disabled || loading} aria-busy={loading || undefined} onClick={download}>
      {typeof children === 'function' ? children({ loading }) : children}
    </button>
  )
}
