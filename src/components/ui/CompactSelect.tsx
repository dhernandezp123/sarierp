'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import { useDropdownPosition } from './useComboboxPortal'

export type SelectOption = { value: string; label: string; description?: string; disabled?: boolean }
type CompactSelectProps = {
  value: string; onValueChange: (value: string) => void; options: SelectOption[]
  'aria-label': string; id?: string; disabled?: boolean; placeholder?: string
  className?: string; searchable?: boolean; ref?: Ref<HTMLButtonElement>
}
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')

/** A bounded list using the same portal/viewport positioning as the client picker. */
export function CompactSelect({ value, onValueChange, options, id, disabled = false, placeholder = 'Seleccionar', className, searchable = options.length > 8, ref, 'aria-label': label }: CompactSelectProps) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [highlighted, setHighlighted] = useState(0)
  const [inline, setInline] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null)
  const listId = useId(), expanded = open && !disabled
  const selected = options.find(option => option.value === value)
  const filtered = query ? options.filter(option => normalize(`${option.label} ${option.description || ''}`).includes(normalize(query))) : options
  const active = Math.max(0, Math.min(highlighted, filtered.length - 1))
  const position = useDropdownPosition(expanded, trigger, true)
  const height = Math.min(280, position.maxHeight)
  useEffect(() => {
    if (!expanded) return
    function outside(event: PointerEvent) {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) { setOpen(false); setQuery('') }
    }
    function escape(event: KeyboardEvent) {
      if(event.key!=='Escape')return
      // Handle before modal libraries' document capture listener dismisses the dialog.
      event.preventDefault();event.stopPropagation();setOpen(false);setQuery('');trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('keydown',escape,true)
    const timer = window.setTimeout(() => input.current?.focus(), 0)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown',escape,true);window.clearTimeout(timer) }
  }, [expanded])
  useEffect(() => {
    if (expanded) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, expanded, query])
  function close(restoreFocus = true) { setOpen(false); setQuery(''); if (restoreFocus) trigger.current?.focus() }
  function begin() {
    setInline(Boolean(trigger.current?.closest('[role="dialog"]')))
    setQuery('');setHighlighted(Math.max(0, options.findIndex(option => option.value === value && !option.disabled)));setOpen(true)
  }
  function choose(option: SelectOption) {
    if (disabled || option.disabled) return
    onValueChange(option.value); close()
  }
  function move(direction: number) {
    let next = active + direction
    while (next >= 0 && next < filtered.length) {
      if (!filtered[next].disabled) { setHighlighted(next); return }
      next += direction
    }
  }
  function keys(event: ReactKeyboardEvent) {
    if (disabled) return
    if (!expanded) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); begin()
      }
      return
    }
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(1); break
      case 'ArrowUp': event.preventDefault(); move(-1); break
      case 'Home': event.preventDefault(); setHighlighted(Math.max(0, filtered.findIndex(option => !option.disabled))); break
      case 'End': event.preventDefault(); setHighlighted(Math.max(0, filtered.findLastIndex(option => !option.disabled))); break
      case 'Enter': event.preventDefault(); if (filtered[active]) choose(filtered[active]); break
      case ' ': if (!searchable) { event.preventDefault(); if (filtered[active]) choose(filtered[active]) } break
      case 'Escape': event.preventDefault(); event.stopPropagation(); close(); break
      case 'Tab': close(); break
      default:
        if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const next = filtered.findIndex(option => !option.disabled && normalize(option.label).startsWith(normalize(event.key)))
          if (next >= 0) { event.preventDefault(); setHighlighted(next) }
        }
    }
  }
  const menu = <div ref={popup} data-compact-select-panel="" style={inline
    ? { position: 'absolute', top: position.above ? undefined : 'calc(100% + 6px)', bottom: position.above ? 'calc(100% + 6px)' : undefined, left: 0, width: '100%', maxHeight: height, zIndex: 9999 }
    : { position: 'absolute', top: position.top, left: position.left, width: position.width, maxWidth: '28rem', maxHeight: height, transform: position.above ? 'translateY(-100%)' : undefined, visibility: position.width ? 'visible' : 'hidden', zIndex: 9999 }}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_-10px_rgba(15,23,42,0.25)] dark:border-slate-700 dark:bg-slate-900">
      {searchable && <div className="mb-1 flex shrink-0 items-center gap-2 border-b border-slate-100 px-2 py-2 dark:border-slate-800"><Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" /><input ref={input} type="search" autoComplete="off" aria-label={`Buscar: ${label}`} aria-controls={listId} aria-activedescendant={filtered.length ? `${listId}-${active}` : undefined} placeholder="Buscar…" className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white" value={query} onChange={event => { setQuery(event.target.value); setHighlighted(0) }} onKeyDown={keys} /></div>}
      <ul id={listId} ref={list} role="listbox" aria-label={label} className="min-h-0 overflow-y-auto overscroll-contain">
        {filtered.map((option, index) => <li id={`${listId}-${index}`} key={option.value} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
          onPointerMove={() => { if (!option.disabled) setHighlighted(index) }} onPointerDown={event => event.preventDefault()} onClick={event => {event.preventDefault();event.stopPropagation();choose(option)}}
          className={cn('flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm', option.disabled ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700 dark:text-slate-200', index === active && !option.disabled && 'bg-orange-50 dark:bg-orange-950/40')}>
          <span className="min-w-0 flex-1"><span className="block break-words">{option.label}</span>{option.description && <span className="mt-0.5 block break-words text-xs text-slate-500">{option.description}</span>}</span>{option.value === value && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-300" />}
        </li>)}
      </ul>
      {!filtered.length && <p role="status" className="px-3 py-4 text-sm text-slate-500">Sin resultados.</p>}
    </div>
  return <div className={cn('relative w-full min-w-0 max-w-md', className)}>
    <button ref={element => { trigger.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element }}
      id={id} type="button" role="combobox" aria-label={label} aria-expanded={expanded} aria-haspopup="listbox"
      aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && filtered.length ? `${listId}-${active}` : undefined}
      disabled={disabled} onKeyDown={keys} onClick={() => expanded ? close(false) : begin()}
      className="flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900">
      <span title={selected?.label} className="min-w-0 truncate">{selected?.label || placeholder}</span><ChevronDown aria-hidden="true" className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', expanded && 'rotate-180')} />
    </button>
    {expanded && (inline ? menu : createPortal(menu, document.body))}
  </div>
}
