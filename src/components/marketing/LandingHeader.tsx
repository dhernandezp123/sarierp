'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import { PLATFORM_MARKETING_NAME, PLATFORM_MARKETING_POSITIONING } from '@/src/lib/platform-branding'
import { landingNavigation } from './landing-content'

export function LandingHeader() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }}>
      <nav aria-label="Navegación principal" className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-8">
        <Link href="/" aria-label={`${PLATFORM_MARKETING_NAME}, inicio`} className="flex shrink-0 items-center gap-2.5">
          <Image src="/brand/isotipo-color.png" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="text-sm font-bold tracking-tight text-[#07111F]">{PLATFORM_MARKETING_NAME}<span className="mt-0.5 hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:block">{PLATFORM_MARKETING_POSITIONING}</span></span>
        </Link>
        <div className="hidden items-center gap-7 lg:flex">
          {landingNavigation.map((link) => <a key={link.href} href={link.href} className="text-sm font-medium text-slate-600 transition-colors hover:text-[#0038BD]">{link.label}</a>)}
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/login" className="hidden sm:inline-flex px-2 py-2.5 text-sm font-semibold text-[#07111F] hover:text-[#0038BD]">Ingresar</Link>
          <a href="#demo" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0038BD] px-3 py-2.5 text-sm sm:px-5 font-semibold text-white shadow-sm shadow-blue-950/15 transition-colors hover:bg-[#002a90]">Solicitar demo <ArrowRight className="hidden sm:block" size={15} aria-hidden="true" /></a>
          <button ref={buttonRef} type="button" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => setOpen(!open)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 lg:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>
      <div id="landing-mobile-menu" hidden={!open} className="max-h-[70dvh] overflow-y-auto border-t border-slate-200 px-5 pb-5 lg:hidden">
        {landingNavigation.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-sm font-medium hover:bg-slate-50">{link.label}</a>)}
        <Link href="/login" className="block rounded-lg px-3 py-3 text-sm font-semibold text-[#0038BD] sm:hidden">Ingresar</Link>
      </div>
    </header>
  )
}
