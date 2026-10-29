'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type BreadcrumbItem = {
  label: string
  href?: string
}

export function Breadcrumbs({ items, automatic=false }: { items: BreadcrumbItem[];automatic?:boolean }) {
  const [expanded,setExpanded]=useState(false)
  const trail=items[0]?.href==='/dashboard'||items[0]?.label==='Inicio'?items:[{label:'Inicio',href:'/dashboard'},...items]
  return (
    <nav data-page-breadcrumbs={automatic?undefined:''} aria-label="Ruta de navegación" className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-2">{trail.map((item, i) => <li key={i} className={`${i>0&&i<trail.length-2&&!expanded?'hidden sm:flex':'flex'} min-w-0 items-center gap-1 break-words`}>
          {i > 0 && (
            <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-600" />
          )}
          {item.href && i < trail.length - 1 ? (
            <Link
              href={item.href}
              className="max-w-44 rounded break-words transition hover:text-[#B3282D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:hover:text-rose-300 sm:max-w-none"
            >
              {item.label}
            </Link>
          ) : (
            <span
              aria-current={i === trail.length - 1 ? 'page' : undefined}
              className={
                i === trail.length - 1
                  ? 'font-medium text-slate-900 dark:text-white'
                  : ''
              }
            >
              {item.label}
            </span>
          )}
        </li>).flatMap((element,index)=>index===0&&trail.length>3?[element,<li key="expand" className="flex items-center gap-1 sm:hidden"><ChevronRight aria-hidden="true" className="h-3 w-3"/><button type="button" aria-label={expanded?'Abreviar ruta':'Mostrar ruta completa'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="rounded px-2 py-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:hover:bg-slate-800">…</button></li>]:[element])}</ol>
    </nav>
  )
}
