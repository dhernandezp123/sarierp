'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, LoaderCircle, Search, UsersRound, X } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import { clientInitials, searchClients, type ClientOption } from '@/src/lib/client-search'
import { useDropdownPosition } from './useComboboxPortal'

type ClienteComboboxProps = {
  clientes: ClientOption[]; value: string; onChange: (id: string) => void
  id?: string; placeholder?: string; className?: string; disabled?: boolean; loading?: boolean; renderInline?: boolean
  'aria-label'?: string; 'aria-describedby'?: string
}

export function ClienteCombobox({ clientes, value, onChange, id, placeholder = 'Seleccionar cliente', className, disabled = false, loading = false, renderInline = false, 'aria-label': ariaLabel, 'aria-describedby': describedBy }: ClienteComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null), inputRef = useRef<HTMLInputElement>(null), listRef = useRef<HTMLUListElement>(null), dropRef = useRef<HTMLDivElement>(null)
  const listId = useId(), searchId = useId()
  const expanded = open && !disabled && !loading
  const selected = clientes.find(client => client.id === value)
  const filtered = useMemo(() => searchClients(clientes, query), [clientes, query])
  const active = Math.max(0, Math.min(highlighted, filtered.length - 1))
  const pos = useDropdownPosition(expanded && !renderInline, triggerRef, true)

  useEffect(() => {
    if (!expanded) return
    function outside(event: PointerEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || dropRef.current?.contains(target)) return
      setOpen(false); setQuery('')
    }
    document.addEventListener('pointerdown', outside)
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => { document.removeEventListener('pointerdown', outside); clearTimeout(timer) }
  }, [expanded])
  useEffect(() => {
    if (expanded) (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
  }, [active, expanded, query])

  function close(restoreFocus = false) {
    setOpen(false); setQuery('')
    if (restoreFocus) triggerRef.current?.focus()
  }
  function select(client: ClientOption) {
    if (disabled || loading) return
    onChange(client.id); close(true)
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (disabled || loading) return
    if (!expanded) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); setQuery(''); setHighlighted(0); setOpen(true)
      }
      return
    }
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setHighlighted(Math.min(active + 1, Math.max(0, filtered.length - 1))); break
      case 'ArrowUp': event.preventDefault(); setHighlighted(Math.max(active - 1, 0)); break
      case 'Enter': event.preventDefault(); if (filtered[active]) select(filtered[active]); break
      case 'Escape': event.preventDefault(); close(true); break
      case 'Tab': close(true); break
    }
  }

  const dropdown = <div ref={dropRef} style={renderInline ? { position: 'absolute', top: 'calc(100% + 0.5rem)', left: 0, width: '100%', zIndex: 9999, maxHeight: 360 } : { position: 'absolute', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, maxHeight: pos.maxHeight, transform: pos.above ? 'translateY(-100%)' : undefined, visibility: pos.width ? 'visible' : 'hidden' }} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_48px_-12px_rgba(15,23,42,0.28)] dark:border-slate-700 dark:bg-slate-900">
    <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      <input ref={inputRef} id={searchId} type="search" autoComplete="off" value={query} onChange={event => { setQuery(event.target.value); setHighlighted(0) }} onKeyDown={handleKeyDown} aria-label="Buscar cliente por nombre, código o RTN" aria-controls={listId} aria-activedescendant={filtered.length ? `${listId}-${active}` : undefined} placeholder="Nombre, código o RTN…" className="min-w-0 flex-1 bg-transparent py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white [&::-webkit-search-cancel-button]:hidden" />
      {query && <button type="button" aria-label="Limpiar búsqueda de clientes" onClick={() => { setQuery(''); setHighlighted(0); inputRef.current?.focus() }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>}
    </div>
    <ul id={listId} ref={listRef} role="listbox" aria-label="Clientes" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5" style={{ maxHeight: renderInline ? 256 : Math.max(0, pos.maxHeight - 96) }}>
      {filtered.map((client, index) => {
        const isSelected = client.id === value
        return <li key={client.id} id={`${listId}-${index}`} role="option" aria-selected={isSelected} onMouseEnter={() => setHighlighted(index)} onClick={() => select(client)} className={cn('flex min-h-16 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', index === active ? 'bg-blue-50 dark:bg-blue-950/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')}>
          <span aria-hidden="true" className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold', isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300')}>{clientInitials(client.nombre)}</span>
          <span className="min-w-0 flex-1"><span className={cn('block break-words text-sm leading-snug', isSelected ? 'font-semibold text-blue-800 dark:text-blue-200' : 'font-medium text-slate-800 dark:text-slate-100')}>{client.nombre || 'Sin nombre'}</span><span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400"><span>{client.codigo_cliente || 'Sin código'}</span>{client.rtn && <span>RTN {client.rtn}</span>}</span></span>
          {isSelected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />}
        </li>
      })}
    </ul>
    {!filtered.length && <div role="status" className="px-5 py-6 text-center"><UsersRound aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-slate-300" /><p className="text-sm font-medium text-slate-700 dark:text-slate-200">No encontramos clientes</p><p className="mt-1 text-xs text-slate-500">Prueba otro nombre, código o RTN.</p></div>}
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950/40"><span role="status" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}</span><span aria-hidden="true" className="hidden sm:inline">↑↓ Navegar · Enter Elegir</span></div>
  </div>

  return <div className="relative min-w-0 w-full max-w-lg"><button ref={triggerRef} id={id} type="button" role="combobox" aria-label={ariaLabel || (!id ? `Cliente${selected?.nombre ? ': '+selected.nombre : ''}` : undefined)} aria-describedby={describedBy} aria-controls={expanded ? listId : undefined} aria-haspopup="listbox" aria-expanded={expanded} aria-busy={loading} disabled={disabled || loading} onKeyDown={handleKeyDown} onClick={() => { setQuery(''); setHighlighted(0); setOpen(value => !value) }} className={cn('flex min-h-12 min-w-0 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-left text-sm transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950', className, expanded && 'border-blue-400 ring-2 ring-blue-100 dark:ring-blue-950')}>
    <span className="flex min-w-0 items-center gap-3">{selected && <span aria-hidden="true" className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[10px] font-bold text-blue-700 sm:flex dark:bg-blue-950 dark:text-blue-300">{clientInitials(selected.nombre)}</span>}<span className="min-w-0"><span title={selected?.nombre || undefined} className={cn('block truncate leading-tight', selected ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>{loading ? 'Cargando clientes…' : selected?.nombre || placeholder}</span>{selected && <span className="mt-0.5 block truncate text-[11px] leading-none text-slate-500 dark:text-slate-400">{selected.codigo_cliente || 'Sin código'}{selected.rtn ? ` · RTN ${selected.rtn}` : ''}</span>}</span></span>
    {loading ? <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-slate-400" /> : <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />}
  </button>{expanded && (renderInline ? dropdown : createPortal(dropdown, document.body))}</div>
}
