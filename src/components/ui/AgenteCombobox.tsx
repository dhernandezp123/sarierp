'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { cn } from '@/src/lib/utils'
import { useDropdownPosition } from './useComboboxPortal'

type Agente = {
  id: string
  name?: string | null
  type?: string | null
  country?: string | null
  city?: string | null
}

type AgenteComboboxProps = {
  agents: Agente[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

const getAgentLabel = (agent?: Agente | null) => {
  if (!agent) return ''

  return `${agent.name || 'Sin nombre'} - ${agent.country || 'Sin pais'}`
}

export function AgenteCombobox({
  agents,
  value,
  onChange,
  placeholder = 'Seleccionar agente/proveedor',
  className,
  disabled = false,
}: AgenteComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const [mounted, setMounted] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const selected = agents.find((agent) => agent.id === value) ?? null

  const filtered = query.trim()
    ? agents.filter((agent) =>
        `${agent.name || ''} ${agent.type || ''} ${agent.country || ''} ${
          agent.city || ''
        }`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : agents

  const pos = useDropdownPosition(open, triggerRef)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node

      if (
        triggerRef.current?.contains(target) ||
        dropRef.current?.contains(target)
      ) {
        return
      }

      setOpen(false)
      setQuery('')
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return

    setTimeout(() => inputRef.current?.focus(), 0)
    setHighlighted(0)
  }, [open])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const item = list.children[highlighted] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  const selectAgent = useCallback(
    (agent: Agente) => {
      onChange(agent.id)
      setOpen(false)
      setQuery('')
    },
    [onChange]
  )

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (
        event.key === 'Enter' ||
        event.key === ' ' ||
        event.key === 'ArrowDown'
      ) {
        event.preventDefault()
        setOpen(true)
      }

      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setHighlighted((current) => Math.min(current + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setHighlighted((current) => Math.max(current - 1, 0))
        break
      case 'Enter':
        event.preventDefault()
        if (filtered[highlighted]) selectAgent(filtered[highlighted])
        break
      case 'Escape':
        setOpen(false)
        setQuery('')
        break
    }
  }

  const dropdown = (
    <div
      ref={dropRef}
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
      }}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlighted(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar por agente, pais, ciudad o tipo..."
          className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Limpiar
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
          No se encontro ningun agente.
        </div>
      ) : (
        <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
          {filtered.map((agent, index) => {
            const isSelected = agent.id === value
            const isHighlighted = index === highlighted

            return (
              <li
                key={agent.id}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => selectAgent(agent)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
                  isHighlighted
                    ? 'bg-slate-100 dark:bg-slate-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                  isSelected && 'bg-slate-50 dark:bg-slate-800/40'
                )}
              >
                <Check
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-slate-900 dark:text-white',
                    isSelected ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-white">
                      {agent.name || 'Sin nombre'}
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {agent.country || 'Sin pais'}
                    </span>
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {agent.type || 'Tipo N/A'}
                    {agent.city ? ` - ${agent.city}` : ''}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {query && filtered.length > 0 && (
        <div className="border-t border-slate-100 px-3 py-1.5 dark:border-slate-800">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  )

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          className,
          'flex items-center justify-between text-left transition-colors',
          'hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10',
          'dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600',
          disabled && 'cursor-not-allowed opacity-50',
          open && 'border-slate-400 ring-2 ring-slate-900/10 dark:border-slate-500'
        )}
      >
        <span className={cn('truncate', !selected && 'text-slate-400 dark:text-slate-500')}>
          {selected ? getAgentLabel(selected) : placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {mounted && open && createPortal(dropdown, document.body)}
    </div>
  )
}
